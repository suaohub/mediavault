using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using LibVLCSharp.Shared;
using MediaVault.Models;

namespace MediaVault.Services;

/// <summary>
/// Async thumbnail extraction queue backed by LibVLC memory-output callbacks.
/// A single sequential reader ensures we never saturate the decoder.
/// </summary>
public sealed class ThumbnailService : IDisposable
{
    private readonly Channel<(MediaFile, TaskCompletionSource<Bitmap?>)> _channel;
    private readonly CancellationTokenSource _cts = new();

    private const uint ThumbW = 320;
    private const uint ThumbH = 180;  // 16:9 base

    public ThumbnailService()
    {
        _channel = Channel.CreateBounded<(MediaFile, TaskCompletionSource<Bitmap?>)>(
            new BoundedChannelOptions(100)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true
            });

        _ = Task.Run(() => ProcessLoopAsync(_cts.Token));
    }

    public Task<Bitmap?> RequestAsync(MediaFile file)
    {
        var tcs = new TaskCompletionSource<Bitmap?>();
        _channel.Writer.TryWrite((file, tcs));
        return tcs.Task;
    }

    private async Task ProcessLoopAsync(CancellationToken ct)
    {
        await foreach (var (file, tcs) in _channel.Reader.ReadAllAsync(ct))
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var bmp = file.MediaType == Models.MediaType.Video
                    ? await ExtractFrameAsync(file.FilePath, ct)
                    : null;
                tcs.TrySetResult(bmp);
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        }
    }

    private static async Task<Bitmap?> ExtractFrameAsync(string path, CancellationToken ct)
    {
        // Probe duration first so we can seek to 10 %
        long durationMs = 0;
        try
        {
            using var probe = new Media(VlcService.Instance, path, FromType.FromPath);
            await probe.Parse(MediaParseOptions.ParseLocal).WaitAsync(TimeSpan.FromSeconds(8), ct);
            durationMs = probe.Duration;
        }
        catch { /* fall through, will capture first available frame */ }

        var tcs = new TaskCompletionSource<byte[]?>();
        var pixBuf = new byte[ThumbW * ThumbH * 4];
        var handle = GCHandle.Alloc(pixBuf, GCHandleType.Pinned);
        var bufPtr = handle.AddrOfPinnedObject();
        var captured = 0;

        try
        {
            using var media = new Media(VlcService.Instance, path, FromType.FromPath);
            using var mp = new MediaPlayer(media);

            mp.SetVideoFormat("BGRA", ThumbW, ThumbH, ThumbW * 4);
            mp.SetVideoCallbacks(
                (_, planes) => { Marshal.WriteIntPtr(planes, bufPtr); return IntPtr.Zero; },
                null,
                (_, _) =>
                {
                    if (Interlocked.Exchange(ref captured, 1) != 0) return;
                    var copy = new byte[pixBuf.Length];
                    Buffer.BlockCopy(pixBuf, 0, copy, 0, copy.Length);
                    tcs.TrySetResult(copy);
                });

            mp.Play();

            if (durationMs > 2000)
            {
                await Task.Delay(600, ct);
                mp.Time = (long)(durationMs * 0.1);
            }

            var data = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(12), ct);
            mp.Stop();

            return data is null ? null : BgraToWriteableBitmap(data);
        }
        catch { return null; }
        finally { handle.Free(); }
    }

    private static WriteableBitmap BgraToWriteableBitmap(byte[] data)
    {
        var wb = new WriteableBitmap(
            new PixelSize((int)ThumbW, (int)ThumbH),
            new Vector(96, 96),
            PixelFormat.Bgra8888,
            AlphaFormat.Opaque);
        using var fb = wb.Lock();
        Marshal.Copy(data, 0, fb.Address, data.Length);
        return wb;
    }

    public void Dispose()
    {
        _cts.Cancel();
        _channel.Writer.TryComplete();
    }
}

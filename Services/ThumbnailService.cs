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
/// Async thumbnail extraction backed by LibVLC memory-output callbacks.
/// A single sequential reader avoids saturating the decoder.
/// </summary>
public sealed class ThumbnailService : IDisposable
{
    private readonly Channel<(MediaFile, TaskCompletionSource<Bitmap?>)> _channel;
    private readonly CancellationTokenSource _cts = new();

    private const uint ThumbW = 320;
    private const uint ThumbH = 180;

    public ThumbnailService()
    {
        _channel = Channel.CreateBounded<(MediaFile, TaskCompletionSource<Bitmap?>)>(
            new BoundedChannelOptions(100)
            {
                FullMode    = BoundedChannelFullMode.DropOldest,
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
        long durationMs = 0;
        try
        {
            using var probe = new Media(VlcService.Instance, path, FromType.FromPath);
            await probe.Parse(MediaParseOptions.ParseLocal)
                       .WaitAsync(TimeSpan.FromSeconds(8), ct);
            durationMs = probe.Duration;
        }
        catch { /* fall through — capture first available frame */ }

        var frameTcs  = new TaskCompletionSource<byte[]?>();
        var pixBuf    = new byte[ThumbW * ThumbH * 4];
        var handle    = GCHandle.Alloc(pixBuf, GCHandleType.Pinned);
        var bufPtr    = handle.AddrOfPinnedObject();
        var captured  = 0;
        MediaPlayer? mp = null;

        try
        {
            using var media = new Media(VlcService.Instance, path, FromType.FromPath);
            mp = new MediaPlayer(media);

            mp.SetVideoFormat("BGRA", ThumbW, ThumbH, ThumbW * 4);

            // ── All callbacks must be exception-safe: any unhandled exception
            //    inside a native callback will crash the process. ─────────────
            mp.SetVideoCallbacks(
                lockCb: (_, planes) =>
                {
                    try
                    {
                        if (planes != IntPtr.Zero)
                            Marshal.WriteIntPtr(planes, bufPtr);
                    }
                    catch { /* ignore */ }
                    return IntPtr.Zero;
                },
                unlockCb: null,
                displayCb: (_, _) =>
                {
                    if (Interlocked.Exchange(ref captured, 1) != 0) return;
                    try
                    {
                        var copy = new byte[pixBuf.Length];
                        Buffer.BlockCopy(pixBuf, 0, copy, 0, copy.Length);
                        frameTcs.TrySetResult(copy);
                    }
                    catch { frameTcs.TrySetResult(null); }
                });

            mp.Play();

            if (durationMs > 2000)
            {
                await Task.Delay(700, ct).ConfigureAwait(false);
                try { mp.Time = (long)(durationMs * 0.1); } catch { }
            }

            var data = await frameTcs.Task
                           .WaitAsync(TimeSpan.FromSeconds(12), ct)
                           .ConfigureAwait(false);

            return data is null ? null : BgraToWriteableBitmap(data);
        }
        catch { return null; }
        finally
        {
            // Always stop the player before freeing the pinned buffer to
            // prevent the native callback from accessing freed memory.
            try { mp?.Stop(); }    catch { }
            try { mp?.Dispose(); } catch { }

            if (handle.IsAllocated)
                handle.Free();
        }
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

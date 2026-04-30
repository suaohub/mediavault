using System;
using System.IO;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using LibVLCSharp.Shared;
using MediaVault.Models;

namespace MediaVault.Services;

/// <summary>
/// Extracts video thumbnails using LibVLC's built-in TakeSnapshot API.
/// This avoids all native memory-callback plumbing and is safe across GPU drivers.
/// Snapshots are cached as .jpg files in the system temp directory.
/// </summary>
public sealed class ThumbnailService : IDisposable
{
    private readonly Channel<(MediaFile, TaskCompletionSource<Bitmap?>)> _channel;
    private readonly CancellationTokenSource _cts = new();
    private readonly string _cacheDir;

    // Limit concurrency: only 1 snapshot at a time to avoid GPU/driver contention
    private const int ThumbW = 320;
    private const int ThumbH = 180;

    public ThumbnailService()
    {
        _cacheDir = Path.Combine(Path.GetTempPath(), "MediaVault_Thumbs");
        Directory.CreateDirectory(_cacheDir);

        _channel = Channel.CreateBounded<(MediaFile, TaskCompletionSource<Bitmap?>)>(
            new BoundedChannelOptions(200)
            {
                FullMode     = BoundedChannelFullMode.DropOldest,
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
                Bitmap? bmp = null;
                if (file.MediaType == Models.MediaType.Video)
                    bmp = await Task.Run(() => ExtractSnapshot(file), ct);
                tcs.TrySetResult(bmp);
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        }
    }

    private Bitmap? ExtractSnapshot(MediaFile file)
    {
        // Use a stable filename so we don't re-extract on every launch
        var hash   = Math.Abs(file.FilePath.GetHashCode()).ToString("x8");
        var outPath = Path.Combine(_cacheDir, $"{hash}.jpg");

        if (!System.IO.File.Exists(outPath))
            RenderSnapshot(file.FilePath, outPath);

        if (!System.IO.File.Exists(outPath)) return null;

        try
        {
            // Load into memory then release the file handle immediately
            using var stream = System.IO.File.OpenRead(outPath);
            return new Bitmap(stream);
        }
        catch { return null; }
    }

    private static void RenderSnapshot(string videoPath, string outPath)
    {
        // Use a dedicated LibVLC instance with software rendering to avoid
        // GPU driver issues entirely (--vout=dummy forces software path).
        using var vlc = new LibVLC(
            "--quiet",
            "--no-audio",
            "--no-osd",
            "--no-video-title-show",
            "--verbose=0",
            "--vout=dummy");          // software-only, no GPU/DirectX involved

        using var media  = new Media(vlc, videoPath, FromType.FromPath);
        using var player = new MediaPlayer(vlc);

        player.Media = media;

        // Mute and play briefly to reach a decodeable frame
        player.Volume = 0;

        var ready = new ManualResetEventSlim(false);
        long seekTarget = 0;

        player.Playing += (_, _) =>
        {
            try
            {
                // Seek to 10 % into the video once we know the duration
                var dur = player.Length;
                if (dur > 2000)
                    seekTarget = (long)(dur * 0.10);
                ready.Set();
            }
            catch { ready.Set(); }
        };

        player.Play();

        // Wait for playing state (max 8 s)
        if (!ready.Wait(8000)) goto cleanup;

        if (seekTarget > 0)
        {
            player.Time = seekTarget;
            Thread.Sleep(600);   // let the decoder reach the seek position
        }
        else
        {
            Thread.Sleep(500);
        }

        // TakeSnapshot writes directly to disk — no memory buffers, no callbacks
        player.TakeSnapshot(0, outPath, (uint)ThumbW, (uint)ThumbH);

        // Small delay so the file is fully flushed before we return
        Thread.Sleep(300);

        cleanup:
        try { player.Stop(); }  catch { }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _channel.Writer.TryComplete();
    }
}

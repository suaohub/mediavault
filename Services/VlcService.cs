using LibVLCSharp.Shared;

namespace MediaVault.Services;

/// <summary>
/// Holds the single shared LibVLC instance and provides factory methods for
/// lightweight MediaPlayer objects.
/// </summary>
public static class VlcService
{
    private static readonly Lazy<LibVLC> _instance = new(() =>
        new LibVLC(
            "--quiet",
            "--no-video-title-show",
            "--no-snapshot-preview",
            "--no-osd",
            "--verbose=0"
            // NOTE: Do NOT pass --avcodec-hw=any here — it can crash on certain
            // GPU drivers. Let LibVLC auto-select the best hardware decoder.
        ));

    public static LibVLC Instance => _instance.Value;

    public static MediaPlayer CreatePlayer() => new(Instance);
}

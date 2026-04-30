using LibVLCSharp.Shared;

namespace MediaVault.Services;

/// <summary>
/// Holds the single shared LibVLC instance (expensive to create) and
/// provides factory methods for lightweight MediaPlayer objects.
/// </summary>
public static class VlcService
{
    private static readonly Lazy<LibVLC> _instance = new(() =>
        new LibVLC("--quiet", "--no-video-title-show", "--no-snapshot-preview", "--avcodec-hw=any"));

    public static LibVLC Instance => _instance.Value;

    public static MediaPlayer CreatePlayer() => new(Instance);
}

using System;

namespace MediaVault.Models;

public enum MediaType { Video, Audio }

public enum AspectClass
{
    R16x9,  // 16:9 standard landscape
    R4x3,   // 4:3 classic
    R9x16,  // 9:16 portrait / vertical
    R1x1,   // 1:1 square  (audio files)
    R21x9   // 21:9 ultra-wide
}

public static class AspectClassHelper
{
    public static double ToRatio(this AspectClass ac) => ac switch
    {
        AspectClass.R16x9 => 16.0 / 9.0,
        AspectClass.R4x3  => 4.0  / 3.0,
        AspectClass.R9x16 => 9.0  / 16.0,
        AspectClass.R1x1  => 1.0,
        AspectClass.R21x9 => 21.0 / 9.0,
        _                 => 16.0 / 9.0
    };

    public static AspectClass Detect(int? w, int? h, MediaType type)
    {
        if (type == MediaType.Audio) return AspectClass.R1x1;
        if (w is null or 0 || h is null or 0) return AspectClass.R16x9;

        double r = (double)w.Value / h.Value;
        return r switch
        {
            > 2.1  => AspectClass.R21x9,
            > 1.55 => AspectClass.R16x9,
            > 1.2  => AspectClass.R4x3,
            < 0.75 => AspectClass.R9x16,
            _      => AspectClass.R1x1
        };
    }
}

public class MediaFile
{
    public string  Id        { get; init; } = Guid.NewGuid().ToString();
    public string  Name      { get; init; } = string.Empty;
    public string  FilePath  { get; init; } = string.Empty;
    public MediaType MediaType { get; init; }
    public long    Size      { get; init; }
    public double? Duration  { get; init; }
    public int?    Width     { get; init; }
    public int?    Height    { get; init; }
    public AspectClass AspectClass { get; init; }
    public string  FolderId  { get; init; } = "__root__";
    public DateTime AddedAt  { get; init; } = DateTime.UtcNow;

    public string FormattedDuration => Duration.HasValue
        ? TimeSpan.FromSeconds(Duration.Value).ToString(Duration.Value >= 3600.0 ? @"h\:mm\:ss" : @"m\:ss")
        : "--:--";

    public string FormattedSize => Size switch
    {
        < 1024L                => $"{Size} B",
        < 1024L * 1024         => $"{Size / 1024.0:F1} KB",
        < 1024L * 1024 * 1024  => $"{Size / (1024.0 * 1024):F1} MB",
        _                      => $"{Size / (1024.0 * 1024 * 1024):F2} GB"
    };

    public string ResolutionText => (Width.HasValue && Height.HasValue)
        ? $"{Width}×{Height}" : string.Empty;
}

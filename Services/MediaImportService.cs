using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using LibVLCSharp.Shared;
using MediaVault.Models;

namespace MediaVault.Services;

public static class MediaImportService
{
    private static readonly HashSet<string> VideoExt = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".flv", ".wmv",
        ".ts", ".hevc", ".h264", ".h265", ".mpeg", ".mpg", ".rm", ".rmvb",
        ".3gp", ".f4v", ".asf", ".vob", ".mts", ".m2ts"
    };

    private static readonly HashSet<string> AudioExt = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".wma",
        ".opus", ".aiff", ".alac", ".ape", ".dsd", ".dsf"
    };

    public static bool IsMedia(string path)
    {
        var ext = Path.GetExtension(path);
        return VideoExt.Contains(ext) || AudioExt.Contains(ext);
    }

    public static Models.MediaType GetType(string path) =>
        VideoExt.Contains(Path.GetExtension(path)) ? Models.MediaType.Video : Models.MediaType.Audio;

    /// <summary>Import a flat list of file paths.</summary>
    public static async Task<List<MediaFile>> ImportFilesAsync(IEnumerable<string> paths)
    {
        var results = new List<MediaFile>();
        foreach (var path in paths.Where(IsMedia))
        {
            var mf = await ProbeAsync(path);
            if (mf is not null) results.Add(mf);
        }
        return results;
    }

    /// <summary>Recursively import a folder, assigning folder-path IDs.</summary>
    public static async Task<(List<MediaFile> files, List<string> folderIds)> ImportFolderAsync(
        string root, string? parentFolderId = null)
    {
        var files     = new List<MediaFile>();
        var folderIds = new List<string>();

        var folderName = Path.GetFileName(root);
        var folderId   = parentFolderId is null ? folderName : $"{parentFolderId}/{folderName}";

        folderIds.Add(folderId);

        try
        {
            foreach (var file in Directory.GetFiles(root))
            {
                if (!IsMedia(file)) continue;
                var mf = await ProbeAsync(file, folderId);
                if (mf is not null) files.Add(mf);
            }

            foreach (var sub in Directory.GetDirectories(root))
            {
                var (subFiles, subFolders) = await ImportFolderAsync(sub, folderId);
                files.AddRange(subFiles);
                folderIds.AddRange(subFolders);
            }
        }
        catch (UnauthorizedAccessException) { }

        return (files, folderIds);
    }

    private static async Task<MediaFile?> ProbeAsync(string path, string folderId = "__root__")
    {
        try
        {
            var info      = new FileInfo(path);
            Models.MediaType mediaType = GetType(path);

            int?    w = null, h = null;
            double? dur = null;

            using var media = new Media(VlcService.Instance, path, FromType.FromPath);
            await media.Parse(MediaParseOptions.ParseLocal).WaitAsync(TimeSpan.FromSeconds(10));

            if (media.Duration > 0)
                dur = media.Duration / 1000.0;

            foreach (var track in media.Tracks)
            {
                if (track.TrackType != TrackType.Video) continue;
                w = (int)track.Data.Video.Width;
                h = (int)track.Data.Video.Height;
                break;
            }

            return new MediaFile
            {
                Name       = Path.GetFileName(path),
                FilePath   = path,
                MediaType  = mediaType,
                Size       = info.Length,
                Duration   = dur,
                Width      = w,
                Height     = h,
                AspectClass = AspectClassHelper.Detect(w, h, (Models.MediaType)mediaType),
                FolderId   = folderId
            };
        }
        catch
        {
            return null;
        }
    }
}

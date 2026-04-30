using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MediaVault.Models;
using MediaVault.Services;

namespace MediaVault.ViewModels;

public enum TypeFilter { All, Video, Audio, Recent }

public partial class MainWindowViewModel : ViewModelBase, IDisposable
{
    private readonly ThumbnailService _thumbs = new();

    // ── Observable state ─────────────────────────────────────────────────────
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Filtered))]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Filtered))]
    private TypeFilter _typeFilter = TypeFilter.All;

    [ObservableProperty] private double _previewSpeed = 3.0;
    [ObservableProperty] private string _currentTheme  = "DarkPurple";
    [ObservableProperty] private bool   _isEmpty        = true;
    [ObservableProperty] private bool   _isImporting;

    public ObservableCollection<MediaCardViewModel> AllItems { get; } = [];
    public ObservableCollection<FolderNode>         Folders  { get; } = [];

    // ── Computed filtered list ────────────────────────────────────────────────
    public IEnumerable<MediaCardViewModel> Filtered
    {
        get
        {
            var q   = SearchQuery.Trim();
            var now = DateTime.UtcNow;

            return AllItems.Where(vm =>
            {
                if (!string.IsNullOrEmpty(q) &&
                    !vm.File.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
                    return false;

                return TypeFilter switch
                {
                    TypeFilter.Video  => vm.File.MediaType == MediaType.Video,
                    TypeFilter.Audio  => vm.File.MediaType == MediaType.Audio,
                    TypeFilter.Recent => (now - vm.File.AddedAt).TotalHours <= 24,
                    _                 => true
                } && IsFolderVisible(vm.File.FolderId);
            });
        }
    }

    private bool IsFolderVisible(string folderId)
    {
        if (folderId == "__root__") return true;
        return FindFolder(Folders, folderId)?.Visible ?? true;
    }

    private static FolderNode? FindFolder(IEnumerable<FolderNode> nodes, string id)
    {
        foreach (var n in nodes)
        {
            if (n.Id == id) return n;
            var found = FindFolder(n.Children, id);
            if (found is not null) return found;
        }
        return null;
    }

    // ── Import commands ───────────────────────────────────────────────────────
    public async Task AddFilesAsync(IEnumerable<string> paths)
    {
        IsImporting = true;
        try
        {
            var files = await MediaImportService.ImportFilesAsync(paths);
            MergeFiles(files);
        }
        finally { IsImporting = false; }
    }

    public async Task AddFolderAsync(string folderPath)
    {
        IsImporting = true;
        try
        {
            var (files, folderIds) = await MediaImportService.ImportFolderAsync(folderPath);
            foreach (var fid in folderIds) EnsureFolder(fid);
            MergeFiles(files);
        }
        finally { IsImporting = false; }
    }

    private void MergeFiles(IEnumerable<MediaFile> files)
    {
        var existing = new HashSet<string>(AllItems.Select(v => v.File.FilePath));
        foreach (var f in files)
        {
            if (existing.Contains(f.FilePath)) continue;
            var vm = new MediaCardViewModel(f, _thumbs);
            vm.PropertyChanged += OnCardPropertyChanged;
            AllItems.Add(vm);
        }
        IsEmpty = AllItems.Count == 0;
        OnPropertyChanged(nameof(Filtered));
    }

    private void OnCardPropertyChanged(object? s, PropertyChangedEventArgs e)
        => OnPropertyChanged(nameof(Filtered));

    private void EnsureFolder(string folderId)
    {
        var parts = folderId.Split('/');
        var col   = Folders;
        string? parentId = null;

        foreach (var part in parts)
        {
            var id  = parentId is null ? part : $"{parentId}/{part}";
            var node = col.FirstOrDefault(n => n.Id == id);
            if (node is null)
            {
                node = new FolderNode { Id = id, Name = part, ParentId = parentId };
                node.PropertyChanged += (_, _) => OnPropertyChanged(nameof(Filtered));
                col.Add(node);
            }
            col      = node.Children;
            parentId = id;
        }
    }

    // ── Simple relay commands ─────────────────────────────────────────────────
    [RelayCommand] private void SetTypeFilter(TypeFilter f) => TypeFilter = f;
    [RelayCommand] private void SetTheme(string t)          => CurrentTheme = t;
    [RelayCommand] private void SetPreviewSpeed(double s)   => PreviewSpeed = s;
    [RelayCommand] private void ClearSearch()               => SearchQuery = string.Empty;

    public void Dispose()
    {
        _thumbs.Dispose();
        foreach (var vm in AllItems) vm.Dispose();
    }
}

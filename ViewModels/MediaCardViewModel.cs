using System;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using MediaVault.Models;
using MediaVault.Services;

namespace MediaVault.ViewModels;

public partial class MediaCardViewModel : ViewModelBase, IDisposable
{
    private readonly ThumbnailService _thumbService;

    [ObservableProperty] private Bitmap? _thumbnail;
    [ObservableProperty] private bool _isLoadingThumbnail = true;

    public MediaFile File { get; }

    public MediaCardViewModel(MediaFile file, ThumbnailService thumbService)
    {
        File         = file;
        _thumbService = thumbService;
        _ = LoadAsync();
    }

    private async Task LoadAsync()
    {
        try   { Thumbnail = await _thumbService.RequestAsync(File); }
        catch { /* ignore, thumbnail stays null */ }
        finally { IsLoadingThumbnail = false; }
    }

    public void Dispose() => Thumbnail?.Dispose();
}

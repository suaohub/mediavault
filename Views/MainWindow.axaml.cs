using System;
using System.Collections.Specialized;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Platform.Storage;
using MediaVault.Controls;
using MediaVault.Models;
using MediaVault.ViewModels;

namespace MediaVault.Views;

public partial class MainWindow : Window
{
    private static readonly double[] PreviewSpeeds = [1.0, 1.5, 2.0, 3.0, 4.0];

    private MainWindowViewModel Vm => (MainWindowViewModel)DataContext!;

    public MainWindow()
    {
        InitializeComponent();

        DataContext = new MainWindowViewModel();

        // Speed box
        SpeedBox.ItemsSource = PreviewSpeeds;
        SpeedBox.SelectedItem = 3.0;
        SpeedBox.SelectionChanged += (_, _) =>
        {
            if (SpeedBox.SelectedItem is double s) Vm.SetPreviewSpeedCommand.Execute(s);
        };

        // Filter buttons
        BtnFilterAll.Click    += (_, _) => Vm.SetTypeFilterCommand.Execute(TypeFilter.All);
        BtnFilterVideo.Click  += (_, _) => Vm.SetTypeFilterCommand.Execute(TypeFilter.Video);
        BtnFilterAudio.Click  += (_, _) => Vm.SetTypeFilterCommand.Execute(TypeFilter.Audio);
        BtnFilterRecent.Click += (_, _) => Vm.SetTypeFilterCommand.Execute(TypeFilter.Recent);

        // Import buttons
        BtnImportFiles.Click  += OnImportFilesClick;
        BtnImportFolder.Click += OnImportFolderClick;

        // Theme box
        ThemeBox.SelectionChanged += OnThemeChanged;

        // Drag-drop
        AddHandler(DragDrop.DragEnterEvent, OnDragEnter);
        AddHandler(DragDrop.DragLeaveEvent, OnDragLeave);
        AddHandler(DragDrop.DropEvent,      OnDrop);

        // MediaCard → open player
        AddHandler(OpenPlayerRoutedEventArgs.Event, OnOpenPlayer);

        // Rebuild grid when filtered items change
        Vm.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(MainWindowViewModel.Filtered)
                               or nameof(MainWindowViewModel.IsEmpty))
                RebuildGrid();
        };

        // Search clear is wired via ClearSearchCommand in the ViewModel
    }

    // ── Import ────────────────────────────────────────────────────────────
    private async void OnImportFilesClick(object? _, Avalonia.Interactivity.RoutedEventArgs __)
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            AllowMultiple = true,
            Title = "选择媒体文件",
            FileTypeFilter =
            [
                new FilePickerFileType("媒体文件")
                {
                    Patterns = ["*.mp4","*.mkv","*.mov","*.avi","*.webm","*.m4v",
                                "*.mp3","*.flac","*.wav","*.m4a","*.aac","*.ogg"]
                },
                FilePickerFileTypes.All
            ]
        });

        var paths = files.Select(f => f.Path.LocalPath).ToList();
        if (paths.Count > 0) await Vm.AddFilesAsync(paths);
    }

    private async void OnImportFolderClick(object? _, Avalonia.Interactivity.RoutedEventArgs __)
    {
        var folders = await StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
        {
            Title = "选择文件夹",
            AllowMultiple = true
        });

        foreach (var folder in folders)
            await Vm.AddFolderAsync(folder.Path.LocalPath);
    }

    // ── Drag & drop ───────────────────────────────────────────────────────
    private void OnDragEnter(object? _, DragEventArgs e)
    {
        if (e.Data.Contains(DataFormats.Files))
        {
            DropZone.IsVisible = true;
            e.DragEffects = DragDropEffects.Copy;
        }
    }

    private void OnDragLeave(object? _, DragEventArgs e)
    {
        DropZone.IsVisible = false;
    }

    private async void OnDrop(object? _, DragEventArgs e)
    {
        DropZone.IsVisible = false;
        if (!e.Data.Contains(DataFormats.Files)) return;

        var items = e.Data.GetFiles();
        if (items is null) return;

        foreach (var item in items)
        {
            if (item is IStorageFolder folder)
                await Vm.AddFolderAsync(folder.Path.LocalPath);
            else if (item is IStorageFile file)
                await Vm.AddFilesAsync([file.Path.LocalPath]);
        }
    }

    // ── Open player ───────────────────────────────────────────────────────
    private void OnOpenPlayer(object? _, OpenPlayerRoutedEventArgs e)
    {
        var vm  = new PlayerViewModel(e.File);
        var win = new PlayerWindow { DataContext = vm };
        vm.CloseRequested += (_, __) => win.Close();
        win.Show();
    }

    // ── Theme switching ───────────────────────────────────────────────────
    private void OnThemeChanged(object? _, SelectionChangedEventArgs e)
    {
        if (ThemeBox.SelectedItem is not ComboBoxItem item) return;
        var tag = item.Tag?.ToString() ?? "DarkPurple";
        App.Current?.ApplyTheme(tag);
    }

    // ── Grid rebuild (ItemsRepeater-free approach, direct children) ───────
    private void RebuildGrid()
    {
        MediaGrid.Children.Clear();
        foreach (var vm in Vm.Filtered)
        {
            var card = new MediaCard { DataContext = vm };
            MediaGrid.Children.Add(card);
        }
    }
}

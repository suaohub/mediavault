using System;
using System.Runtime.InteropServices;
using System.Threading;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using LibVLCSharp.Shared;
using MediaVault.Models;
using MediaVault.Services;
using MediaVault.ViewModels;

namespace MediaVault.Controls;

public partial class MediaCard : UserControl
{
    // ── Preview player resources ──────────────────────────────────────────
    private MediaPlayer?     _player;
    private Media?           _media;      // must outlive the player
    private byte[]?          _pixBuf;
    private GCHandle         _pinHandle;
    private WriteableBitmap? _wb;
    private volatile int     _bufAlloc;   // 0=free, 1=allocated
    private volatile bool    _stopping;   // signal callbacks to bail early

    // Use a smaller resolution for previews — less memory, faster decode
    private const uint PW = 320, PH = 180;

    public MediaCard() => InitializeComponent();

    // ── Visual tree lifecycle ─────────────────────────────────────────────
    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        PointerEntered += OnEnter;
        PointerExited  += OnExit;
        PointerPressed += OnPress;

        if (DataContext is MediaCardViewModel { File.MediaType: Models.MediaType.Audio }
            && AudioBadge is not null)
            AudioBadge.IsVisible = true;
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        PointerEntered -= OnEnter;
        PointerExited  -= OnExit;
        PointerPressed -= OnPress;
        StopPreview();
    }

    // ── Pointer events ────────────────────────────────────────────────────
    private void OnEnter(object? _, PointerEventArgs __)
    {
        if (HoverOverlay is not null) HoverOverlay.IsVisible = true;
        StartPreview();
    }

    private void OnExit(object? _, PointerEventArgs __)
    {
        if (HoverOverlay is not null) HoverOverlay.IsVisible = false;
        StopPreview();
    }

    private void OnPress(object? _, PointerPressedEventArgs __)
    {
        if (DataContext is MediaCardViewModel vm)
            RaiseEvent(new OpenPlayerRoutedEventArgs(vm.File));
    }

    // ── Preview playback ──────────────────────────────────────────────────
    public void StartPreview()
    {
        if (DataContext is not MediaCardViewModel { File.MediaType: Models.MediaType.Video } vm)
            return;
        if (_player is not null) return;
        if (Interlocked.CompareExchange(ref _bufAlloc, 1, 0) != 0) return;

        _stopping = false;

        try
        {
            _pixBuf    = new byte[PW * PH * 4];
            _pinHandle = GCHandle.Alloc(_pixBuf, GCHandleType.Pinned);
            _wb        = new WriteableBitmap(
                             new PixelSize((int)PW, (int)PH),
                             new Vector(96, 96),
                             PixelFormat.Bgra8888,
                             AlphaFormat.Opaque);

            // Create the Media FIRST and store it as a field — never put it in a
            // 'using' block here, because LibVLC starts decoding asynchronously
            // and the media must remain alive until the player is fully stopped.
            _media = new Media(VlcService.Instance, vm.File.FilePath, FromType.FromPath);

            _player = VlcService.CreatePlayer();
            _player.SetVideoFormat("BGRA", PW, PH, PW * 4);
            _player.SetVideoCallbacks(LockCb, null, DisplayCb);
            _player.Mute = true;
            _player.Media = _media;

            if (TopLevel.GetTopLevel(this)?.DataContext is MainWindowViewModel mainVm)
                _player.SetRate((float)mainVm.PreviewSpeed);

            _player.Play();
        }
        catch
        {
            CleanupResources(null);
        }
    }

    public void StopPreview()
    {
        var p = Interlocked.Exchange(ref _player, null);
        if (p is null) return;

        // Signal callbacks to abort BEFORE stopping, so they don't write
        // into the buffer while we're tearing down.
        _stopping = true;

        try { p.Stop(); }    catch { }
        try { p.Dispose(); } catch { }

        // Now safe to free managed resources.
        CleanupResources(p);

        Dispatcher.UIThread.Post(() =>
        {
            try
            {
                if (PreviewImage is not null) PreviewImage.IsVisible = false;
            }
            catch { }
        });
    }

    private void CleanupResources(MediaPlayer? _)
    {
        _media?.Dispose();
        _media = null;

        if (Interlocked.Exchange(ref _bufAlloc, 0) != 0)
        {
            if (_pinHandle.IsAllocated) _pinHandle.Free();
            _wb?.Dispose();
            _wb     = null;
            _pixBuf = null;
        }
    }

    // ── LibVLC memory callbacks (VLC internal thread) ─────────────────────
    // These MUST NOT throw — any unhandled exception crashes the process.
    private IntPtr LockCb(IntPtr _, IntPtr planes)
    {
        try
        {
            if (!_stopping && _bufAlloc == 1 && _pinHandle.IsAllocated
                && planes != IntPtr.Zero)
                Marshal.WriteIntPtr(planes, _pinHandle.AddrOfPinnedObject());
        }
        catch { }
        return IntPtr.Zero;
    }

    private void DisplayCb(IntPtr _, IntPtr __)
    {
        if (_stopping || _bufAlloc != 1 || _pixBuf is null || _wb is null) return;
        try
        {
            var copy = new byte[_pixBuf.Length];
            Buffer.BlockCopy(_pixBuf, 0, copy, 0, copy.Length);

            Dispatcher.UIThread.Post(() =>
            {
                try
                {
                    if (_stopping || _wb is null || PreviewImage is null) return;
                    using var fb = _wb.Lock();
                    Marshal.Copy(copy, 0, fb.Address, copy.Length);
                    PreviewImage.Source    = _wb;
                    PreviewImage.IsVisible = true;
                }
                catch { }
            });
        }
        catch { }
    }
}

// ── Routed event ──────────────────────────────────────────────────────────────
public class OpenPlayerRoutedEventArgs : Avalonia.Interactivity.RoutedEventArgs
{
    public static readonly Avalonia.Interactivity.RoutedEvent<OpenPlayerRoutedEventArgs> Event =
        Avalonia.Interactivity.RoutedEvent.Register<MediaCard, OpenPlayerRoutedEventArgs>(
            "OpenPlayer", Avalonia.Interactivity.RoutingStrategies.Bubble);

    public MediaFile File { get; }

    public OpenPlayerRoutedEventArgs(MediaFile file) : base(Event) => File = file;
}

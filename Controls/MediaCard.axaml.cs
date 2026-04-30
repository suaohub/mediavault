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
    private MediaPlayer? _player;
    private byte[]?      _pixBuf;
    private GCHandle     _pinHandle;
    private WriteableBitmap? _wb;
    private int          _bufAlloc; // 0 = free, 1 = allocated (Interlocked)

    private const uint PW = 640, PH = 360;

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
        StartPreview(unmuted: true);
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
    public void StartPreview(bool unmuted = false)
    {
        if (DataContext is not MediaCardViewModel { File.MediaType: Models.MediaType.Video } vm)
            return;
        if (_player is not null) return;
        if (Interlocked.Exchange(ref _bufAlloc, 1) != 0) return;

        try
        {
            _pixBuf    = new byte[PW * PH * 4];
            _pinHandle = GCHandle.Alloc(_pixBuf, GCHandleType.Pinned);
            _wb        = new WriteableBitmap(
                             new PixelSize((int)PW, (int)PH),
                             new Vector(96, 96),
                             PixelFormat.Bgra8888,
                             AlphaFormat.Opaque);

            _player = VlcService.CreatePlayer();
            _player.SetVideoFormat("BGRA", PW, PH, PW * 4);
            _player.SetVideoCallbacks(LockCb, null, DisplayCb);
            _player.Mute = !unmuted;

            using var media = new Media(VlcService.Instance, vm.File.FilePath, FromType.FromPath);
            _player.Media = media;

            if (TopLevel.GetTopLevel(this)?.DataContext is MainWindowViewModel mainVm)
                _player.SetRate((float)mainVm.PreviewSpeed);

            _player.Play();
        }
        catch
        {
            // Ensure we clean up on startup failure
            Interlocked.Exchange(ref _bufAlloc, 0);
            if (_pinHandle.IsAllocated) _pinHandle.Free();
            _wb?.Dispose();
            _wb     = null;
            _pixBuf = null;
            _player?.Dispose();
            _player = null;
        }
    }

    public void StopPreview()
    {
        var p = Interlocked.Exchange(ref _player, null);
        if (p is null) return;

        // Stop FIRST so no more callbacks fire, then free the pinned buffer.
        try { p.Stop(); }    catch { }
        try { p.Dispose(); } catch { }

        if (Interlocked.Exchange(ref _bufAlloc, 0) != 0)
        {
            if (_pinHandle.IsAllocated) _pinHandle.Free();
            _wb?.Dispose();
            _wb     = null;
            _pixBuf = null;
        }

        Dispatcher.UIThread.Post(() =>
        {
            if (PreviewImage is not null) PreviewImage.IsVisible = false;
        });
    }

    // ── LibVLC memory callbacks (called from VLC internal thread) ─────────
    // CRITICAL: must never throw — any unhandled exception from a native
    // callback will hard-crash the process.
    private IntPtr LockCb(IntPtr _, IntPtr planes)
    {
        try
        {
            if (_bufAlloc == 1 && _pinHandle.IsAllocated && planes != IntPtr.Zero)
                Marshal.WriteIntPtr(planes, _pinHandle.AddrOfPinnedObject());
        }
        catch { /* swallow */ }
        return IntPtr.Zero;
    }

    private void DisplayCb(IntPtr _, IntPtr __)
    {
        if (_bufAlloc != 1 || _pixBuf is null || _wb is null) return;
        try
        {
            var copy = new byte[_pixBuf.Length];
            Buffer.BlockCopy(_pixBuf, 0, copy, 0, copy.Length);

            Dispatcher.UIThread.Post(() =>
            {
                try
                {
                    if (_wb is null || PreviewImage is null) return;
                    using var fb = _wb.Lock();
                    Marshal.Copy(copy, 0, fb.Address, copy.Length);
                    PreviewImage.Source    = _wb;
                    PreviewImage.IsVisible = true;
                }
                catch { /* ignore UI update errors */ }
            });
        }
        catch { /* swallow */ }
    }
}

// ── Routed event: card clicked → open player ─────────────────────────────────
public class OpenPlayerRoutedEventArgs : Avalonia.Interactivity.RoutedEventArgs
{
    public static readonly Avalonia.Interactivity.RoutedEvent<OpenPlayerRoutedEventArgs> Event =
        Avalonia.Interactivity.RoutedEvent.Register<MediaCard, OpenPlayerRoutedEventArgs>(
            "OpenPlayer", Avalonia.Interactivity.RoutingStrategies.Bubble);

    public MediaFile File { get; }

    public OpenPlayerRoutedEventArgs(MediaFile file) : base(Event) => File = file;
}

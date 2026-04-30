using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using MediaVault.Models;
using MediaVault.ViewModels;

namespace MediaVault.Controls;

/// <summary>
/// A card that shows a static thumbnail + metadata.
/// Hover only shows a play-button overlay — no live video decode,
/// no native callbacks, no GPU-driver interaction.
/// Click raises OpenPlayer so the fullscreen window can handle playback.
/// </summary>
public partial class MediaCard : UserControl
{
    public MediaCard() => InitializeComponent();

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        PointerEntered += OnEnter;
        PointerExited  += OnExit;
        PointerPressed += OnPress;

        if (DataContext is MediaCardViewModel { File.MediaType: MediaType.Audio }
            && AudioBadge is not null)
            AudioBadge.IsVisible = true;
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        PointerEntered -= OnEnter;
        PointerExited  -= OnExit;
        PointerPressed -= OnPress;
    }

    private void OnEnter(object? _, PointerEventArgs __)
    {
        if (HoverOverlay is not null) HoverOverlay.IsVisible = true;
    }

    private void OnExit(object? _, PointerEventArgs __)
    {
        if (HoverOverlay is not null) HoverOverlay.IsVisible = false;
    }

    private void OnPress(object? _, PointerPressedEventArgs __)
    {
        if (DataContext is MediaCardViewModel vm)
            RaiseEvent(new OpenPlayerRoutedEventArgs(vm.File));
    }
}

// ── Routed event: card clicked → open fullscreen player ──────────────────────
public class OpenPlayerRoutedEventArgs : RoutedEventArgs
{
    public static readonly RoutedEvent<OpenPlayerRoutedEventArgs> Event =
        RoutedEvent.Register<MediaCard, OpenPlayerRoutedEventArgs>(
            "OpenPlayer", RoutingStrategies.Bubble);

    public MediaFile File { get; }

    public OpenPlayerRoutedEventArgs(MediaFile file) : base(Event) => File = file;
}

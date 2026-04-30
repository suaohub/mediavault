using System;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Threading;
using MediaVault.ViewModels;

namespace MediaVault.Views;

public partial class PlayerWindow : Window
{
    private readonly DispatcherTimer _hideTimer;
    private bool _dragging;
    private double _dragFraction;

    private static readonly float[] Speeds = [0.5f, 1.0f, 1.25f, 1.5f, 2.0f, 3.0f, 4.0f];

    public PlayerWindow()
    {
        InitializeComponent();

        _hideTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _hideTimer.Tick += (_, _) => { ControlsBar.IsVisible = false; _hideTimer.Stop(); };

        SpeedBox.ItemsSource   = Speeds;
        SpeedBox.SelectedIndex = 1; // 1x

        SpeedBox.SelectionChanged += (_, _) =>
        {
            if (DataContext is PlayerViewModel vm && SpeedBox.SelectedItem is float rate)
            {
                vm.PlaybackRate = rate;
                vm.Player.SetRate(rate);
            }
        };

        // Wire buttons
        BtnPlay.Click    += (_, _) => (DataContext as PlayerViewModel)?.TogglePlayCommand.Execute(null);
        BtnRewind.Click  += (_, _) => (DataContext as PlayerViewModel)?.SeekByCommand.Execute(-5.0);
        BtnForward.Click += (_, _) => (DataContext as PlayerViewModel)?.SeekByCommand.Execute(5.0);

        // Progress bar drag
        ProgressHit.PointerPressed  += OnProgressDown;
        ProgressHit.PointerMoved    += OnProgressMove;
        ProgressHit.PointerReleased += OnProgressUp;

        PointerMoved += (_, _) => ShowControls();
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        if (DataContext is PlayerViewModel vm)
        {
            vm.CloseRequested    += (_, _) => Close();
            vm.PropertyChanged   += (_, pe) =>
            {
                if (pe.PropertyName == nameof(PlayerViewModel.Position))
                    UpdateProgressBar();
            };
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        ShowControls();

        if (DataContext is not PlayerViewModel vm) return;

        switch (e.Key)
        {
            case Key.Left:  vm.SeekByCommand.Execute(-5.0);    e.Handled = true; break;
            case Key.Right: vm.SeekByCommand.Execute(5.0);     e.Handled = true; break;
            case Key.Up:    vm.ChangeVolumeCommand.Execute(0.1); e.Handled = true; break;
            case Key.Down:  vm.ChangeVolumeCommand.Execute(-0.1);e.Handled = true; break;
            case Key.Space: vm.TogglePlayCommand.Execute(null); e.Handled = true; break;
            default:        Close(); break;  // Any other key → close
        }
    }

    // ── Progress bar ─────────────────────────────────────────────────────
    private void OnProgressDown(object? _, PointerPressedEventArgs e)
    {
        _dragging = true;
        (DataContext as PlayerViewModel)?.BeginSeek();
        _dragFraction = GetFraction(e.GetPosition(ProgressHit).X);
        UpdateProgressBar(_dragFraction);
    }

    private void OnProgressMove(object? _, PointerEventArgs e)
    {
        if (!_dragging) return;
        _dragFraction = GetFraction(e.GetPosition(ProgressHit).X);
        UpdateProgressBar(_dragFraction);
    }

    private void OnProgressUp(object? _, PointerReleasedEventArgs e)
    {
        if (!_dragging) return;
        _dragging = false;
        _dragFraction = GetFraction(e.GetPosition(ProgressHit).X);
        (DataContext as PlayerViewModel)?.CommitSeek(_dragFraction);
    }

    private double GetFraction(double x) =>
        Math.Clamp(x / ProgressHit.Bounds.Width, 0, 1);

    private void UpdateProgressBar(double? fraction = null)
    {
        var f = fraction ?? (DataContext as PlayerViewModel)?.Position ?? 0;
        ProgressFill.Width = f * ProgressArea.Bounds.Width;
    }

    private void ShowControls()
    {
        ControlsBar.IsVisible = true;
        _hideTimer.Stop();
        _hideTimer.Start();
    }
}

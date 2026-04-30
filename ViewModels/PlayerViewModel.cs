using System;
using SystemTimer = System.Timers.Timer;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LibVLCSharp.Shared;
using MediaVault.Models;
using MediaVault.Services;

namespace MediaVault.ViewModels;

public partial class PlayerViewModel : ViewModelBase, IDisposable
{
    private readonly MediaPlayer _mp;
    private readonly SystemTimer _ticker;
    private bool                 _seeking;

    [ObservableProperty] private double _position;          // 0.0 – 1.0
    [ObservableProperty] private double _durationSec;
    [ObservableProperty] private double _volume = 1.0;
    [ObservableProperty] private bool   _isPlaying = true;
    [ObservableProperty] private bool   _isMuted;
    [ObservableProperty] private float  _playbackRate = 1.0f;
    [ObservableProperty] private string _timeText     = "0:00";
    [ObservableProperty] private string _durationText = "0:00";

    public MediaFile   File   { get; }
    public MediaPlayer Player => _mp;

    public event EventHandler? CloseRequested;

    public PlayerViewModel(MediaFile file)
    {
        File = file;
        _mp  = VlcService.CreatePlayer();
        _mp.Volume = 100;

        using var media = new Media(VlcService.Instance, file.FilePath, FromType.FromPath);
        _mp.Media = media;

        _mp.LengthChanged += (_, e) => Dispatcher.UIThread.Post(() =>
        {
            DurationSec  = e.Length / 1000.0;
            DurationText = Format(DurationSec);
        });

        _mp.EndReached += (_, _) => Dispatcher.UIThread.Post(() =>
        {
            _mp.Time = 0;
            _mp.Pause();
            IsPlaying = false;
            Position  = 0;
        });

        _mp.Play();

        _ticker = new SystemTimer(250);
        _ticker.Elapsed += OnTick;
        _ticker.Start();
    }

    private void OnTick(object? _, System.Timers.ElapsedEventArgs __)
    {
        if (_seeking || !_mp.IsPlaying || DurationSec <= 0) return;
        Dispatcher.UIThread.Post(() =>
        {
            Position = Math.Clamp(_mp.Time / 1000.0 / DurationSec, 0, 1);
            TimeText = Format(_mp.Time / 1000.0);
        });
    }

    [RelayCommand]
    private void TogglePlay()
    {
        if (_mp.IsPlaying) _mp.Pause(); else _mp.Play();
        IsPlaying = _mp.IsPlaying;
    }

    [RelayCommand]
    private void SeekBy(double seconds)
    {
        var t = Math.Clamp(_mp.Time / 1000.0 + seconds, 0, DurationSec);
        _mp.Time = (long)(t * 1000);
    }

    [RelayCommand]
    private void ChangeVolume(double delta)
    {
        Volume   = Math.Clamp(Volume + delta, 0, 1);
        _mp.Volume = (int)(Volume * 100);
    }

    /// <summary>Called while user is dragging the progress bar — visual only.</summary>
    public void BeginSeek() => _seeking = true;

    /// <summary>Called on mouse-up — commits the seek.</summary>
    public void CommitSeek(double fraction)
    {
        _seeking  = false;
        Position  = fraction;
        _mp.Time  = (long)(fraction * DurationSec * 1000);
        TimeText  = Format(_mp.Time / 1000.0);
    }

    [RelayCommand]
    private void Close() => CloseRequested?.Invoke(this, EventArgs.Empty);

    private static string Format(double sec)
    {
        var ts = TimeSpan.FromSeconds(Math.Max(0, sec));
        return ts.Hours > 0 ? ts.ToString(@"h\:mm\:ss") : ts.ToString(@"m\:ss");
    }

    public void Dispose()
    {
        _ticker.Stop();
        _ticker.Dispose();
        _mp.Stop();
        _mp.Dispose();
    }
}

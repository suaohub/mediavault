using System;
using System.Globalization;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Data.Converters;
using Avalonia.Markup.Xaml;
using Avalonia.Markup.Xaml.Styling;
using MediaVault.Views;

namespace MediaVault;

public partial class App : Application
{
    private ResourceInclude? _activeTheme;

    public static new App? Current => (App?)Application.Current;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
            desktop.MainWindow = new MainWindow();

        base.OnFrameworkInitializationCompleted();
    }

    /// <summary>Hot-swap the colour-token ResourceDictionary.</summary>
    public void ApplyTheme(string name)
    {
        var uri = new Uri($"avares://MediaVault/Assets/Themes/{name}.axaml");
        var next = new ResourceInclude(uri) { Source = uri };

        if (_activeTheme is not null)
            Resources.MergedDictionaries.Remove(_activeTheme);

        Resources.MergedDictionaries.Add(next);
        _activeTheme = next;
    }
}

// ── Value Converters ──────────────────────────────────────────────────────────

public class StringNotEmptyConverter : IValueConverter
{
    public object Convert(object? v, Type t, object? p, CultureInfo c)
        => v is string s && !string.IsNullOrEmpty(s);

    public object ConvertBack(object? v, Type t, object? p, CultureInfo c)
        => throw new NotSupportedException();
}

public class PlayPauseIconConverter : IValueConverter
{
    public object Convert(object? v, Type t, object? p, CultureInfo c)
        => v is true ? "⏸" : "▶";

    public object ConvertBack(object? v, Type t, object? p, CultureInfo c)
        => throw new NotSupportedException();
}

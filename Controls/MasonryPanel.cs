using System;
using Avalonia;
using Avalonia.Controls;
using MediaVault.Models;
using MediaVault.ViewModels;

namespace MediaVault.Controls;

/// <summary>
/// Pinterest-style waterfall layout. Column count is determined by
/// available width ÷ (ColumnWidth + Gap).  Each card's height is
/// derived from its aspect ratio so portrait clips get tall slots and
/// ultra-wide clips get short, wide ones.
/// </summary>
public class MasonryPanel : Panel
{
    public static readonly StyledProperty<double> ColumnWidthProperty =
        AvaloniaProperty.Register<MasonryPanel, double>(nameof(ColumnWidth), 260.0);

    public static readonly StyledProperty<double> GapProperty =
        AvaloniaProperty.Register<MasonryPanel, double>(nameof(Gap), 10.0);

    public double ColumnWidth
    {
        get => GetValue(ColumnWidthProperty);
        set => SetValue(ColumnWidthProperty, value);
    }

    public double Gap
    {
        get => GetValue(GapProperty);
        set => SetValue(GapProperty, value);
    }

    static MasonryPanel()
    {
        ColumnWidthProperty.Changed.AddClassHandler<MasonryPanel>((p, _) => p.InvalidateMeasure());
        GapProperty.Changed.AddClassHandler<MasonryPanel>((p, _) => p.InvalidateMeasure());
        AffectsMeasure<MasonryPanel>(ColumnWidthProperty, GapProperty);
    }

    protected override Size MeasureOverride(Size available)
    {
        if (Children.Count == 0) return new Size(0, 0);

        var (cols, cw) = Columns(available.Width);
        var heights    = new double[cols];

        foreach (var child in Children)
        {
            var ratio = Ratio(child);
            var h     = cw / ratio;
            child.Measure(new Size(cw, h));
            var col   = Shortest(heights);
            heights[col] += h + Gap;
        }

        var maxH = 0.0;
        foreach (var h in heights) if (h > maxH) maxH = h;
        return new Size(available.Width, Math.Max(0, maxH - Gap));
    }

    protected override Size ArrangeOverride(Size final)
    {
        if (Children.Count == 0) return final;

        var (cols, cw) = Columns(final.Width);
        var heights    = new double[cols];

        foreach (var child in Children)
        {
            var ratio = Ratio(child);
            var h     = cw / ratio;
            var col   = Shortest(heights);
            var x     = col * (cw + Gap);
            var y     = heights[col];

            child.Arrange(new Rect(x, y, cw, h));
            heights[col] += h + Gap;
        }

        return final;
    }

    // ─────────────────────────────────────────────────────────────────────────

    private (int cols, double colWidth) Columns(double available)
    {
        if (available <= 0) return (1, ColumnWidth);
        var n  = Math.Max(1, (int)((available + Gap) / (ColumnWidth + Gap)));
        var cw = (available - (n - 1) * Gap) / n;
        return (n, cw);
    }

    private static int Shortest(double[] h)
    {
        var idx = 0;
        for (var i = 1; i < h.Length; i++)
            if (h[i] < h[idx]) idx = i;
        return idx;
    }

    private static double Ratio(Control c)
    {
        if (c.DataContext is MediaCardViewModel vm)
            return vm.File.AspectClass.ToRatio();
        return 16.0 / 9.0;
    }
}

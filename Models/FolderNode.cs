using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace MediaVault.Models;

public partial class FolderNode : ObservableObject
{
    public string  Id       { get; init; } = string.Empty;
    public string  Name     { get; init; } = string.Empty;
    public string? ParentId { get; init; }

    [ObservableProperty]
    private bool _visible = true;

    public ObservableCollection<FolderNode> Children { get; } = [];
}

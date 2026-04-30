# MediaVault

> Windows 原生桌面媒体播放器  
> **C# 8 · Avalonia UI 11 · LibVLCSharp · CommunityToolkit.Mvvm**

---

## 功能

| 功能 | 实现 |
|------|------|
| 拖放 / 文件选择 / 文件夹递归导入 | `IStorageFile` / `DragDrop` API |
| 瀑布流网格（按分辨率自适应宽高比）| 自定义 `MasonryPanel` （纯 C#）|
| 悬停触发静音视频预览 | LibVLC 内存回调 → `WriteableBitmap` |
| 点击打开全屏播放器 | `LibVLCSharp.Avalonia.VideoView`（D3D11 硬解）|
| 全屏键盘快捷键 | ← / → 跳 5s，↑ / ↓ 调音量，任意其他键关闭 |
| 进度条拖拽（消除卡顿）| `BeginSeek` / `CommitSeek` 分离视觉与解码 |
| 异步缩略图队列 | `Channel<T>` + LibVLC 内存帧抓取 |
| 实时搜索 + 类型筛选 + 文件夹筛选 | LINQ 过滤 + `ObservableProperty` |
| 6 套主题（持久化）| Avalonia `ResourceDictionary` 热切换 |
| 预览倍速控制（1×–4×）| `MediaPlayer.SetRate()` |

---

## 开发 & 构建

### macOS 上开发（交叉编译输出 Windows exe）

```bash
# 安装 .NET 8 SDK
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0
export PATH="$HOME/.dotnet:$PATH"

# 克隆并恢复依赖
git clone https://github.com/suaohub/mediavault.git
cd mediavault
dotnet restore

# 在 macOS 上直接运行（使用 libvlc.Mac）
dotnet run

# 交叉编译 Windows x64 自包含发布包
dotnet publish -r win-x64 -c Release -o publish/win-x64
```

发布包位于 `publish/win-x64/`，包含 `MediaVault.exe` 及 libvlc 原生库，可直接在 Windows 10/11 x64 上运行，无需安装任何运行时。

### 主题 / 主要脚本

| 命令 | 说明 |
|------|------|
| `dotnet run` | 开发模式（macOS 上运行） |
| `dotnet build` | 编译检查 |
| `dotnet publish -r win-x64 -c Release` | 发布 Windows 版本 |

---

## 项目结构

```
MediaVault/
├── Models/
│   ├── MediaFile.cs          # 媒体文件数据模型 + AspectClass
│   └── FolderNode.cs         # 文件夹树节点（ObservableObject）
├── ViewModels/
│   ├── MainWindowViewModel.cs # 全局状态（导入、筛选、主题、倍速）
│   ├── MediaCardViewModel.cs  # 卡片状态（缩略图异步加载）
│   └── PlayerViewModel.cs     # 播放器状态（进度、音量、倍速）
├── Services/
│   ├── VlcService.cs          # 全局单例 LibVLC 实例
│   ├── ThumbnailService.cs    # Channel 队列 + LibVLC 内存帧抓取
│   └── MediaImportService.cs  # 文件/文件夹探测 + LibVLC 元数据解析
├── Controls/
│   ├── MasonryPanel.cs        # 自定义瀑布流 Panel（ArrangeOverride）
│   ├── MediaCard.axaml        # 卡片 UI（缩略图、预览帧、悬停覆盖）
│   └── MediaCard.axaml.cs     # 卡片逻辑（LibVLC 内存回调、悬停预览）
├── Views/
│   ├── MainWindow.axaml       # 主窗口（Header / Subbar / Grid）
│   ├── MainWindow.axaml.cs    # 导入、拖放、主题切换、网格重建
│   ├── PlayerWindow.axaml     # 全屏播放器（VideoView + 控制栏）
│   └── PlayerWindow.axaml.cs  # 键盘快捷键、进度拖拽、自动隐藏控制栏
├── Assets/
│   ├── Styles.axaml           # 全局按钮/控件样式
│   └── Themes/                # 6 套主题 ResourceDictionary
│       ├── DarkPurple.axaml   ├── Light.axaml  ├── DeepSpace.axaml
│       ├── Caramel.axaml      ├── Emerald.axaml └── Rose.axaml
├── App.axaml / App.axaml.cs   # 应用入口、主题热切换
└── Program.cs                 # [STAThread] 入口点
```

---

## 视频渲染原理

### 卡片预览（悬停）
```
鼠标进入卡片
  → MediaPlayer.SetVideoFormat("BGRA", 640, 360, stride)
  → SetVideoCallbacks(LockCb, null, DisplayCb)
  → MediaPlayer.Play()
  → DisplayCb: BlockCopy 帧 → Dispatcher.UIThread.Post → Marshal.Copy → WriteableBitmap
  → Image.Source = WriteableBitmap（实时显示）
鼠标离开
  → MediaPlayer.Stop() → GCHandle.Free() → WriteableBitmap.Dispose()
```

### 全屏播放器
```
VideoView（LibVLCSharp.Avalonia）
  → Windows: LibVLC D3D11 硬解 → 零拷贝 Surface 输出
  → macOS:   LibVLC VDA/VideoToolbox → OpenGL 输出
```

---

## License

MIT

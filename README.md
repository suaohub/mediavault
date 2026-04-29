# MediaVault 🎬

> 本地媒体播放器 — 支持作为 **Web 应用**在浏览器中运行，也支持打包为 **Windows / macOS 原生桌面应用**（基于 Tauri），所有文件处理均在本地完成，无需服务器。

![技术栈](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite)
![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri)
![Zustand](https://img.shields.io/badge/Zustand-5-orange?style=flat-square)

## 功能特性

### 媒体导入
- **拖放导入**：直接将文件或文件夹拖入窗口
- **文件选择**：支持多选视频 / 音频文件
- **文件夹导入**：递归读取整个文件夹及所有子文件夹
- **支持格式**：MP4、MOV、MKV、AVI、WEBM、MP3、FLAC、WAV、M4A、AAC 等

### 媒体库浏览
- **瀑布流网格**：CSS Columns 实现，根据视频分辨率自适应卡片比例
  - 横屏视频 → 宽卡片（16:9 / 4:3 / 21:9）
  - 竖屏视频 → 高卡片（9:16）
  - 音频文件 → 方形卡片（1:1）
- **视口自动播放**：进入视口的视频自动以预览倍速静音播放
- **悬停解音**：鼠标悬停即开启声音
- **内存优化**：离开视口立即清除解码缓存（`src=''` + `load()`），内存占用与文件数量无关，仅与当前可见卡片数量成正比

### 全屏播放器
- 视频铺满全屏，控制栏叠加显示，3 秒无操作自动隐藏
- **拖拽进度条**：拖拽过程只移动视觉进度，松手才执行 seek，消除拖拽卡顿
- **Buffering 指示器**：seek 解码期间显示旋转圈
- **键盘快捷键**

  | 按键 | 功能 |
  |------|------|
  | `←` | 后退 5 秒 |
  | `→` | 前进 5 秒 |
  | `↑` | 音量 +10% |
  | `↓` | 音量 -10% |
  | 其他任意键 | 关闭播放器 |

- 倍速调节（0.5× ~ 4×）
- 原生全屏支持

### 筛选与搜索
- **实时搜索**：按文件名即时过滤
- **类型筛选**：全部 / 视频 / 音频 / 最近添加
- **文件夹筛选**：子栏 chip 下拉，支持多级文件夹层级，可单独控制每个文件夹的显示/隐藏
- **预览倍速控制**：1× / 1.5× / 2× / 3× / 4×

### 主题
内置 6 套主题，主题选择持久化到 localStorage：

| 主题 | 风格 | 强调色 |
|------|------|--------|
| 暗紫（默认）| 极深黑底 | 紫蓝 |
| 浅色 | 白灰底 | 蓝紫 |
| 深空 | 深海蓝底 | 琥珀 |
| 暖焦糖 | 深暖棕底 | 橙色 |
| 翠绿 | 深森林底 | 翠绿 |
| 玫瑰 | 深玫红底 | 玫红 |

## 快速开始

### 环境要求

**Web 模式（浏览器）**
- Node.js 18+
- 现代浏览器（Chrome 90+ / Safari 15+ / Firefox 90+）

**桌面应用模式（Tauri）**
- Node.js 18+
- Rust stable（`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`）
- macOS：Xcode Command Line Tools（`xcode-select --install`）
- Windows：Visual Studio Build Tools 2022 + WebView2（Windows 11 已内置）

---

### 以 Web 应用运行

```bash
git clone https://github.com/suaohub/mediavault.git
cd mediavault
npm install
npm run dev          # 浏览器访问 http://localhost:5173
```

### 以桌面应用运行（开发模式）

```bash
npm install
npm run tauri:dev    # 自动启动 Vite + 弹出原生桌面窗口
```

### 打包桌面安装包

```bash
# macOS → 生成 .dmg（需在 Mac 上执行）
npm run tauri:build

# Windows → 生成 .msi / .exe（需在 Windows 上执行）
npm run tauri:build
```

> 推荐使用下方的 GitHub Actions 工作流在 CI 中同时构建两个平台的安装包，无需自备 Windows 机器。

### 构建纯 Web 版本

```bash
npm run build
# 产物在 dist/，可直接部署为静态站点
```

## 跨平台打包（GitHub Actions）

推送带版本号的 tag 即可自动触发双平台构建并创建 GitHub Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

工作流文件：`.github/workflows/release.yml`

| 平台 | Runner | 产物 |
|------|--------|------|
| macOS | `macos-latest` | Universal `.dmg`（同时支持 Intel + Apple Silicon） |
| Windows | `windows-latest` | `.msi` + `.exe` 安装包 |

## 编解码支持说明

| 格式 | macOS (WKWebView) | Windows (WebView2) |
|------|-------------------|---------------------|
| H.264 MP4 | ✅ | ✅ |
| HEVC / H.265 | ✅ 硬件加速 | ✅ 需安装 [HEVC 视频扩展](https://apps.microsoft.com/detail/9NMZLZ57R3T7)（免费） |
| ProRes | ✅ | ❌ |
| VP9 / WebM | ✅ | ✅ |
| AV1 | ✅ | ✅（Windows 11）|
| MP3 / AAC / FLAC | ✅ | ✅ |

> Windows 上绝大多数 MP4（H.264）可直接播放。若需播放 HEVC 视频，请先从 Microsoft Store 免费安装"HEVC 视频扩展"。

## 技术实现

### 内存管理
浏览器加载视频时，解码后的 RGBA 帧数据非常庞大（1080p 约 8MB/帧）。本项目通过以下策略将内存占用控制在合理范围：

```
离开视口 → v.pause() → v.src = '' → v.load()
```

`v.load()` 配合空 src 会触发浏览器的 media element reset，强制释放所有已解码的帧缓冲区和网络连接，内存即时回收。

### 拖拽 Seek 优化
传统的 `onClick` 直接设置 `currentTime` 会导致每次点击都触发一次从关键帧开始的解码（约 0.5~1s 延迟）。本项目改为：

- `mousedown` → 开始记录拖拽位置（仅更新视觉进度条）
- `mousemove` → 实时更新视觉位置，不触发任何解码
- `mouseup` → 执行一次 `currentTime = finalPos`

拖拽体验完全流畅，解码工作集中在松手后的单次操作。

### 文件夹递归读取
使用 FileSystem Entry API 递归遍历目录树：
- 拖放：`DataTransferItem.webkitGetAsEntry()` → 递归 `FileSystemDirectoryReader`
- 选择文件夹：`<input webkitdirectory>` → 解析 `File.webkitRelativePath`

## 项目结构

```
mediavault/
├── src/                       # 前端 React 源码
│   ├── types.ts               # TypeScript 类型定义
│   ├── store.ts               # Zustand 全局状态
│   ├── utils.ts               # 文件处理、缩略图、元数据工具函数
│   ├── style.css              # 全局样式 + 6 套主题变量
│   ├── App.tsx                # 根组件
│   └── components/
│       ├── Header.tsx         # 顶部导航（搜索、导入、主题切换）
│       ├── Subbar.tsx         # 子栏（筛选 chip、文件夹、倍速）
│       ├── MediaGrid.tsx      # 瀑布流网格
│       ├── MediaCard.tsx      # 媒体卡片（视口感知 + 内存管理）
│       ├── PlayerModal.tsx    # 全屏播放器
│       ├── MiniPlayer.tsx     # 底部迷你播放条
│       └── DropZone.tsx       # 拖放区域覆盖层
├── src-tauri/                 # Tauri 桌面应用层
│   ├── src/
│   │   ├── main.rs            # 入口（仅 Windows 隐藏控制台窗口）
│   │   └── lib.rs             # Tauri Builder 配置
│   ├── icons/                 # 各平台图标（自动生成）
│   ├── capabilities/          # Tauri 权限声明
│   ├── Cargo.toml             # Rust 依赖
│   └── tauri.conf.json        # 窗口、打包、安全配置
├── .github/workflows/
│   └── release.yml            # Windows + macOS 双平台自动构建
└── dist/                      # 构建产物（git 忽略）
```

## License

MIT

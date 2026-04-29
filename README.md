# MediaVault 🎬

> 一款运行在浏览器中的本地媒体播放器，无需服务器，所有文件处理均在客户端完成。

![技术栈](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite)
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
- Node.js 18+
- 现代浏览器（Chrome 90+ / Safari 15+ / Firefox 90+）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/suaohub/mediavault.git
cd mediavault

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器访问 `http://localhost:5173`

### 构建生产版本

```bash
npm run build
# 产物在 dist/ 目录，可直接部署为静态站点
```

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
src/
├── types.ts              # TypeScript 类型定义
├── store.ts              # Zustand 全局状态
├── utils.ts              # 文件处理、缩略图、元数据工具函数
├── style.css             # 全局样式 + 6套主题变量
├── App.tsx               # 根组件
└── components/
    ├── Header.tsx        # 顶部导航（搜索、导入、主题切换）
    ├── Subbar.tsx        # 子栏（筛选 chip、文件夹、倍速）
    ├── MediaGrid.tsx     # 瀑布流网格
    ├── MediaCard.tsx     # 媒体卡片（视口感知 + 内存管理）
    ├── PlayerModal.tsx   # 全屏播放器
    ├── MiniPlayer.tsx    # 底部迷你播放条
    └── DropZone.tsx      # 拖放区域覆盖层
```

## License

MIT

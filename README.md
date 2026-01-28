# BiliMini 📺

**极简 Bilibili 音乐播放器 - macOS 菜单栏应用**

一个轻量级的哔哩哔哩音乐播放器，专为 macOS 设计。常驻菜单栏，点击即用，专注于纯粹的听歌体验。

## ✨ 特性

- 🎯 **极简设计**：无边框暗黑风，粉色点缀
- 📍 **菜单栏应用**：不占用 Dock，点击托盘图标显示/隐藏
- 🎵 **真实播放**：直接对接 B 站 API，输入 BV 号即可播放
- 🎨 **精致 UI**：Tailwind CSS + Framer Motion，流畅动画
- ⚡️ **高性能**：Tauri + React，内存占用极低
- 🔄 **循环模式**：支持单曲循环、列表循环
- 💾 **持久化**：播放列表、音量、循环模式自动保存
- ⌨️ **快捷键**：空格播放/暂停，左右键切歌
- 📊 **进度控制**：可拖动进度条，实时显示播放时间

## 🛠️ 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS
- **框架**: Tauri 2.x (Rust + Webview)
- **插件**: 
  - `tauri-plugin-positioner` (MenuBar 定位)
  - `tauri-plugin-http` (绕过 CORS 和 Referer 限制)

## 🚀 快速开始

### 开发模式

```bash
pnpm install
pnpm tauri dev
```

### 构建发布版

```bash
pnpm tauri build
```

生成的 `.app` 和 `.dmg` 文件位于：
```
src-tauri/target/aarch64-apple-darwin/release/bundle/
```

## 📖 使用说明

1. 启动后，菜单栏会出现一个图标
2. 点击图标，弹出播放器窗口
3. 在顶部输入框粘贴 Bilibili 视频的 BV 号（如 `BV1xx411c7mD`）或完整链接
4. 回车，自动加入播放列表并开始播放
5. 支持播放列表管理、音量调节、进度控制

### 快捷键

- `Space`: 播放/暂停
- `←`: 上一首
- `→`: 下一首

### 功能说明

- **循环模式**：点击循环图标切换（关闭 → 列表循环 → 单曲循环）
- **删除歌曲**：鼠标悬停在播放列表项上，点击右侧 `X` 按钮
- **拖动进度**：点击进度条任意位置快速跳转
- **播放列表**：自动保存到浏览器本地存储，重启后恢复

## 🎯 TODO

- [ ] 歌词显示
- [ ] 导出/导入播放列表
- [ ] 更多快捷键支持
- [ ] 搜索历史记录
- [ ] 主题切换

## 📄 License

MIT

---

Made with ❤️ by [SliverKeigo](https://github.com/SliverKeigo)


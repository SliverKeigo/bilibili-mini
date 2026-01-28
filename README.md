# BiliMini 📺

**极简 Bilibili 音乐播放器 - macOS 菜单栏应用**

一个轻量级的哔哩哔哩音乐播放器，专为 macOS 设计。常驻菜单栏，点击即用，专注于纯粹的听歌体验。

## ✨ 特性

- 🎯 **极简设计**：无边框暗黑风，粉色点缀
- 📍 **菜单栏应用**：不占用 Dock，点击托盘图标显示/隐藏
- 🎵 **真实播放**：直接对接 B 站 API，输入 BV 号即可播放
- 🎨 **精致 UI**：Tailwind CSS + Framer Motion，流畅动画
- ⚡️ **高性能**：Tauri + React，内存占用极低

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
3. 在顶部输入框粘贴 Bilibili 视频的 BV 号（如 `BV1xx411c7mD`）
4. 回车，自动加入播放列表并开始播放
5. 支持播放列表管理、音量调节、进度控制

## 🎯 TODO

- [ ] 歌词显示
- [ ] 收藏夹管理
- [ ] 快捷键支持
- [ ] 导出/导入播放列表

## 📄 License

MIT

---

Made with ❤️ by [SliverKeigo](https://github.com/SliverKeigo)

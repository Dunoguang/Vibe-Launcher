# Vibe Launcher

<p align="center">
  <b>🪐 3D Sphere App Launcher</b><br>
  <sub>Three.js 0.185.1 • Vite • Android</sub>
</p>

---

A minimalist Android launcher that renders your apps as a rotatable 3D sphere. Built with Kotlin + WebView + Three.js, bundled with Vite.

## Features

- 🪐 **3D Sphere** — 球体/半球/竖环/横环 多布局，Coulomb 分布
- ⚡ **No Network** — Vite 单文件打包，零 CDN 依赖，无 INTERNET 权限
- 🕐 **时间精灵** — 分钟级 html2canvas 截图 + 电量驱动更新
- 🔍 **实时搜索** — 按应用名过滤
- 🎮 **完整交互** — 拖拽旋转、惯性、缩放、长按菜单、卸载
- ⚙️ **设置面板** — 球体大小、图标分辨率、动画速度、布局切换、热加载调试

## Download

[📥 v1.0.5 Release](https://github.com/Dunoguang/Vibe-Launcher/releases)

## Tech Stack

| Layer | Tech |
|------|------|
| Language | Kotlin |
| UI Runtime | Android WebView |
| 3D Engine | Three.js 0.185.1 (Vite bundled) |
| Bundler | Vite 8.1.3 + vite-plugin-singlefile |
| Screenshot | html2canvas 1.4.1 |
| Build | AGP 9.2.1 • JDK 25 |
| CI/CD | GitHub Actions + tempfile.org |

## Architecture

```
Vibe Launcher
├── pack/                   — Vite 前端源码
│   ├── main.js             — Three.js 3D 引擎、精灵、交互
│   ├── index.html          — HTML 结构、CSS 样式
│   ├── vite.config.js      — vite-plugin-singlefile 配置
│   └── dist/index.html     — 构建产物（2MB 单文件）
├── app/
│   ├── build.gradle.kts    — Android 构建配置
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/.../
│       │   ├── MainActivity.kt   — WebView 宿主
│       │   └── JsBridge.kt       — 原生桥接：应用列表/图标/电池/启动/卸载
│       └── assets/               — Vite 构建自动生成 index.html
└── .github/workflows/      — CI：Vite 构建 → Android 打包 → 上传
```

## Build

```bash
# 前端
cd pack && npm ci && npm run build

# APK
gradle :app:assembleRelease
```

CI 自动构建，产物：
- `app-release-apk` / `app-debug-apk` — GitHub Artifacts（7天）
- `tempfile-links` — tempfile.org 外链（72小时）

## License

MIT

# Vibe Launcher

<p align="center">
  <b>🪐 3D Sphere App Launcher</b><br>
  <sub>WebGPU • Three.js 0.185.1 • Android</sub>
</p>

---

A minimalist Android launcher that renders your apps as a rotatable 3D sphere. Built with Kotlin + WebView + Three.js.

## Features

- 🪐 **3D Sphere** — Fibonacci distribution with Coulomb refinement for evenly spaced app icons
- ⚡ **WebGPU** — Hardware-accelerated rendering, auto-falls-back to WebGL
- 🕐 **Time View** — Clock screen with swipe-up gesture to unlock
- 🔍 **Search** — Real-time filtering by app name
- 👆 **Launch** — Tap any app icon to launch
- 📦 **868KB** — Minified, shrunk, no embedded Three.js

## Screenshots

(coming soon)

## Download

[📥 Vibe-Launcher-v1.0.0.apk](https://github.com/Dunoguang/Vibe-Launcher/releases/download/v1.0.0/Vibe-Launcher-v1.0.0.apk)

## Tech Stack

| Layer | Tech |
|------|------|
| Language | Kotlin |
| UI Runtime | Android WebView |
| 3D Engine | Three.js 0.185.1 (CDN) |
| GPU | WebGPU → WebGL fallback |
| Build | AGP 9.2.1 • Gradle 8.7 • JDK 25 |
| CI/CD | GitHub Actions |

## Architecture

```
Vibe Launcher
├── MainActivity.kt        — WebView host, fullscreen, CORS enabled
├── JsBridge.kt            — @JavascriptInterface: apps, icons, launch
└── assets/index.html      — Three.js 3D sphere, search, time view
```

## Build

```bash
gradle :app:assembleRelease
```

CI auto-builds on push/tag, signs with v1+v2+v3, and uploads to GitHub Releases.

## License

MIT

# Vibe Launcher — 开发上下文

## 基本信息

| 项目 | 内容 |
|------|------|
| 开发者 | 独の光 |
| 项目名称 | Vibe Launcher |
| 技术栈 | Kotlin (Native) + WebBridge + Vite + Three.js |
| 目标 API | 37 (Android 17) |
| 最低 API | 27 (Android 8.1) |

## 本地环境

- **系统**：Android Linux 6.1 (Armv9.2)
- **用户**：root (KernelSU)
- **终端**：Termux Shell（单次输出上限 4KB）
- **工具链**：npm, nodejs, Python, gh (GitHub CLI)

## 项目结构

| 用途 | 路径 |
|------|------|
| 项目根目录 | `/data/media/0/github/Vibe-Launcher/` |
| 前端源码 | `/data/media/0/github/Vibe-Launcher/pack/` |
| 后端源码 (Kotlin) | `…/app/src/main/java/com/dng/launcher/` |
| APP 私有数据 | `/data/user/0/com.dng.launcher/files/` |
| 热更新文件 | `…/files/index.html` |
| 热更新标志 | `…/shared_prefs/vibe_prefs.xml` |
| 日志文件 | `…/files/log_*.txt` |

## 远端与构建

- **远端仓库**：`GitHub.com/dunoguang/Vibe-Launcher/`
- **构建方式**：GitHub Actions
- **获取最新构建**：

```bash
gh run list --repo dunoguang/Vibe-Launcher --limit 1 --json databaseId --jq '.[0].databaseId'
gh run view <BUILD_ID> --repo dunoguang/Vibe-Launcher --log 2>&1 | grep "DOWNLOAD_URL"
```

## 工作规则

1. Termux 输出限制 4KB，长输出需分段或用 `tail` / `head` 截取。
2. 热更新需确保新 `index.html` 置于 APP 数据目录，并检查 `vibe_prefs.xml` 标志位。
3. 推送代码前确认分支状态，使用 `gh` 命令操作。
4. 日志优先读取最新 `log_*.txt`，实时追踪用 `tail -f`。

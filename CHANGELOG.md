# Vibe Launcher 更新日志

## 版本历史

| 版本 | 说明 |
|------|------|
| v1.1.0 | 通知中心、搜索栏、主题色、快捷方式管理 |
| v1.0.8-fix2 | wasPinching 竞态条件修复 |
| v1.0.8-fix1 | FPS 独立计时器、沉浸模式 |
| v1.0.8 | FPS 计数器修复、沉浸模式 |
| v1.0.7 | 模块化重构、预返回手势、FPS 开关 |
| v1.0.6 | 壁纸/时间背景、预测性返回 |
| v1.0.5 | Vite 构建、CI 优化 |
| v1.0.4 | 设置 UI 重构、返回手势、热更新 |
| v1.0.3 | 多布局模式、WebGPU、动画状态机 |
| v1.0.2 | 设置面板、JS API、电池、长按菜单 |
| v1.0.1 | 时间纹理、滑动手势、应用点击缩放 |
| v1.0.0 | 初始 3D 球体启动器 |

---

## v1.1.0 新增功能

### 🔔 通知中心
- NotificationListenerService 实时监听系统通知
- 顶部下滑手势（5%区域）打开通知面板
- 通知徽标（右上角红色角标，实时显示未读数）
- 通知列表：标题、内容、时间、来源应用
- 点击通知直接跳转对应应用
- 一键清除全部通知
- 设置中可跳转系统通知授权页面

### 🔍 搜索功能
- 双击空白区域打开搜索栏
- 实时模糊搜索（按应用名、包名匹配）
- 搜索结果直接点击启动应用
- ESC 或点击外部关闭搜索

### 🎨 主题色系统
- 8种预设主题色可选
- 保存到 SharedPreferences 持久化
- 主题色应用于设置按钮、滑块等 UI 元素

### 📌 快捷方式管理
- 设置面板中管理应用钉选
- 钉选的应用优先显示在球体前方
- 钉选状态持久化存储
- 最多显示30个应用的钉选管理

### ⚙ 设置增强
- 通知权限管理入口
- 快捷方式管理区域
- 主题色选择器
- 所有新设置项持久化保存

---

## 初始版本功能（保留）

### 时间视图
- 原生 DOM 时间覆盖层（时钟、日期、电池）
- 时间精灵背景图独立选择（与壁纸分离）
- html2canvas 时间纹理（bg-only / full 状态机）
- 预测性返回手势过渡（Android 14+）
- 时间页面滑入/滑出手势

### 手势交互
- 点击应用 → 旋转 + 缩放动画 → 启动
- 顶部下滑进入时间视图
- 底部上滑退出时间视图
- 双击球体复位旋转
- 双指缩放（pinch zoom）
- 长按上下文菜单（应用信息、卸载）
- 预返回手势（materialEasing 缓动、damping）
- 可取消应用启动动画（CancelableAction 状态机）
- 惯性无限旋转

### 设置面板
- 全新卡片式设置 UI（现代毛玻璃风格）
- 图标分辨率设置（数字输入）
- 球体大小设置（数字输入 + 最小半径校验）
- 动画速度设置（10-5000ms）
- 布局模式切换（sphere/hemisphere/ring/hbar）
- FPS 帧率显示开关（左上角）
- 热加载 HTML 开关（调试，默认关闭）
- 清除图标缓存按钮
- 壁纸选择（原生图片选择器 → filesDir，裁剪/移除）
- 时间精灵背景图独立选择
- 设置面板滚动条（4px 半透明白色）
- 保存后即时重建图标/纹理，无需刷新页面

### 电池
- 时间页面电池状态显示（⚡充电/🔋放电 + 百分比）
- 每秒轮询 NativeBridge API + 变化检测

### 3D 核心
- 3D 球体应用启动器 with Three.js WebGL/WebGPU
- 内置 Three.js（three.module.js + three.webgpu）
- 自动渲染降级：WebGPU → WebGL2 → WebGL1
- Vite + vite-plugin-singlefile 单文件构建

### 布局模式
- 多布局：sphere / hemisphere / ring / hbar
- Coulomb 力场应用图标排列
- 时间图标和设置图标始终位于最近相机两个位置

### 系统集成
- 预测性返回手势支持（OnBackAnimationCallback）
- 沉浸模式（隐藏状态栏 + 导航栏，滑动短暂显示）
- 返回按钮 → JS _onBackPressed（settings/timeview 逐级关闭）
- 应用列表变化自动检测（resume 时重建球体）
- 原生错误对话框（一次/启动）
- SAF 日志导出（ACTION_CREATE_DOCUMENT）
- 热更新：从 /data/data/.../files/index.html 加载

### 升级与构建
- Three.js r128 → 0.185.1 ES Module + WebGPU
- 时间戳自动版本号（versionCode/versionName）
- CI 上传 debug APK + release APK 到 Release
- tempfile.org 外链 APK 托管（72h 有效期）

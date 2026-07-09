# Vibe Launcher 更新日志

## 版本历史

| 版本 | 说明 |
|------|------|
| v1.0.0 | 初始 3D 球体启动器 |
| v1.0.1 | 时间纹理、滑动手势、应用点击缩放 |
| v1.0.2 | 设置面板、JS API、电池、长按菜单 |
| v1.0.3 | 多布局模式、WebGPU、动画状态机 |
| v1.0.4 | 设置 UI 重构、返回手势、热更新 |
| v1.0.5 | Vite 构建、CI 优化 |
| v1.0.6 | 壁纸/时间背景、预测性返回 |
| v1.0.7 | 模块化重构、预返回手势、FPS 开关 |
| v1.0.8 | FPS 计数器修复、沉浸模式 |
| v1.0.8-fix1 | FPS 独立计时器、沉浸模式 |
| v1.0.8-fix2 | wasPinching 竞态条件修复 |

---

## 新增功能

### 初始版本（终端/摄像机 → 启动器转型）
- 初始：悬浮终端 Web Shell（root 命令执行）
- 增加摄像机功能 + 翻转/切换 + base64
- 转型为应用启动器（替代 root_cmd/saveImage）
- 注册为桌面启动器（HOME/DEFAULT intent）
- 重命名包名 com.dng.launcher
- 升级 targetSdk 37 + Kotlin DSL + AGP 9

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
- 电量和充电状态双重变化检测

### 3D 核心
- 3D 球体应用启动器 with Three.js WebGL/WebGPU
- 内置 Three.js（three.module.js + three.webgpu）
- 自动渲染降级：WebGPU → WebGL2 → WebGL1
- Vite + vite-plugin-singlefile 单文件构建
- ChromeClient 日志注入 logcat（VibeLauncher TAG）

### 布局模式
- 多布局：sphere / hemisphere / ring / hbar
- Coulomb 力场应用图标排列
- 时间图标和设置图标始终位于最近相机两个位置
- 所有布局按 Z 深度排序

### 系统集成
- 预测性返回手势支持（OnBackAnimationCallback）
- 沉浸模式（隐藏状态栏 + 导航栏，滑动短暂显示）
- 返回按钮 → JS _onBackPressed（settings/timeview 逐级关闭）
- 应用列表变化自动检测（resume 时重建球体）
- 原生错误对话框（一次/启动）
- SAF 日志导出（ACTION_CREATE_DOCUMENT）
- 错误日志分享（ACTION_SEND）
- 热更新：从 /data/data/.../files/index.html 加载
- NativeBridge.log → filesDir/log.txt
- JS 错误自动捕获写入 log.txt

### 升级与构建
- Three.js r128 → 0.185.1 ES Module + WebGPU
- CJS → ES Module → cdn import map 最终方案
- 时间戳自动版本号（versionCode/versionName）
- CI 上传 debug APK + release APK 到 Release
- tempfile.org 外链 APK 托管（72h 有效期）
- 🐾 meow 主题 CI 工作流

---

## Bug 修复

### 时间视图（15项）
1. 时间精灵无法打开（偶发）- wasPinching 竞态条件
2. 时间页面 DOM 隐藏后无法恢复
3. html2canvas 异步回调覆盖 DOM 可见性
4. 点击 15% 区域外导致 DOM 永久隐藏
5. 时间精灵背景更新不及时
6. 时间精灵背景与壁纸混淆
7. 进入/退出时间视图动画不一致
8. 退出后再次进入动画不完成
9. 时间纹理脏版本覆盖
10. scheduleMinuteUpdate 无限递归
11. 时间纹理创建时变量引用缺失
12. 时间页面点击后时间精灵无法打开
13. 完整纹理制作被不完整纹理覆盖
14. 时间精灵纹理 WebGPU dispose 警告
15. exitTimeView 后 isInTimeView 状态不同步

### 手势（10项）
1. 双击误触：两次点击距离 >50px 不算双击
2. 双击复位功能不可用
3. 长按触发后阻止点击启动
4. 长按时 isDragging/hasMoved 未重置
5. 长按计时器未在双指触摸时取消
6. 拖拽状态在 pointerup 时未完全重置
7. 上下文菜单遮挡 3D 拖拽
8. 上下文菜单关闭时 longPressFired 未重置
9. 取消动画时惯性向量未清除导致漂移
10. touchmove 非 cancelable 时 preventDefault 警告

### 动画（8项）
1. startCancelableAction 使用 state.zoomTarget（null）而非参数
2. ANIM_DURATION 在模块重构中丢失
3. 动画回调中 zoomTarget 被 cancelZoomAnimation 提前清空
4. 旋转动画和缩放动画状态同步问题
5. materialEasing 导入缺失
6. 全局动画速度不一致
7. 双击球体复位旋转功能修复
8. 进入/退出设置动画不一致

### 模块化重构（15+项）
1. 数十个变量 state.* 前缀缺失
2. 跨模块 import/export 缺失
3. 重复变量声明
4. sphereCoulomb 未同步到 state
5. wakeUp/isBusy 未导出
6. 多处函数引用未同步到 state
7. cancelZoomAnimation、materialEasing、applyZoom 等缺 state. 前缀
8. rotationAnimData 在 sprites.js 中缺 state. 前缀
9. gestures.js 中 cancelableAction 等未同步到 state
10. battery.js 中 zoomTarget/zoomLevel 缺 state. 前缀
11. 重复 preloadWallpaper 覆盖 state._timeBgImg
12. _pointerDownCount 声明和 state 同步缺失
13. settings.js 中 canvas.style.pointerEvents 缺 state. 前缀
14. sprites 裸用（非 state.sprites）
15. 纹理函数未正确同步到 state

### 设置（8项）
1. 分辨率/球体大小变更后需要刷新页面
2. 壁纸被错误用作所有图标圆圈背景
3. 设置面板滚动条缺失
4. 设置提示位置不统一
5. 热更新状态未持久化
6. 设置中单选按钮布局检测用错选择器
7. 设置卡片在方形屏幕上显示不全
8. 壁纸/时间背景按钮文字更新不及时

### 电池（4项）
1. 电池更新不及时
2. 充电状态变化未检测
3. 电池显示元素未找到时静默失败
4. 电池变化后纹理未同步更新

### FPS（2项）
1. 静止时动画循环停止，FPS 不更新
2. FPS 开关需要重启才能生效

### 其他（12项）
1. WebGPU 纹理销毁警告
2. three.js Quaternion.slerp → instance.slerp 迁移
3. hoveredSprite 空值保护
4. WebView ES Module 加载失败
5. CORS file:// 限制
6. Android 14+ 前台服务启动修复
7. 返回按钮导致 WebView 重新加载
8. 权限缺失
9. API 35 deprecation 处理
10. 壁纸选择器主线程问题
11. 日志导出 URI 空值处理
12. 沉浸模式时 WebView 布局适配

---

## 性能优化

### 渲染性能
1. 闲置时停止渲染循环
2. 图标纹理分辨率 128 → 256 → 512
3. 移除不必要的光照
4. ES2017 构建目标
5. WebGPU → WebGL2 → WebGL1 自动降级

### 构建与体积
1. APK 缩小（ndk.abiFilters、material、minify）
2. Vite + vite-plugin-singlefile → ~1.3MB
3. 移除 LruCache、RGB_565、冗余日志
4. 移除 96x96 硬编码缩放
5. 移除 2MB three.cjs → CDN

### 动画性能
1. 全局动画速度 2x（500ms → 250ms）
2. 30 秒轮询 → 精确 setTimeout + 电池驱动
3. 全局 ANIM_DURATION 变量
4. materialEasing 缓动

### 代码结构
1. main.js（2520 行）→ 16 模块（2680 行）
2. 45 个 function → 箭头函数
3. var → const/let
4. 全局变量 → state 对象
5. 内联样式 → CSS 类
6. 提取独立模块

### 其他优化
1. 设置保存后即时重建，无需刷新
2. 逐个加载图标 + loading 控制
3. 所有布局 Z 深度排序
4. 全局动画状态机
5. 消除多余 console.warn

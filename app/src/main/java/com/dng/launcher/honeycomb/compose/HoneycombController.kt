package com.dng.launcher.honeycomb.compose

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.SaverScope
import androidx.compose.ui.geometry.Offset
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlin.math.*

/**
 * 蜂巢物理滚动控制器
 *
 * 管理三种物理行为：
 * 1. Fling 惯性滚动（指数衰减）
 * 2. 弹簧回弹（欠阻尼简谐运动）
 * 3. 启动动画状态机
 *
 * 同时负责触觉反馈（haptic tick）
 */
class HoneycombController(
    private val context: Context,
    private val maxBound: Float = 2000f
) {
    // ==================== 状态流 ====================
    private val _offset = MutableStateFlow(Offset.Zero)
    val offset: StateFlow<Offset> = _offset.asStateFlow()

    private val _phase = MutableStateFlow<ScrollPhase>(ScrollPhase.Idle)
    val phase: StateFlow<ScrollPhase> = _phase.asStateFlow()

    private val _launchState = MutableStateFlow<LaunchState>(LaunchState.Idle)
    val launchState: StateFlow<LaunchState> = _launchState.asStateFlow()

    // 速度采样
    private val velocitySamples = mutableListOf<Offset>()
    private val maxSamples = 5

    // 最近中心的 App（用于 haptic）
    private var lastCenterApp: String? = null

    // 协程作用域
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var flingJob: Job? = null
    private var springJob: Job? = null

    // 触觉反馈
    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    // ==================== 手势回调 ====================

    fun onDragStart() {
        flingJob?.cancel()
        springJob?.cancel()
        velocitySamples.clear()
        _phase.value = ScrollPhase.Dragging
    }

    fun onDrag(delta: Offset) {
        val current = _offset.value
        var newX = current.x + delta.x
        var newY = current.y + delta.y

        // 边界橡皮筋阻尼
        val damped = applyRubberBand(newX, newY)
        newX = damped.x
        newY = damped.y

        _offset.value = Offset(newX, newY)

        // 采样速度
        velocitySamples.add(delta)
        if (velocitySamples.size > maxSamples) velocitySamples.removeAt(0)
    }

    fun onDragEnd() {
        val velocity = computeAverageVelocity()
        val speed = sqrt(velocity.x * velocity.x + velocity.y * velocity.y)

        if (speed > 0.5f) {
            _phase.value = ScrollPhase.Flinging(velocity.x, velocity.y)
            startFling(velocity.x, velocity.y)
        } else {
            checkAndSpringBack()
        }
    }

    fun onDragCancel() {
        checkAndSpringBack()
    }

    // ==================== Fling 惯性滚动 ====================

    /**
     * 指数衰减惯性滚动
     *
     * 数学模型：
     *   v(t+dt) = v(t) × friction^dt
     *   x(t+dt) = x(t) + v(t) × dt
     *
     * friction = 0.997（每毫秒保留99.7%速度，约3秒停止）
     *
     * 边界检测：越界即时中断 → 进入 SpringBack
     */
    private fun startFling(vx: Float, vy: Float) {
        flingJob?.cancel()
        flingJob = scope.launch {
            val friction = 0.997f
            var cvx = vx
            var cvy = vy
            var pos = _offset.value
            var lastTime = System.nanoTime()

            while (isActive) {
                delay(16) // ~60fps
                val now = System.nanoTime()
                val dtMs = ((now - lastTime) / 1_000_000f).coerceIn(0.1f, 50f)
                lastTime = now

                // 速度衰减
                val frictionDt = friction.pow(dtMs)
                cvx *= frictionDt
                cvy *= frictionDt

                // 位置更新
                var newX = pos.x + cvx * dtMs
                var newY = pos.y + cvy * dtMs

                // 边界检测
                if (isOutOfBounds(newX, newY)) {
                    // 撞边界 → 回弹
                    newX = newX.coerceIn(-maxBound, maxBound)
                    newY = newY.coerceIn(-maxBound, maxBound)
                    _offset.value = Offset(newX, newY)
                    startSpringBack(newX, newY)
                    return@launch
                }

                // 速度过低 → 停止
                val speed = sqrt(cvx * cvx + cvy * cvy)
                if (speed < 0.01f) {
                    _offset.value = Offset(newX, newY)
                    checkAndSpringBack()
                    return@launch
                }

                pos = Offset(newX, newY)
                _offset.value = pos
            }
        }
    }

    // ==================== 弹簧回弹 ====================

    /**
     * 欠阻尼简谐运动回弹
     *
     * 数学模型：
     *   x(t) = target + A × e^(-ζωt) × cos(ωd × t)
     *
     * 参数：
     *   ζ = 0.5（阻尼比，欠阻尼 → 2-3次可见振荡）
     *   ω = 12 rad/s（固有频率，约2Hz）
     *   ωd = ω × √(1 - ζ²) = 12 × √0.75 ≈ 10.39 rad/s（阻尼频率）
     *   A = |current - target|（初始振幅）
     *
     * 为什么用 cos 而非弹簧力 F=-kx？
     *   cos 形式可以直接计算任意时刻位置，无需逐帧积分
     *   数值稳定性更好，不会因 dt 不均匀产生能量漂移
     */
    private fun startSpringBack(fromX: Float, fromY: Float) {
        springJob?.cancel()
        springJob = scope.launch {
            val targetX = fromX.coerceIn(-maxBound, maxBound)
            val targetY = fromY.coerceIn(-maxBound, maxBound)

            val ampX = fromX - targetX
            val ampY = fromY - targetY
            if (abs(ampX) < 0.5f && abs(ampY) < 0.5f) {
                _offset.value = Offset(targetX, targetY)
                _phase.value = ScrollPhase.Idle
                return@launch
            }

            _phase.value = ScrollPhase.SpringBack(targetX, targetY)

            val zeta = 0.5f        // 阻尼比
            val omega = 12f        // 固有频率
            val omegaD = omega * sqrt(1f - zeta * zeta) // 阻尼频率
            val startTime = System.nanoTime()

            while (isActive) {
                delay(16)
                val t = (System.nanoTime() - startTime) / 1_000_000_000f

                val envelope = exp(-zeta * omega * t)
                val oscillation = cos(omegaD * t)

                val newX = targetX + ampX * envelope * oscillation
                val newY = targetY + ampY * envelope * oscillation

                _offset.value = Offset(newX, newY)

                // 振幅足够小 → 精确归位
                if (envelope * max(abs(ampX), abs(ampY)) < 0.3f) {
                    _offset.value = Offset(targetX, targetY)
                    _phase.value = ScrollPhase.Idle
                    return@launch
                }
            }
        }
    }

    // ==================== 启动动画 ====================

    fun startLaunch(node: AppNode, centerX: Float, centerY: Float) {
        _launchState.value = LaunchState.Launching(
            targetApp = node.app,
            targetNode = node,
            startTime = System.nanoTime(),
            duration = 400L
        )
    }

    fun finishLaunch() {
        _launchState.value = LaunchState.Idle
    }

    // ==================== Haptic Tick ====================

    /**
     * 检测最接近屏幕中心的 App 是否发生变化
     * 变化时触发微震动（机械齿轮咔哒感）
     */
    fun updateNearestCenter(nodes: List<AppNode>, centerX: Float, centerY: Float) {
        var nearestNode: AppNode? = null
        var nearestDist = Float.MAX_VALUE

        for (node in nodes) {
            val dx = node.screenX - centerX
            val dy = node.screenY - centerY
            val distSq = dx * dx + dy * dy
            if (distSq < nearestDist) {
                nearestDist = distSq
                nearestNode = node
            }
        }

        val currentApp = nearestNode?.app?.packageName
        if (currentApp != null && currentApp != lastCenterApp) {
            lastCenterApp = currentApp
            triggerHaptic()
        }
    }

    private fun triggerHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                vibrator.vibrate(
                    VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                )
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(10)
            }
        } catch (_: Exception) {}
    }

    // ==================== 辅助方法 ====================

    private fun applyRubberBand(x: Float, y: Float): Offset {
        val damping = 0.33f
        var nx = x
        var ny = y
        if (x > maxBound) nx = maxBound + (x - maxBound) * damping
        else if (x < -maxBound) nx = -maxBound + (x + maxBound) * damping
        if (y > maxBound) ny = maxBound + (y - maxBound) * damping
        else if (y < -maxBound) ny = -maxBound + (y + maxBound) * damping
        return Offset(nx, ny)
    }

    private fun isOutOfBounds(x: Float, y: Float): Boolean {
        return x < -maxBound || x > maxBound || y < -maxBound || y > maxBound
    }

    private fun computeAverageVelocity(): Offset {
        if (velocitySamples.isEmpty()) return Offset.Zero
        var sx = 0f; var sy = 0f; var sw = 0f
        for (i in velocitySamples.indices) {
            val w = (i + 1).toFloat()
            sx += velocitySamples[i].x * w
            sy += velocitySamples[i].y * w
            sw += w
        }
        return Offset(sx / sw / 16f, sy / sw / 16f) // 转为 px/ms
    }

    private fun checkAndSpringBack() {
        val pos = _offset.value
        if (isOutOfBounds(pos.x, pos.y)) {
            startSpringBack(pos.x, pos.y)
        } else {
            _phase.value = ScrollPhase.Idle
        }
    }

    /**
     * 物理返回键：平滑回弹到 (0,0)
     */
    fun bounceToCenter() {
        val pos = _offset.value
        if (abs(pos.x) > 1f || abs(pos.y) > 1f) {
            startSpringBack(pos.x, pos.y)
        }
    }

    fun destroy() {
        flingJob?.cancel()
        springJob?.cancel()
        scope.cancel()
    }

    companion object {
        /**
         * 进程恢复 Saver：持久化 totalOffset
         */
        fun saver(context: Context, maxBound: Float) = object : Saver<HoneycombController, Any> {
            override fun SaverScope.save(value: HoneycombController): Any {
                val pos = value.offset.value
                return listOf(pos.x, pos.y)
            }
            override fun restore(value: Any): HoneycombController {
                val list = value as? List<*> ?: return HoneycombController(context, maxBound)
                val x = (list.getOrNull(0) as? Float) ?: 0f
                val y = (list.getOrNull(1) as? Float) ?: 0f
                val controller = HoneycombController(context, maxBound)
                controller._offset.value = Offset(x, y)
                return controller
            }
        }
    }
}

package com.dng.launcher.honeycomb

import android.animation.ValueAnimator
import android.view.animation.DecelerateInterpolator
import kotlin.math.*

/**
 * 蜂巢桌面物理滚动控制器
 *
 * 实现三阶段滚动行为：
 *   1. 手指拖动 → 直接跟随（带边界阻尼）
 *   2. 松手 Fling → 惯性衰减滚动
 *   3. 越界回弹 → 弹簧振荡
 *
 * 物理模型：
 * - Fling 阶段使用指数衰减：v(t) = v₀ × friction^t
 * - 回弹阶段使用简谐运动：x(t) = A × e^(-ζωt) × cos(ωdt + φ)
 *   其中 ζ 是阻尼比，ω 是固有频率，ωd 是阻尼频率
 */
class HoneycombScrollTracker {

    // ==================== 速度采样 ====================

    /** 速度采样环形缓冲区 */
    private data class VelocitySample(val vx: Float, val vy: Float, val time: Long)

    private val samples = mutableListOf<VelocitySample>()
    private val maxSamples = 5

    /**
     * 添加速度采样点
     *
     * 每次 ACTION_MOVE 时调用，记录瞬时速度。
     * 使用环形缓冲区保留最近 N 个采样，用于计算平均速度。
     */
    fun addVelocitySample(dx: Float, dy: Float) {
        val now = System.nanoTime()
        samples.add(VelocitySample(dx, dy, now))
        if (samples.size > maxSamples) {
            samples.removeAt(0)
        }
    }

    /**
     * 计算加权平均速度
     *
     * 使用加权平均：最近的采样权重更高。
     * 这避免了手指减速时的误判（最后几个采样最能代表松手时的真实意图）。
     *
     * 权重公式：w_i = (i + 1) / sum(1..N)
     *
     * 返回像素/毫秒的速度向量
     */
    fun getAverageVelocity(): Velocity2D {
        if (samples.isEmpty()) return Velocity2D(0f, 0f)

        var sumVx = 0f
        var sumVy = 0f
        var sumWeight = 0f

        for (i in samples.indices) {
            val weight = (i + 1).toFloat()
            sumVx += samples[i].vx * weight
            sumVy += samples[i].vy * weight
            sumWeight += weight
        }

        // 转换为像素/毫秒（假设采样间隔约 16ms）
        val scale = 1f / 16f
        return Velocity2D(
            (sumVx / sumWeight) * scale,
            (sumVy / sumWeight) * scale
        )
    }

    fun clearSamples() {
        samples.clear()
    }

    // ==================== Fling 惯性滚动 ====================

    private var flingAnimator: ValueAnimator? = null
    private var springAnimator: ValueAnimator? = null

    /**
     * 启动惯性滚动
     *
     * 物理模型：指数衰减
     *   v(t) = v₀ × friction^(t/dt)
     *   x(t) = x₀ + v₀ × dt × (1 - friction^(t/dt)) / (1 - friction)
     *
     * 其中：
     *   v₀ = 初始速度（像素/毫秒）
     *   friction = 摩擦系数（每毫秒的速度衰减比，0.997 ≈ 约3秒停下来）
     *   dt = 帧间隔（16ms）
     *
     * 边界处理：
     *   当位置超出边界时，进入回弹阶段。
     *   使用"越界检测 + 即时中断"模式，确保响应延迟 < 1帧。
     */
    fun fling(
        velocityX: Float,
        velocityY: Float,
        startX: Float,
        startY: Float,
        minX: Float, maxX: Float,
        minY: Float, maxY: Float,
        onTick: (Float, Float) -> Unit
    ) {
        stop()

        val initialSpeed = sqrt(velocityX * velocityX + velocityY * velocityY)
        if (initialSpeed < 0.01f) {
            // 速度太小，直接检查是否需要回弹
            springBack(startX, startY, minX, maxX, minY, maxY, onTick)
            return
        }

        // 摩擦系数：每毫秒保留 99.7% 的速度
        // 经验值：0.997 对应约 3 秒的滑行距离
        val friction = 0.997f

        // 计算预期停止时间（速度衰减到 0.01f 以下）
        // 0.01 = friction^t → t = ln(0.01) / ln(friction)
        val stopTimeMs = (ln(0.01) / ln(friction)).toLong().coerceIn(100, 4000)

        var currentX = startX
        var currentY = startY
        var vx = velocityX
        var vy = velocityY
        var lastTime = System.nanoTime()

        flingAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = stopTimeMs
            interpolator = DecelerateInterpolator(1.5f)

            addUpdateListener {
                val now = System.nanoTime()
                val dtMs = (now - lastTime) / 1_000_000f // 毫秒
                lastTime = now

                if (dtMs <= 0 || dtMs > 100) return@addUpdateListener

                // 指数衰减更新速度
                // v(t+dt) = v(t) × friction^dt
                val frictionDt = friction.pow(dtMs)
                vx *= frictionDt
                vy *= frictionDt

                // 位置更新：x += v × dt
                currentX += vx * dtMs
                currentY += vy * dtMs

                // 边界检测
                val outOfBounds = currentX < minX || currentX > maxX ||
                                  currentY < minY || currentY > maxY

                if (outOfBounds) {
                    // 撞到边界 → 停止 Fling，启动回弹
                    cancel()
                    // 夹紧到边界
                    currentX = currentX.coerceIn(minX, maxX)
                    currentY = currentY.coerceIn(minY, maxY)
                    onTick(currentX, currentY)
                    springBack(currentX, currentY, minX, maxX, minY, maxY, onTick)
                    return@addUpdateListener
                }

                // 速度低于阈值 → 停止
                val speed = sqrt(vx * vx + vy * vy)
                if (speed < 0.005f) {
                    cancel()
                    // 检查是否需要回弹
                    springBack(currentX, currentY, minX, maxX, minY, maxY, onTick)
                    return@addUpdateListener
                }

                onTick(currentX, currentY)
            }
        }
        flingAnimator?.start()
    }

    // ==================== 弹簧回弹 ====================

    /**
     * 弹簧回弹动画
     *
     * 物理模型：欠阻尼简谐运动（Underdamped Harmonic Oscillator）
     *
     *   x(t) = target + A × e^(-ζωt) × cos(ωd × t + φ)
     *
     * 其中：
     *   A = 初始振幅 = |start - target|
     *   ζ = 阻尼比 = 0.5（欠阻尼，有微弱振荡）
     *   ω = 固有频率 = 12 rad/s（约2Hz，控制回弹速度）
     *   ωd = 阻尼频率 = ω × √(1 - ζ²)
     *   φ = 初始相位 = 0
     *
     * 为什么选择 ζ = 0.5？
     * - ζ < 1 是欠阻尼：有振荡但快速衰减
     * - ζ = 0.5 给出约 2-3 次可见振荡，视觉上"活泼但不烦人"
     * - Apple Watch 使用类似的欠阻尼回弹
     *
     * 为什么用 cos 而不是弹簧力 F = -kx？
     * - cos 形式可以直接计算任意时刻的位置，无需逐帧积分
     * - 数值稳定性更好，不会因为 dt 不均匀而产生能量漂移
     */
    fun springBack(
        currentX: Float, currentY: Float,
        minX: Float, maxX: Float,
        minY: Float, maxY: Float,
        onTick: (Float, Float) -> Unit
    ) {
        // 计算目标位置（最近的合法边界点）
        val targetX = currentX.coerceIn(minX, maxX)
        val targetY = currentY.coerceIn(minY, maxY)

        // 如果已经在合法范围内，不需要回弹
        val distSq = (currentX - targetX).pow(2) + (currentY - targetY).pow(2)
        if (distSq < 0.1f) return

        stop()

        // 弹簧参数
        val dampingRatio = 0.5f      // 阻尼比 ζ（欠阻尼）
        val naturalFreq = 12f        // 固有频率 ω (rad/s)
        val dampedFreq = naturalFreq * sqrt(1f - dampingRatio * dampingRatio) // ωd

        // 初始振幅
        val amplitudeX = currentX - targetX
        val amplitudeY = currentY - targetY

        val startTime = System.nanoTime()

        springAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            // 回弹持续时间：约 5 个时间常数（e^(-5) ≈ 0.007，基本静止）
            // 时间常数 τ = 1 / (ζ × ω)
            val tau = 1f / (dampingRatio * naturalFreq)
            duration = (tau * 5 * 1000).toLong().coerceIn(200, 2000)

            addUpdateListener {
                val elapsed = (System.nanoTime() - startTime) / 1_000_000_000f // 秒

                // 欠阻尼简谐运动
                // x(t) = target + A × e^(-ζωt) × cos(ωd × t)
                val envelope = exp(-dampingRatio * naturalFreq * elapsed)
                val oscillation = cos(dampedFreq * elapsed)

                val newX = targetX + amplitudeX * envelope * oscillation
                val newY = targetY + amplitudeY * envelope * oscillation

                onTick(newX, newY)

                // 振幅衰减到足够小后停止
                if (envelope * max(abs(amplitudeX), abs(amplitudeY)) < 0.5f) {
                    cancel()
                    onTick(targetX, targetY) // 精确停在目标位置
                }
            }
        }
        springAnimator?.start()
    }

    /**
     * 立即停止所有动画
     */
    fun stop() {
        flingAnimator?.cancel()
        flingAnimator = null
        springAnimator?.cancel()
        springAnimator = null
        clearSamples()
    }

    fun isRunning(): Boolean {
        return (flingAnimator?.isRunning == true) || (springAnimator?.isRunning == true)
    }
}

/**
 * 二维速度向量
 */
data class Velocity2D(val x: Float, val y: Float)

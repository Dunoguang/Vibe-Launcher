package com.dng.launcher.honeycomb.compose

import kotlin.math.*

/**
 * 蜂巢六边形几何数学引擎
 *
 * 核心数学模型：
 * 轴向坐标系 Axial (q, r) + 立方坐标系 Cubic (q, r, s)
 * 约束：q + r + s = 0
 */
object HexMathEngine {

    private val SQRT3 = sqrt(3.0f)

    /**
     * 轴向坐标 (q, r) → 屏幕像素坐标 (x, y)
     *
     * Flat-Top 六边形变换矩阵：
     *   x = cellSize × 1.5 × q
     *   y = cellSize × (√3/2 × q + √3 × r)
     *
     * 推导：相邻六边形水平间距 = 1.5 × 边长（错位排列）
     *       相邻行垂直间距 = √3 × 边长（正三角形高）
     */
    fun axialToPixel(q: Int, r: Int, cellSize: Float): Pair<Float, Float> {
        val x = cellSize * 1.5f * q
        val y = cellSize * (SQRT3 / 2f * q + SQRT3 * r)
        return Pair(x, y)
    }

    /**
     * 屏幕像素坐标 → 最近的轴向坐标（逆变换）
     *
     * 逆矩阵：
     *   q = (2/3 × x) / cellSize
     *   r = (-1/3 × x + √3/3 × y) / cellSize
     *
     * 然后用立方坐标舍入法修正到最近的六边形中心
     */
    fun pixelToAxial(x: Float, y: Float, cellSize: Float): Pair<Int, Int> {
        val qf = (2f / 3f * x) / cellSize
        val rf = (-1f / 3f * x + SQRT3 / 3f * y) / cellSize
        return roundCube(qf, rf)
    }

    /**
     * 立方坐标舍入法（Cube Coordinate Rounding）
     *
     * 将浮点立方坐标 (q, r, s) 舍入到最近的有效整数立方坐标。
     * 算法：
     *   1. 分别四舍五入 q, r, s
     *   2. 找到偏差最大的轴（因为它对约束 q+r+s=0 影响最大）
     *   3. 重置该轴 = -其他两轴之和
     *
     * 这保证了舍入后的坐标始终在有效的六边形网格上
     */
    private fun roundCube(qf: Float, rf: Float): Pair<Int, Int> {
        val sf = -qf - rf
        var q = round(qf)
        var r = round(rf)
        var s = round(sf)

        val dq = abs(q - qf)
        val dr = abs(r - rf)
        val ds = abs(s - sf)

        // 重置偏差最大的轴
        when {
            dq > dr && dq > ds -> q = -r - s
            dr > ds            -> r = -q - s
            // else: s 自动满足约束
        }
        return Pair(q.toInt(), r.toInt())
    }

    /**
     * 生成蜂窝网格坐标（从中心按环扩展）
     *
     * 算法：
     *   ring 0: 中心 (0,0)
     *   ring 1: 6个邻居
     *   ring 2: 12个格子
     *   ...
     *   ring N: 6N 个格子
     *
     * 总格子数 = 1 + 3N(N+1)（六边形数）
     *
     * 每环从起始位置 (-ring, ring) 开始，沿6个方向各走 ring 步
     */
    fun generateHoneycombCoords(maxRings: Int): List<Pair<Int, Int>> {
        val coords = mutableListOf(0 to 0)
        val directions = listOf(
            1 to 0, 1 to -1, 0 to -1,
            -1 to 0, -1 to 1, 0 to 1
        )
        for (ring in 1..maxRings) {
            var q = -ring
            var r = ring
            for ((dq, dr) in directions) {
                repeat(ring) {
                    coords.add(q to r)
                    q += dq
                    r += dr
                }
            }
        }
        return coords
    }

    /**
     * 鱼眼缩放函数（高斯衰减）
     *
     * Scale = min + (max - min) × exp(-d² / 2σ²)
     *
     * 参数：
     *   d = 归一化距离（图标到屏幕中心的距离 / 屏幕短边半径）
     *   σ = 衰减速度（越大衰减越慢，中心区域越大）
     *
     * 特性：
     *   - d=0 时 Scale=max（中心最大）
     *   - d→∞ 时 Scale=min（边缘最小）
     *   - 变化率在 d=σ 处最大（高斯拐点）
     */
    fun fisheyeScale(
        normalizedDist: Float,
        minScale: Float,
        maxScale: Float,
        sigma: Float
    ): Float {
        val gaussian = exp(-(normalizedDist * normalizedDist) / (2f * sigma * sigma))
        return minScale + (maxScale - minScale) * gaussian
    }

    /**
     * 向心挤压修正（Pushing Effect）
     *
     * 核心公式：d' = d × Scale
     *
     * 原理：当图标缩小（Scale < 1）时，修正后的距离 d' = d×Scale < d，
     * 即图标向屏幕中心收拢。这自动消除了边缘空隙，产生球体包裹感。
     *
     * 为什么等价于球面投影？
     *   想象所有图标贴在一个球面上，中心图标正对你（最大），
     *   边缘图标在球的侧面（缩小并收拢）。
     *   d' = d × Scale 正是将平面坐标投影到球面的近似。
     */
    fun pushPosition(
        centerDx: Float,
        centerDy: Float,
        dist: Float,
        scale: Float
    ): Pair<Float, Float> {
        if (dist < 0.1f) return Pair(0f, 0f)
        val pushFactor = scale
        val ratio = pushFactor // d'/d = scale
        return Pair(centerDx * ratio, centerDy * ratio)
    }

    /**
     * 边缘淡出 Alpha
     *
     * 当归一化距离 > fadeStartDist 时，线性淡出到 0
     * 淡出范围 = fadeStartDist ~ (fadeStartDist + 0.3)
     */
    fun edgeAlpha(normalizedDist: Float, fadeStart: Float): Float {
        if (normalizedDist <= fadeStart) return 1f
        return max(0f, 1f - (normalizedDist - fadeStart) * 3.3f)
    }
}

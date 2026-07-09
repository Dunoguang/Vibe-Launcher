package com.dng.launcher.honeycomb

import android.graphics.Bitmap

/**
 * 蜂巢桌面图标数据结构
 */
data class WatchAppIcon(
    val packageName: String,
    val label: String,
    val bitmap: Bitmap,
    val isSystem: Boolean = false
)

/**
 * 蜂巢轴向坐标（Axial Coordinates）
 *
 * 六边形网格使用轴向坐标系 (q, r)，而非简单的 (row, col)。
 * 这是六边形几何的标准数学模型：
 *
 *   q 轴 → 东南方向
 *   r 轴 → 南方向
 *   隐含的 s 轴 = -(q + r) → 西南方向（立方坐标约束：q + r + s = 0）
 *
 * 相邻六边形的6个方向向量：
 *   (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)
 */
data class AxialCoord(val q: Int, val r: Int) {
    /** 立方坐标 s = -(q + r) */
    val s: Int get() = -q - r

    /** 到原点的六边形曼哈顿距离 = (|q| + |r| + |s|) / 2 */
    fun hexDistance(): Int {
        val absQ = Math.abs(q)
        val absR = Math.abs(r)
        val absS = Math.abs(s)
        return (absQ + absR + absS) / 2
    }

    companion object {
        /**
         * 生成蜂窝网格的所有坐标（从中心向外按环扩展）
         *
         * 算法：从 ring=0 开始，逐环生成6条边，每条边 ring 个格子
         * 这保证了图标从中心向外的自然排列顺序
         */
        fun generateHoneycomb(maxRings: Int): List<AxialCoord> {
            val coords = mutableListOf(AxialCoord(0, 0)) // 中心
            for (ring in 1..maxRings) {
                // 从 ring 层的起始位置 (-ring, ring) 开始
                var q = -ring
                var r = ring
                // 6条边，每条边 ring 步
                // 方向向量: (1,0), (1,-1), (0,-1), (-1,0), (-1,1), (0,1)
                val directions = listOf(
                    intArrayOf(1, 0), intArrayOf(1, -1), intArrayOf(0, -1),
                    intArrayOf(-1, 0), intArrayOf(-1, 1), intArrayOf(0, 1)
                )
                for (dir in directions) {
                    for (step in 0 until ring) {
                        coords.add(AxialCoord(q, r))
                        q += dir[0]
                        r += dir[1]
                    }
                }
            }
            return coords
        }
    }
}

/**
 * 轴向坐标 → 屏幕像素坐标的转换器
 *
 * 数学推导（Flat-Top 六边形）：
 *
 * 对于边长为 size 的正六边形：
 *   宽度 w = 2 * size
 *   高度 h = √3 * size
 *
 * 轴向坐标 (q, r) 到笛卡尔坐标 (x, y) 的转换矩阵：
 *   x = size * (3/2 * q)
 *   y = size * (√3/2 * q + √3 * r)
 *
 * 加上 padding（图标间距）后的完整公式：
 *   x = (size + padding) * 1.5 * q
 *   y = (size + padding) * (√3/2 * q + √3 * r)
 *
 * 注意：这里 size 是图标的半径（从中心到边缘），而非六边形的边长。
 * 实际的间距是 (2*size + padding) 的一半，即 (size + padding/2)。
 */
class HexGridMath(
    private val iconRadius: Float,    // 图标半径 R（像素）
    private val padding: Float        // 图标间距（像素）
) {
    // 有效半径 = 图标半径 + 间距/2
    // 这决定了六边形网格的"单元格大小"
    private val cellSize = iconRadius + padding / 2f

    // √3 常量，六边形几何的核心
    private val SQRT3 = Math.sqrt(3.0).toFloat()

    /**
     * 轴向坐标 → 屏幕像素坐标
     *
     * 这是六边形几何的标准变换：
     *   x = cellSize * 1.5 * q
     *   y = cellSize * (√3/2 * q + √3 * r)
     *
     * 为什么是 1.5 和 √3/2？
     * - 水平方向：相邻六边形中心距 = 1.5 * 边长（错位排列导致只有3/4的水平重叠）
     * - 垂直方向：相邻行间距 = √3/2 * 边长（正三角形的高）
     */
    fun axialToPixel(coord: AxialCoord): Pair<Float, Float> {
        val x = cellSize * 1.5f * coord.q
        val y = cellSize * (SQRT3 / 2f * coord.q + SQRT3 * coord.r)
        return Pair(x, y)
    }

    /**
     * 屏幕像素坐标 → 最近的轴向坐标（逆变换）
     *
     * 使用逆矩阵求解：
     *   q = (2/3 * x) / cellSize
     *   r = (-1/3 * x + √3/3 * y) / cellSize
     *
     * 然后四舍五入到最近的六边形中心（立方坐标舍入法）
     */
    fun pixelToAxial(x: Float, y: Float): AxialCoord {
        val q = (2f / 3f * x) / cellSize
        val r = (-1f / 3f * x + SQRT3 / 3f * y) / cellSize
        return roundAxial(q, r)
    }

    /**
     * 立方坐标舍入法（Cube Coordinate Rounding）
     *
     * 将浮点立方坐标舍入到最近的有效整数立方坐标。
     * 算法：找到 q, r, s 中偏差最大的轴，优先舍入它，
     * 然后用约束 q + r + s = 0 推导出第三个坐标。
     */
    private fun roundAxial(qf: Float, rf: Float): AxialCoord {
        val sf = -qf - rf
        var q = Math.round(qf).toFloat()
        var r = Math.round(rf).toFloat()
        var s = Math.round(sf).toFloat()

        val dq = Math.abs(q - qf)
        val dr = Math.abs(r - rf)
        val ds = Math.abs(s - sf)

        // 重置偏差最大的那个轴
        if (dq > dr && dq > ds) {
            q = -r - s
        } else if (dr > ds) {
            r = -q - s
        }
        // s 由约束自动满足

        return AxialCoord(q.toInt(), r.toInt())
    }
}

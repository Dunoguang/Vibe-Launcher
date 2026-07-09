package com.dng.launcher.honeycomb

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.*

/**
 * Apple Watch 风格蜂巢图标桌面 — Canvas 自绘 View
 *
 * 核心渲染架构：
 * - 使用原生 Canvas + Bitmap 矩阵变换，不用 View 层级
 * - 所有图标在单个 onDraw() 中批量绘制
 * - 鱼眼缩放 + 位置修正（Pushing Effect）实现饱满包裹感
 */
class HoneycombCanvasView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // ==================== 配置参数 ====================

    /** 图标半径 R（像素） */
    var iconRadius = 80f
        set(value) { field = value; hexMath = HexGridMath(value, iconPadding); invalidate() }

    /** 图标间距 padding（像素） */
    var iconPadding = 16f
        set(value) { field = value; hexMath = HexGridMath(iconRadius, value); invalidate() }

    /** 鱼眼最大缩放（屏幕中心） */
    var fisheyeMaxScale = 1.35f

    /** 鱼眼最小缩放（屏幕边缘） */
    var fisheyeMinScale = 0.20f

    /** 鱼眼衰减速度（高斯函数的 σ） */
    var fisheyeSigma = 0.75f

    /** 边缘淡出起始距离（归一化，0~1.5） */
    var fadeStartDist = 1.1f

    // ==================== 内部状态 ====================

    private var hexMath = HexGridMath(iconRadius, iconPadding)
    private var icons = listOf<WatchAppIcon>()
    private var iconPositions = listOf<Pair<Float, Float>>() // 轴向坐标转换后的基础位置

    // 全局偏移量（由滚动控制器驱动）
    var offsetX = 0f
    var offsetY = 0f

    // 屏幕中心
    private var centerX = 0f
    private var centerY = 0f

    // 最大滚动边界（所有图标能组成的最大外接半径）
    private var maxBoundRadius = 0f

    // 绘制用的矩阵和画笔
    private val drawMatrix = Matrix()
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = 28f
        typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
        setShadowLayer(4f, 0f, 1f, Color.parseColor("#80000000"))
    }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = Color.parseColor("#33FFFFFF")
    }

    // 点击检测
    private var touchDownX = 0f
    private var touchDownY = 0f
    private var isDragging = false
    private var onIconClick: ((WatchAppIcon) -> Unit)? = null

    // 物理滚动控制器
    private val scrollTracker = HoneycombScrollTracker()

    init {
        // 滚动控制器回调：每次物理动画更新偏移量并触发重绘
    }

    // ==================== 数据设置 ====================

    fun setIcons(newIcons: List<WatchAppIcon>) {
        icons = newIcons
        computeLayout()
        invalidate()
    }

    fun setOnIconClickListener(listener: (WatchAppIcon) -> Unit) {
        onIconClick = listener
    }

    /**
     * 计算蜂窝布局
     *
     * 1. 生成足够的轴向坐标
     * 2. 将图标按顺序填入坐标
     * 3. 转换为屏幕像素坐标
     * 4. 计算最大边界半径
     */
    private fun computeLayout() {
        val count = icons.size
        if (count == 0) {
            iconPositions = emptyList()
            return
        }

        // 估算需要的环数：N 个图标 ≈ 1 + 3*r*(r+1) 个格子
        val rings = ceil(sqrt((count - 1).toDouble() / 3.0)).toInt() + 1
        val coords = AxialCoord.generateHoneycomb(rings)

        // 取前 count 个坐标，转换为像素位置
        iconPositions = coords.take(count).map { hexMath.axialToPixel(it) }

        // 计算最大边界半径（最远图标到中心的距离 + 图标半径）
        maxBoundRadius = 0f
        for ((x, y) in iconPositions) {
            val dist = sqrt(x * x + y * y)
            if (dist > maxBoundRadius) maxBoundRadius = dist
        }
        maxBoundRadius += iconRadius * 2
    }

    // ==================== 核心渲染 ====================

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        centerX = w / 2f
        centerY = h / 2f
    }

    /**
     * 主绘制函数 — 每帧调用一次
     *
     * 渲染流水线：
     * 1. 遍历所有图标
     * 2. 计算屏幕坐标 = 基础位置 + 偏移量
     * 3. 计算鱼眼缩放（高斯衰减）
     * 4. 应用位置修正（Pushing Effect）
     * 5. 用 Matrix 变换绘制 Bitmap
     */
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (icons.isEmpty()) return

        val ox = offsetX
        val oy = offsetY
        val w = width.toFloat()
        val h = height.toFloat()

        for (i in icons.indices) {
            val (baseX, baseY) = iconPositions[i]

            // ---- 步骤1: 世界坐标 → 屏幕坐标 ----
            var screenX = baseX + ox + centerX
            var screenY = baseY + oy + centerY

            // ---- 步骤2: 计算到屏幕中心的归一化距离 ----
            val dx = screenX - centerX
            val dy = screenY - centerY
            val dist = sqrt(dx * dx + dy * dy)

            // 归一化距离：相对于屏幕短边的一半
            val halfShort = min(w, h) / 2f
            val normalizedDist = dist / halfShort

            // ---- 步骤3: 鱼眼缩放函数 ----
            // 高斯衰减：Scale = min + (max - min) * exp(-d² / 2σ²)
            //
            // 为什么用高斯而不是线性？
            // - 高斯函数在中心区域变化缓慢（保持大图标稳定）
            // - 在边缘变化剧烈（快速缩小）
            // - 这产生了自然的"凸透镜"效果，像 Apple Watch 一样
            val gaussian = exp(-(normalizedDist * normalizedDist) / (2f * fisheyeSigma * fisheyeSigma))
            var scale = fisheyeMinScale + (fisheyeMaxScale - fisheyeMinScale) * gaussian

            // ---- 步骤4: 位置修正（Pushing Effect）----
            //
            // 这是实现"饱满包裹感"的核心算法。
            //
            // 问题：如果只缩放不移动，边缘小图标之间会出现巨大空隙。
            //
            // 解决方案：将图标向屏幕中心"推挤"，推挤量与缩放成正比。
            //
            // 数学模型：
            //   设原始距离为 d，缩放因子为 s = f(d)
            //   修正后的距离 d' = d * s
            //
            // 为什么这样有效？
            // - 当 s < 1（边缘图标缩小），d' = d * s < d → 图标向中心靠近
            // - 当 s > 1（中心图标放大），d' = d * s > d → 图标向外扩展
            // - 这自动消除了边缘空隙，因为缩小的图标同时向中心收拢
            //
            // 这等价于 Apple Watch 的"球体包裹"效果：
            // 想象所有图标贴在一个球面上，中心图标正对你（最大），
            // 边缘图标在球的侧面（缩小并收拢）。
            if (dist > 0.1f) {
                val pushFactor = scale // 推挤因子 = 缩放因子
                val newDist = dist * pushFactor
                val ratio = newDist / dist
                screenX = centerX + dx * ratio
                screenY = centerY + dy * ratio
            }

            // ---- 步骤5: 边缘淡出 ----
            var alpha = 1f
            if (normalizedDist > fadeStartDist) {
                alpha = max(0f, 1f - (normalizedDist - fadeStartDist) * 3f)
            }

            // ---- 步骤6: 跳过屏幕外的图标（裁剪优化）----
            val drawRadius = iconRadius * scale
            if (screenX + drawRadius < 0 || screenX - drawRadius > w ||
                screenY + drawRadius < 0 || screenY - drawRadius > h) {
                continue
            }

            // ---- 步骤7: 用 Matrix 变换绘制 Bitmap ----
            val icon = icons[i]
            val bmp = icon.bitmap
            val bmpW = bmp.width.toFloat()
            val bmpH = bmp.height.toFloat()

            // 缩放 Bitmap 到目标大小
            val targetSize = drawRadius * 2f
            val scaleX = targetSize / bmpW
            val scaleY = targetSize / bmpH

            drawMatrix.reset()
            drawMatrix.setScale(scaleX, scaleY)
            drawMatrix.postTranslate(
                screenX - targetSize / 2f,
                screenY - targetSize / 2f
            )

            // 设置透明度
            iconPaint.alpha = (alpha * 255).toInt()

            // 绘制圆形裁切的图标
            canvas.save()
            canvas.clipPath(Path().apply {
                addCircle(screenX, screenY, drawRadius, Path.Direction.CW)
            })
            canvas.drawBitmap(bmp, drawMatrix, iconPaint)
            canvas.restore()

            // 绘制圆形边框
            ringPaint.alpha = (alpha * 60).toInt()
            canvas.drawCircle(screenX, screenY, drawRadius, ringPaint)

            // 绘制标签（仅在图标足够大时显示）
            if (scale > 0.5f && alpha > 0.3f) {
                labelPaint.textSize = 24f * scale
                labelPaint.alpha = (alpha * 200).toInt()
                canvas.drawText(
                    icon.label,
                    screenX,
                    screenY + drawRadius + 30f * scale,
                    labelPaint
                )
            }
        }
    }

    // ==================== 手势处理 ====================

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                touchDownX = event.x
                touchDownY = event.y
                isDragging = false
                scrollTracker.stop() // 停止正在进行的惯性动画
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - touchDownX
                val dy = event.y - touchDownY
                if (!isDragging && (dx * dx + dy * dy) > 100) {
                    isDragging = true
                }
                if (isDragging) {
                    // 更新偏移量
                    offsetX += event.x - touchDownX
                    offsetY += event.y - touchDownY
                    touchDownX = event.x
                    touchDownY = event.y

                    // 边界阻尼：拉过界时增加"橡皮筋"阻力
                    applyBoundaryDamping()

                    // 记录速度采样
                    scrollTracker.addVelocitySample(dx, dy)

                    invalidate()
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (isDragging) {
                    // 松手后启动惯性滚动
                    val velocity = scrollTracker.getAverageVelocity()
                    scrollTracker.fling(
                        velocity.x, velocity.y,
                        offsetX, offsetY,
                        -maxBoundRadius, maxBoundRadius,
                        -maxBoundRadius, maxBoundRadius,
                        onTick = { newX, newY ->
                            offsetX = newX
                            offsetY = newY
                            invalidate()
                        }
                    )
                } else {
                    // 点击检测
                    handleClick(event.x, event.y)
                }
                isDragging = false
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    /**
     * 边界阻尼（橡皮筋效果）
     *
     * 当偏移量超出合法边界时，施加额外阻力。
     * 数学模型：超出部分按 1/3 的比例衰减（阻尼系数）
     *
     * 这让过度滚动看起来像拉橡皮筋：越拉越费力
     */
    private fun applyBoundaryDamping() {
        val damping = 0.33f // 阻尼系数：超出部分只移动 1/3
        if (offsetX > maxBoundRadius) {
            offsetX = maxBoundRadius + (offsetX - maxBoundRadius) * damping
        } else if (offsetX < -maxBoundRadius) {
            offsetX = -maxBoundRadius + (offsetX + maxBoundRadius) * damping
        }
        if (offsetY > maxBoundRadius) {
            offsetY = maxBoundRadius + (offsetY - maxBoundRadius) * damping
        } else if (offsetY < -maxBoundRadius) {
            offsetY = -maxBoundRadius + (offsetY + maxBoundRadius) * damping
        }
    }

    /**
     * 点击检测：将屏幕坐标逆变换回图标空间，找最近的图标
     */
    private fun handleClick(screenX: Float, screenY: Float) {
        val w = width.toFloat()
        val h = height.toFloat()

        for (i in icons.indices) {
            val (baseX, baseY) = iconPositions[i]
            val iconScreenX = baseX + offsetX + centerX
            val iconScreenY = baseY + offsetY + centerY

            // 计算鱼眼缩放后的实际绘制半径
            val dx = iconScreenX - centerX
            val dy = iconScreenY - centerY
            val dist = sqrt(dx * dx + dy * dy)
            val halfShort = min(w, h) / 2f
            val normalizedDist = dist / halfShort
            val gaussian = exp(-(normalizedDist * normalizedDist) / (2f * fisheyeSigma * fisheyeSigma))
            val scale = fisheyeMinScale + (fisheyeMaxScale - fisheyeMinScale) * gaussian

            // 应用位置修正后的实际屏幕位置
            var finalX = centerX + dx * scale
            var finalY = centerY + dy * scale
            val drawRadius = iconRadius * scale

            // 距离检测
            val clickDist = sqrt((screenX - finalX).pow(2) + (screenY - finalY).pow(2))
            if (clickDist < drawRadius) {
                onIconClick?.invoke(icons[i])
                return
            }
        }
    }
}

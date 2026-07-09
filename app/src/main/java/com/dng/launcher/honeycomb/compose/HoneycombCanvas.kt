package com.dng.launcher.honeycomb.compose

import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlin.math.*

/**
 * Apple Watch 风格蜂巢桌面 — Jetpack Compose Canvas 核心渲染器
 *
 * 渲染架构：
 * - 单个 Canvas Composable 承载所有绘制
 * - 无 View 层级、无 LazyGrid，极致性能
 * - pointerInput 手势 + 物理动画控制器驱动状态
 */
@Composable
fun HoneycombScreen(
    apps: List<WatchApp>,
    controller: HoneycombController,
    iconManager: AppIconManager,
    badgeManager: NotificationBadgeManager?,
    onAppClick: (WatchApp) -> Unit,
    onAppLongClick: (WatchApp, Float, Float) -> Unit
) {
    val config = remember { GridConfig() }
    val cellSize = config.iconRadius + config.padding / 2f

    // 屏幕尺寸
    val screenWidth = LocalConfiguration.current.screenWidthDp.dp
    val screenHeight = LocalConfiguration.current.screenHeightDp.dp
    val density = LocalDensity.current
    val screenWPx = with(density) { screenWidth.toPx() }
    val screenHPx = with(density) { screenHeight.toPx() }
    val centerX = screenWPx / 2f
    val centerY = screenHPx / 2f
    val halfShort = min(screenWPx, screenHPx) / 2f

    // 滚动状态
    val totalOffset by controller.offset.collectAsState()
    val scrollPhase by controller.phase.collectAsState()
    val launchState by controller.launchState.collectAsState()

    // 息屏呼吸动画（仅在 Idle 时生效）
    val infiniteTransition = rememberInfiniteTransition(label = "breath")
    val breathScale by infiniteTransition.animateFloat(
        initialValue = 0.98f, targetValue = 1.02f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ), label = "breathScale"
    )
    val isIdle = scrollPhase is ScrollPhase.Idle && launchState is LaunchState.Idle

    // 构建节点列表（含通知徽标）
    val nodes = remember(apps) {
        val coords = HexMathEngine.generateHoneycombCoords(config.maxRings)
        apps.mapIndexed { i, app ->
            val (q, r) = coords.getOrElse(i) { 0 to 0 }
            val (bx, by) = HexMathEngine.axialToPixel(q, r, cellSize)
            AppNode(app = app, gridQ = q, gridR = r, baseX = bx, baseY = by)
        }
    }

    // 更新通知徽标
    LaunchedEffect(badgeManager) {
        if (badgeManager != null) {
            snapshotFlow { badgeManager.badgeCounts }
                .collect { counts ->
                    nodes.forEach { it.badgeCount = counts[it.app.packageName] ?: 0 }
                }
        }
    }

    // 视口剔除边界（比屏幕大一圈，避免边缘裁切）
    val cullRect = remember { RectF() }
    val iconRect = remember { RectF() }

    // 绘制用 Paint 缓存
    val badgePaint = remember {
        android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.parseColor("#FF4444")
        }
    }
    val badgeTextPaint = remember {
        android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            textAlign = android.graphics.Paint.Align.CENTER
            textSize = 28f
            typeface = Typeface.DEFAULT_BOLD
        }
    }
    val ringPaint = remember {
        android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 3f
            color = android.graphics.Color.parseColor("#33FFFFFF")
        }
    }

    // 手势状态
    var isDragging by remember { mutableStateOf(false) }

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = {
                        isDragging = true
                        controller.onDragStart()
                    },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        controller.onDrag(dragAmount)
                    },
                    onDragEnd = {
                        isDragging = false
                        controller.onDragEnd()
                    },
                    onDragCancel = {
                        isDragging = false
                        controller.onDragCancel()
                    }
                )
            }
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { offset ->
                        // 点击检测：找最近的图标
                        val hitNode = hitTest(
                            offset.x, offset.y, nodes, totalOffset,
                            centerX, centerY, halfShort, config
                        )
                        if (hitNode != null) {
                            controller.startLaunch(hitNode, centerX, centerY)
                            onAppClick(hitNode.app)
                        }
                    },
                    onLongPress = { offset ->
                        val hitNode = hitTest(
                            offset.x, offset.y, nodes, totalOffset,
                            centerX, centerY, halfShort, config
                        )
                        if (hitNode != null) {
                            onAppLongClick(hitNode.app, offset.x, offset.y)
                        }
                    }
                )
            }
    ) {
        drawIntoCanvas { canvas ->
            val nativeCanvas = canvas.nativeCanvas
            val ox = totalOffset.x
            val oy = totalOffset.y

            // 视口裁剪范围
            cullRect.set(
                -config.iconRadius * 2, -config.iconRadius * 2,
                size.width + config.iconRadius * 2,
                size.height + config.iconRadius * 2
            )

            // ==== 步骤1: 计算所有节点的最终位置、缩放、透明度 ====
            for (node in nodes) {
                // 世界坐标 → 屏幕坐标
                var sx = node.baseX + ox + centerX
                var sy = node.baseY + oy + centerY

                // 到屏幕中心的距离
                val dx = sx - centerX
                val dy = sy - centerY
                val dist = sqrt(dx * dx + dy * dy)
                val normalizedDist = dist / halfShort

                // 鱼眼缩放
                var scale = HexMathEngine.fisheyeScale(
                    normalizedDist, config.fisheyeMinScale,
                    config.fisheyeMaxScale, config.fisheyeSigma
                )

                // 向心挤压修正
                val (pushDx, pushDy) = HexMathEngine.pushPosition(dx, dy, dist, scale)
                sx = centerX + pushDx
                sy = centerY + pushDy

                // 呼吸微动（仅 Idle 状态）
                if (isIdle) {
                    scale *= breathScale
                }

                // 启动动画状态覆盖
                val currentLaunch = launchState
                if (currentLaunch is LaunchState.Launching) {
                    val elapsed = (System.nanoTime() - currentLaunch.startTime) / 1_000_000f
                    val t = (elapsed / currentLaunch.duration).coerceIn(0f, 1f)
                    if (node == currentLaunch.targetNode) {
                        // 目标图标移到屏幕中心并放大
                        sx += (centerX - sx) * t
                        sy += (centerY - sy) * t
                        scale *= (1f + t * 14f) // 放大到15倍
                    } else {
                        // 其他图标向外扩散并淡出
                        val scatterFactor = 1f + t * 3f
                        sx = centerX + (sx - centerX) * scatterFactor
                        sy = centerY + (sy - centerY) * scatterFactor
                        scale *= (1f - t)
                    }
                }

                // 边缘淡出
                var alpha = HexMathEngine.edgeAlpha(normalizedDist, config.fadeStartDist)
                if (currentLaunch is LaunchState.Launching && node != currentLaunch.targetNode) {
                    val elapsed = (System.nanoTime() - currentLaunch.startTime) / 1_000_000f
                    val t = (elapsed / currentLaunch.duration).coerceIn(0f, 1f)
                    alpha *= (1f - t)
                }

                node.screenX = sx
                node.screenY = sy
                node.scale = scale
                node.alpha = alpha
            }

            // ==== 步骤2: Z排序（远→近，中心图标最后绘制压在最上） ====
            // 使用距离的平方避免 sqrt 开销
            val sortedNodes = nodes.sortedByDescending {
                val dx = it.screenX - centerX
                val dy = it.screenY - centerY
                dx * dx + dy * dy
            }

            // ==== 步骤3: 遍历绘制 ====
            val drawRadius = config.iconRadius
            for (node in sortedNodes) {
                if (node.alpha <= 0.01f) continue

                val s = node.scale
                val r = drawRadius * s
                val sx = node.screenX
                val sy = node.screenY

                // 视口剔除：跳过屏幕外的图标
                iconRect.set(sx - r, sy - r, sx + r, sy + r)
                if (!RectF.intersects(cullRect, iconRect)) continue

                val bmp = iconManager.getIcon(node.app.packageName) ?: node.app.iconBitmap

                // 用 native Canvas 的 Matrix 变换绘制 Bitmap
                val matrix = android.graphics.Matrix()
                val bmpW = bmp.width.toFloat()
                val bmpH = bmp.height.toFloat()
                val targetSize = r * 2f
                matrix.setScale(targetSize / bmpW, targetSize / bmpH)
                matrix.postTranslate(sx - r, sy - r)

                // 设置透明度
                val iconPaint = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
                iconPaint.alpha = (node.alpha * 255).toInt()

                // 圆形裁切绘制
                nativeCanvas.save()
                val clipPath = android.graphics.Path().apply {
                    addCircle(sx, sy, r, android.graphics.Path.Direction.CW)
                }
                nativeCanvas.clipPath(clipPath)
                nativeCanvas.drawBitmap(bmp, matrix, iconPaint)
                nativeCanvas.restore()

                // 圆形边框
                ringPaint.alpha = (node.alpha * 60).toInt()
                nativeCanvas.drawCircle(sx, sy, r, ringPaint)

                // 通知徽标
                if (node.badgeCount > 0 && node.alpha > 0.3f) {
                    val badgeR = r * 0.28f
                    val badgeX = sx + r * 0.72f
                    val badgeY = sy - r * 0.72f
                    badgePaint.alpha = (node.alpha * 255).toInt()
                    nativeCanvas.drawCircle(badgeX, badgeY, badgeR, badgePaint)
                    badgeTextPaint.textSize = badgeR * 1.2f
                    badgeTextPaint.alpha = (node.alpha * 255).toInt()
                    val text = if (node.badgeCount > 99) "99+" else "${node.badgeCount}"
                    nativeCanvas.drawText(
                        text, badgeX, badgeY + badgeR * 0.38f, badgeTextPaint
                    )
                }
            }

            // 更新 haptic 检测
            controller.updateNearestCenter(nodes, centerX, centerY)
        }
    }
}

/**
 * 点击/长按命中检测
 *
 * 遍历所有节点，找到手指位置在哪个图标内
 * 需要应用与绘制完全一致的变换（向心挤压 + 鱼眼缩放）
 */
private fun hitTest(
    touchX: Float, touchY: Float,
    nodes: List<AppNode>,
    offset: Offset,
    centerX: Float, centerY: Float,
    halfShort: Float,
    config: GridConfig
): AppNode? {
    var bestNode: AppNode? = null
    var bestDist = Float.MAX_VALUE

    for (node in nodes) {
        val sx = node.screenX
        val sy = node.screenY
        val r = config.iconRadius * node.scale

        val dx = touchX - sx
        val dy = touchY - sy
        val distSq = dx * dx + dy * dy
        if (distSq < r * r && distSq < bestDist) {
            bestDist = distSq
            bestNode = node
        }
    }
    return bestNode
}

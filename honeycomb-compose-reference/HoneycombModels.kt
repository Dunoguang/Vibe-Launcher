package com.dng.launcher.honeycomb.compose

import android.graphics.Bitmap

// ==================== 数据模型 ====================

/**
 * 单个应用图标的数据结构
 */
data class WatchApp(
    val packageName: String,
    val label: String,
    val iconBitmap: Bitmap,
    val isSystem: Boolean = false
)

/**
 * 蜂巢网格中的节点（包含计算后的布局位置）
 */
data class AppNode(
    val app: WatchApp,
    val gridQ: Int,        // 轴向坐标 q
    val gridR: Int,        // 轴向坐标 r
    var baseX: Float = 0f, // 轴向→像素转换后的基础 X
    var baseY: Float = 0f, // 轴向→像素转换后的基础 Y
    var screenX: Float = 0f, // 最终屏幕 X（含偏移+鱼眼修正）
    var screenY: Float = 0f, // 最终屏幕 Y
    var scale: Float = 1f,   // 鱼眼缩放因子
    var alpha: Float = 1f,   // 边缘淡出透明度
    var badgeCount: Int = 0  // 通知未读数
)

/**
 * 网格配置参数
 */
data class GridConfig(
    val iconRadius: Float = 80f,    // 图标半径 R（像素）
    val padding: Float = 20f,       // 图标间距
    val fisheyeMaxScale: Float = 1.35f,
    val fisheyeMinScale: Float = 0.18f,
    val fisheyeSigma: Float = 0.75f,
    val fadeStartDist: Float = 1.15f,
    val maxRings: Int = 8
)

/**
 * 启动动画状态机
 */
sealed class LaunchState {
    data object Idle : LaunchState()
    data class Launching(
        val targetApp: WatchApp,
        val targetNode: AppNode,
        val startTime: Long,
        val duration: Long = 400L
    ) : LaunchState()
    data class Returning(
        val startTime: Long,
        val duration: Long = 300L
    ) : LaunchState()
}

/**
 * 物理滚动状态
 */
sealed class ScrollPhase {
    data object Idle : ScrollPhase()
    data object Dragging : ScrollPhase()
    data class Flinging(val velocityX: Float, val velocityY: Float) : ScrollPhase()
    data class SpringBack(val targetX: Float, val targetY: Float) : ScrollPhase()
}

/**
 * 长按弹出菜单状态
 */
data class PopupState(
    val visible: Boolean = false,
    val node: AppNode? = null,
    val screenX: Float = 0f,
    val screenY: Float = 0f,
    val shortcuts: List<ShortcutInfo> = emptyList()
)

data class ShortcutInfo(
    val id: String,
    val label: String,
    val icon: Bitmap? = null
)

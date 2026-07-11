package com.dng.launcher

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

class VibeAccessibilityService : AccessibilityService() {

    companion object {
        private var instance: VibeAccessibilityService? = null

        fun getInstance(): VibeAccessibilityService? = instance

        fun isRunning(): Boolean = instance != null
    }

    override fun onServiceConnected() {
        instance = this
        super.onServiceConnected()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 可在此处理事件，暂时留空
    }

    override fun onInterrupt() {
        // 无障碍服务中断
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}

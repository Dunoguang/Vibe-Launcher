package com.dng.launcher

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class VibeDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private var isActive = false

        fun isActive(): Boolean = isActive
    }

    override fun onEnabled(context: Context, intent: Intent) {
        isActive = true
        super.onEnabled(context, intent)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        isActive = false
        super.onDisabled(context, intent)
    }
}

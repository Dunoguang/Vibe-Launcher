package com.dng.launcher

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * 权限管理器 — ColorOS 16 风格
 *
 * 管理所有特殊权限的申请和检查
 */
class PermissionManager(private val activity: Activity) {

    companion object {
        private const val TAG = "VibePermission"
        const val REQ_WRITE_SETTINGS = 1001
        const val REQ_NOTIFICATION_LISTENER = 1002
        const val REQ_BLUETOOTH = 1003
        const val REQ_LOCATION = 1004
        const val REQ_OVERLAY = 1005

        // 所有权限状态
        data class PermissionStatus(
            val name: String,
            val granted: Boolean,
            val description: String,
            val settingsAction: String?
        )
    }

    /**
     * 检查所有权限状态
     */
    fun checkAllPermissions(): List<PermissionStatus> {
        val results = mutableListOf<PermissionStatus>()

        // WRITE_SETTINGS
        results.add(PermissionStatus(
            name = "修改系统设置",
            granted = Settings.System.canWrite(activity),
            description = "用于调节亮度、音量、自动旋转等系统设置",
            settingsAction = Settings.ACTION_MANAGE_WRITE_SETTINGS
        ))

        // 通知监听
        results.add(PermissionStatus(
            name = "通知读取",
            granted = isNotificationListenerEnabled(),
            description = "用于在桌面显示系统通知",
            settingsAction = Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
        ))

        // 蓝牙
        val hasBluetooth = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Android 12 以下不需要运行时权限
        }
        results.add(PermissionStatus(
            name = "蓝牙控制",
            granted = hasBluetooth,
            description = "用于开关蓝牙",
            settingsAction = Settings.ACTION_BLUETOOTH_SETTINGS
        ))

        // 位置（WiFi 扫描需要）
        val hasLocation = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        results.add(PermissionStatus(
            name = "位置信息",
            granted = hasLocation,
            description = "用于 WiFi 状态检测和网络信息",
            settingsAction = Settings.ACTION_LOCATION_SOURCE_SETTINGS
        ))

        // 悬浮窗（可选）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            results.add(PermissionStatus(
                name = "悬浮窗",
                granted = Settings.canDrawOverlays(activity),
                description = "用于全局快捷操作（可选）",
                settingsAction = Settings.ACTION_MANAGE_OVERLAY_PERMISSION
            ))
        }

        return results
    }

    /**
     * 请求 WRITE_SETTINGS 权限
     */
    fun requestWriteSettings(): Boolean {
        if (Settings.System.canWrite(activity)) return true

        try {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:${activity.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            Log.d(TAG, "Opened WRITE_SETTINGS page")
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open WRITE_SETTINGS: ${e.message}")
            // Fallback: open general settings
            try {
                val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
                activity.startActivity(intent)
            } catch (_: Exception) {}
            return false
        }
    }

    /**
     * 请求通知监听权限
     */
    fun requestNotificationListener(): Boolean {
        if (isNotificationListenerEnabled()) return true

        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            activity.startActivity(intent)
            Log.d(TAG, "Opened notification listener settings")
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open notification settings: ${e.message}")
            return false
        }
    }

    /**
     * 请求蓝牙权限（Android 12+）
     */
    fun requestBluetoothPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN),
                    REQ_BLUETOOTH
                )
                return false
            }
        }
        return true
    }

    /**
     * 请求位置权限
     */
    fun requestLocationPermission(): Boolean {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                REQ_LOCATION
            )
            return false
        }
        return true
    }

    /**
     * 请求悬浮窗权限
     */
    fun requestOverlayPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(activity)) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}"))
                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open overlay settings: ${e.message}")
            }
            return false
        }
        return true
    }

    /**
     * 检查通知监听是否启用
     */
    fun isNotificationListenerEnabled(): Boolean {
        return try {
            val flat = Settings.Secure.getString(
                activity.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            flat.contains("${activity.packageName}/VibeNotificationListener")
        } catch (e: Exception) {
            Log.e(TAG, "Check notification listener error: ${e.message}")
            false
        }
    }

    /**
     * 检查 WiFi 控制是否可用
     * Android 10+ 不能直接开关 WiFi，需要跳转设置面板
     */
    fun canControlWifi(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.System.canWrite(activity)
    }

    /**
     * 打开 WiFi 设置面板（Android 10+ 兼容）
     */
    fun openWifiPanel() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val intent = Intent(Settings.Panel.ACTION_WIFI)
                activity.startActivity(intent)
            } else {
                val intent = Intent(Settings.ACTION_WIFI_SETTINGS)
                activity.startActivity(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open WiFi panel: ${e.message}")
        }
    }

    /**
     * 综合权限申请（首次启动时调用）
     * 返回还需要申请的权限列表
     */
    fun getUngrantedPermissions(): List<PermissionStatus> {
        return checkAllPermissions().filter { !it.granted }
    }

    /**
     * 打开指定权限的设置页面
     */
    fun openPermissionSettings(action: String?) {
        action ?: return
        try {
            if (action == Settings.ACTION_MANAGE_WRITE_SETTINGS) {
                val intent = Intent(action).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivity(intent)
            } else {
                activity.startActivity(Intent(action))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open settings: ${e.message}")
            try {
                activity.startActivity(Intent(action))
            } catch (_: Exception) {}
        }
    }
}

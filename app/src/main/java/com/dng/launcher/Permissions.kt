package com.dng.launcher

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.dng.launcher.MusicNotificationListener
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * 权限管理类 - 负责所有权限的请求、检查和回调处理
 */
class Permissions(private val activity: Activity) {

    companion object {
        private const val TAG = "VibePermissions"
        private const val RC_RUNTIME_PERMS = 1001
        private const val RC_WRITE_SETTINGS = 1002
        private const val RC_OVERLAY = 1003
        private const val RC_ADMIN = 1004

        val RUNTIME_PERMISSIONS: Array<String> by lazy {
            val list = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.CAMERA
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                list.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            list.toTypedArray()
        }
    }

    // 回调接口
    interface PermissionCallback {
        fun onRuntimePermissionsResult(granted: List<String>, denied: List<String>)
        fun onWriteSettingsResult(canWrite: Boolean)
        fun onOverlayResult(canDraw: Boolean)
        fun onAdminResult(isActive: Boolean)
    }

    private var callback: PermissionCallback? = null

    /**
     * 请求所有权限
     */
    fun requestAllPermissions(callback: PermissionCallback? = null) {
        this.callback = callback
        requestRuntimePermissions()
        requestWriteSettings()
        requestOverlayPermission()
        requestDeviceAdmin()
        requestNotificationListener()
    }

    /**
     * 1. 请求运行时危险权限
     */
    private fun requestRuntimePermissions() {
        val needRuntime: Array<String> = RUNTIME_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (needRuntime.isNotEmpty()) {
            ActivityCompat.requestPermissions(activity, needRuntime, RC_RUNTIME_PERMS)
        } else {
            Log.d(TAG, "所有运行时权限已授予")
            callback?.onRuntimePermissionsResult(
                RUNTIME_PERMISSIONS.toList(),
                emptyList()
            )
        }
    }

    /**
     * 2. 请求 WRITE_SETTINGS 特殊权限
     */
    private fun requestWriteSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.System.canWrite(activity)) {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivityForResult(intent, RC_WRITE_SETTINGS)
        } else {
            val canWrite = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(activity)
            Log.d(TAG, "WRITE_SETTINGS 已授权: $canWrite")
            callback?.onWriteSettingsResult(canWrite)
        }
    }

    /**
     * 3. 请求 SYSTEM_ALERT_WINDOW 特殊权限
     */
    private fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(activity)) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivityForResult(intent, RC_OVERLAY)
        } else {
            val canDraw = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(activity)
            Log.d(TAG, "SYSTEM_ALERT_WINDOW 已授权: $canDraw")
            callback?.onOverlayResult(canDraw)
        }
    }

    /**
     * 4. 请求设备管理员权限
     */
    private fun requestDeviceAdmin() {
        if (!isDeviceAdminActive()) {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(
                    DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                    ComponentName(activity, Admin::class.java)
                )
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "激活设备管理员后，Vibe Launcher 可以锁定屏幕"
                )
            }
            activity.startActivityForResult(intent, RC_ADMIN)
        } else {
            Log.d(TAG, "设备管理员已激活")
            callback?.onAdminResult(true)
        }
    }

    /**
     * 检查设备管理员是否激活
     */
    fun isDeviceAdminActive(): Boolean {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val component = ComponentName(activity, Admin::class.java)
        return dpm.isAdminActive(component)
    }

    /**
     * 处理 onRequestPermissionsResult
     */
    fun handleRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (requestCode == RC_RUNTIME_PERMS) {
            val granted = mutableListOf<String>()
            val denied = mutableListOf<String>()
            permissions.forEachIndexed { i, perm ->
                if (grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    granted.add(perm)
                } else {
                    denied.add(perm)
                }
            }
            if (denied.isNotEmpty()) {
                Log.w(TAG, "权限被拒绝: $denied")
            } else {
                Log.d(TAG, "所有运行时权限已授予")
            }
            callback?.onRuntimePermissionsResult(granted, denied)
        }
    }

    /**
     * 处理 onActivityResult
     */
    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        when (requestCode) {
            RC_WRITE_SETTINGS -> {
                val canWrite = Settings.System.canWrite(activity)
                Log.d(TAG, "WRITE_SETTINGS 结果: $canWrite")
                callback?.onWriteSettingsResult(canWrite)
            }
            RC_OVERLAY -> {
                val canDraw = Settings.canDrawOverlays(activity)
                Log.d(TAG, "SYSTEM_ALERT_WINDOW 结果: $canDraw")
                callback?.onOverlayResult(canDraw)
            }
            RC_ADMIN -> {
                val isActive = isDeviceAdminActive()
                Log.d(TAG, "设备管理员结果: $isActive")
                callback?.onAdminResult(isActive)
            }
        }
    }

    /**
     * 检查所有运行时权限是否已授予
     */
    fun hasAllRuntimePermissions(): Boolean {
        return RUNTIME_PERMISSIONS.all {
            ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestNotificationListener() {
        // 检查是否已授权
        val enabled = Settings.Secure.getString(
            activity.contentResolver,
            "enabled_notification_listeners"
        )
        val component = "${activity.packageName}/${MusicNotificationListener::class.java.name}"
        if (enabled?.contains(component) == true) {
            Log.d(TAG, "通知监听已授权")
            return
        }
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "无法打开通知监听设置: ${e.message}")
        }
    }

}

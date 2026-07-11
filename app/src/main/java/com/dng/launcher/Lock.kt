package com.dng.launcher

import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build

/**
 * 设备管理员锁屏工具类
 */
object Lock {

    /**
     * 执行锁屏
     * @return true-成功, false-失败
     */
    fun lockScreen(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminName = ComponentName(context, Admin::class.java)
        
        if (!dpm.isAdminActive(adminName)) {
            return false
        }

        val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            if (keyguardManager.isKeyguardLocked) {
                return false
            }
        }

        return try {
            dpm.lockNow()
            true
        } catch (e: SecurityException) {
            false
        }
    }

    /**
     * 检查权限是否激活
     */
    fun isAdminActive(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminName = ComponentName(context, Admin::class.java)
        return dpm.isAdminActive(adminName)
    }
}
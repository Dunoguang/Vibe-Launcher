package com.dng.launcher

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Process
import android.provider.Settings

// ==================== 1. 检测数据类 ====================

data class WifiCapability(
    val apiLevel: Int,
    val isWifiEnabled: Boolean,
    val hasChangeWifiStatePerm: Boolean,          // CHANGE_WIFI_STATE 权限
    val hasAccessWifiStatePerm: Boolean,           // ACCESS_WIFI_STATE 权限
    val isDeviceOwner: Boolean,                    // 是否 Device Owner
    val hasWriteSecureSettings: Boolean,           // WRITE_SECURE_SETTINGS 权限（ADB 授予）
    val isRoot: Boolean,                           // 是否 Root
    val uid: Int,                                  // 进程 UID
    val uidLabel: String,                          // UID 标签（root/shell/app）
    val hasWifiManagerSetEnabled: Boolean,         // WifiManager.setWifiEnabled 方法是否存在
    val hasDpmSetWifiMethod: Boolean,              // DPM.setWifiEnabled 方法是否存在
    val hasSettingsPanelWifi: Boolean,             // Settings.Panel.ACTION_WIFI 是否存在
    val hasSettingsGlobalWifiOn: Boolean,          // Settings.Global.WIFI_ON 常量是否存在
)

// ==================== 2. 检测方法 ====================

/**
 * 获取 WiFi 控制能力检测结果
 */
fun getWifiCapability(context: Context): WifiCapability {
    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val isDO = dpm.isDeviceOwnerApp(context.packageName)

    return WifiCapability(
        apiLevel = Build.VERSION.SDK_INT,
        isWifiEnabled = wifiManager.isWifiEnabled,
        hasChangeWifiStatePerm = context.checkSelfPermission(Manifest.permission.CHANGE_WIFI_STATE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        hasAccessWifiStatePerm = context.checkSelfPermission(Manifest.permission.ACCESS_WIFI_STATE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        isDeviceOwner = isDO,
        hasWriteSecureSettings = hasWriteSecureSettings(context),
        isRoot = checkRoot(),
        uid = Process.myUid(),
        uidLabel = when (Process.myUid()) {
            0 -> "root"
            2000 -> "shell"
            else -> "app"
        },
        hasWifiManagerSetEnabled = checkWifiManagerSetEnabledExists(),
        hasDpmSetWifiMethod = checkDpmSetWifiMethodExists(),
        hasSettingsPanelWifi = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q,
        hasSettingsGlobalWifiOn = checkSettingsGlobalWifiOnExists()
    )
}

/**
 * 检测 WifiManager.setWifiEnabled 方法是否存在
 */
private fun checkWifiManagerSetEnabledExists(): Boolean {
    return try {
        WifiManager::class.java.getMethod("setWifiEnabled", Boolean::class.java)
        true
    } catch (e: NoSuchMethodException) {
        false
    }
}

/**
 * 检测 DevicePolicyManager.setWifiEnabled 方法是否存在
 */
private fun checkDpmSetWifiMethodExists(): Boolean {
    return try {
        DevicePolicyManager::class.java.getMethod("setWifiEnabled", ComponentName::class.java, Boolean::class.java)
        true
    } catch (e: NoSuchMethodException) {
        false
    }
}

/**
 * 检测 Settings.Global.WIFI_ON 常量是否存在
 */
private fun checkSettingsGlobalWifiOnExists(): Boolean {
    return try {
        Settings.Global::class.java.getField("WIFI_ON")
        true
    } catch (e: NoSuchFieldException) {
        false
    }
}

/**
 * 检测是否已通过 ADB 授予 WRITE_SECURE_SETTINGS 权限
 * 授予命令：adb shell pm grant 包名 android.permission.WRITE_SECURE_SETTINGS
 */
private fun hasWriteSecureSettings(context: Context): Boolean {
    return try {
        context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
    } catch (e: Exception) {
        false
    }
}

/**
 * 检测是否 Root
 */
fun checkRoot(): Boolean {
    return try {
        val process = Runtime.getRuntime().exec("su -c echo test")
        val exitCode = process.waitFor()
        process.destroy()
        exitCode == 0
    } catch (e: Exception) {
        false
    }
}

// ==================== 3. 执行方法 ====================

/**
 * 方式1：WifiManager.setWifiEnabled()
 * 适用：Android 9-（API 28 及以下）
 * 权限：CHANGE_WIFI_STATE
 */
@Suppress("DEPRECATION")
fun execWifiManager(context: Context, enable: Boolean): Boolean {
    if (Build.VERSION.SDK_INT > Build.VERSION_CODES.P) {
        return false
    }
    if (!checkWifiManagerSetEnabledExists()) {
        return false
    }
    return try {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.setWifiEnabled(enable)
    } catch (e: SecurityException) {
        false
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式2：DevicePolicyManager.setWifiEnabled()
 * 适用：Android 11+（API 30+）
 * 前提：应用已激活为 Device Owner
 * 权限：CHANGE_WIFI_STATE
 */
fun execDpmWifi(context: Context, adminComponent: ComponentName, enable: Boolean): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
        return false
    }
    if (!checkDpmSetWifiMethodExists()) {
        return false
    }
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    if (!dpm.isDeviceOwnerApp(context.packageName)) {
        return false
    }
    return try {
        val method = DevicePolicyManager::class.java.getMethod(
            "setWifiEnabled",
            ComponentName::class.java,
            Boolean::class.java
        )
        method.invoke(dpm, adminComponent, enable) as Boolean
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式3：Settings.Global.putInt()
 * 适用：所有版本
 * 权限：WRITE_SECURE_SETTINGS（需 ADB 授予）
 */
fun execSettingsGlobal(context: Context, enable: Boolean): Boolean {
    if (!checkSettingsGlobalWifiOnExists()) {
        return false
    }
    if (!hasWriteSecureSettings(context)) {
        return false
    }
    return try {
        Settings.Global.putInt(
            context.contentResolver,
            Settings.Global.WIFI_ON,
            if (enable) 1 else 0
        )
    } catch (e: SecurityException) {
        false
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式4a：悬浮窗 - Settings.Panel.ACTION_WIFI
 * 适用：Android 10+（API 29+）
 * 权限：无
 */
fun execOpenWifiPanel(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        return false
    }
    return try {
        val intent = Intent(Settings.Panel.ACTION_WIFI)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
            true
        } else {
            false
        }
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式4b：跳转 WiFi 设置页 - Settings.ACTION_WIFI_SETTINGS
 * 适用：所有版本
 * 权限：无
 */
fun execOpenWifiSettings(context: Context): Boolean {
    return try {
        val intent = Intent(Settings.ACTION_WIFI_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
            true
        } else {
            false
        }
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式5：svc wifi 命令
 * 适用：所有版本
 * 前提：Root 权限
 */
fun execSvcWifi(enable: Boolean): Boolean {
    if (!checkRoot()) {
        return false
    }
    return execShell("su -c svc wifi ${if (enable) "enable" else "disable"}")
}

/**
 * 方式6：settings put global 命令
 * 适用：所有版本
 * 前提：Root 权限 或 ADB Shell
 */
fun execShellSettingsWifi(enable: Boolean): Boolean {
    if (!checkRoot()) {
        return false
    }
    return execShell("su -c settings put global wifi_on ${if (enable) 1 else 0}")
}

// ==================== 4. 工具方法 ====================

/**
 * 执行 Shell 命令
 */
fun execShell(command: String): Boolean {
    return try {
        val process = Runtime.getRuntime().exec(command)
        val exitCode = process.waitFor()
        process.destroy()
        exitCode == 0
    } catch (e: Exception) {
        false
    }
}

/**
 * 切换 WiFi（自动选择最佳方式）
 * 按优先级降级：自动派 → 半自动派 → 手动派
 */
fun toggleWifi(context: Context, enable: Boolean, adminComponent: ComponentName? = null): Boolean {
    // 🤖 自动派
    if (execWifiManager(context, enable)) return true
    if (adminComponent != null && execDpmWifi(context, adminComponent, enable)) return true
    if (execSettingsGlobal(context, enable)) return true
    if (execSvcWifi(enable)) return true
    if (execShellSettingsWifi(enable)) return true

    // 👆 半自动派
    if (execOpenWifiPanel(context)) return true

    // 🚶 手动派
    if (execOpenWifiSettings(context)) return true

    return false
}
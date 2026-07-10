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
import java.lang.reflect.Method

// ==================== 1. 检测数据 ====================

data class WifiCapability(
    val apiLevel: Int,
    val isWifiEnabled: Boolean,
    val hasChangeWifiStatePerm: Boolean,
    val isDeviceOwner: Boolean,
    val canDpmSetWifi: Boolean,
    val hasWriteSecureSettings: Boolean,
    val isRoot: Boolean,
    val uid: Int,
    val uidLabel: String,
    val hasWifiManagerSetEnabled: Boolean,      // WifiManager.setWifiEnabled 是否存在
    val hasDpmSetWifiMethod: Boolean,           // DPM.setWifiEnabled 反射是否存在
    val hasSettingsPanelWifi: Boolean,          // Settings.Panel.ACTION_WIFI 是否存在
    val hasSettingsGlobalWifiOn: Boolean        // Settings.Global.WIFI_ON 是否存在
)

fun getWifiCapability(context: Context): WifiCapability {
    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val isDO = dpm.isDeviceOwnerApp(context.packageName)

    return WifiCapability(
        apiLevel = Build.VERSION.SDK_INT,
        isWifiEnabled = wifiManager.isWifiEnabled,
        hasChangeWifiStatePerm = context.checkSelfPermission(Manifest.permission.CHANGE_WIFI_STATE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        isDeviceOwner = isDO,
        canDpmSetWifi = isDO && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N,
        hasWriteSecureSettings = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.System.canWrite(context),
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
 * 检测 DevicePolicyManager.setWifiEnabled 方法是否存在（反射）
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
 * 检测是否 Root
 */
fun checkRoot(): Boolean {
    return try {
        Runtime.getRuntime().exec("su -c echo test").waitFor() == 0
    } catch (e: Exception) {
        false
    }
}

// ==================== 2. 执行方法（带完整保护） ====================

/**
 * 方式1：WifiManager.setWifiEnabled()
 * 保护：方法存在性 + Android 版本 + 权限 + 异常捕获
 */
@Suppress("DEPRECATION")
fun execWifiManager(context: Context, enable: Boolean): Boolean {
    // 1. 方法存在性检查
    if (!checkWifiManagerSetEnabledExists()) {
        return false
    }
    
    // 2. Android 版本检查（Android 10+ 此方法无效但不会崩溃，但为了逻辑清晰还是检查）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        return false
    }
    
    // 3. 执行
    return try {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.setWifiEnabled(enable)
    } catch (e: SecurityException) {
        false  // 无 CHANGE_WIFI_STATE 权限
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式2：DevicePolicyManager.setWifiEnabled()
 * 保护：反射方法存在性 + DO 权限 + Android 版本 + 异常捕获
 */
fun execDpmWifi(context: Context, adminComponent: ComponentName, enable: Boolean): Boolean {
    // 1. 方法存在性检查
    if (!checkDpmSetWifiMethodExists()) {
        return false
    }
    
    // 2. Android 版本检查
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
        return false
    }
    
    // 3. DO 权限检查
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    if (!dpm.isDeviceOwnerApp(context.packageName)) {
        return false
    }
    
    // 4. 执行（反射）
    return try {
        val method = DevicePolicyManager::class.java.getMethod("setWifiEnabled", ComponentName::class.java, Boolean::class.java)
        method.invoke(dpm, adminComponent, enable) as Boolean
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式3：Settings.Global.putInt()
 * 保护：常量存在性 + WRITE_SECURE_SETTINGS 权限 + 异常捕获
 */
fun execSettingsGlobal(context: Context, enable: Boolean): Boolean {
    // 1. 常量存在性检查
    if (!checkSettingsGlobalWifiOnExists()) {
        return false
    }
    
    // 2. 权限检查
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.System.canWrite(context)) {
        return false
    }
    
    // 3. 执行
    return try {
        Settings.Global.putInt(
            context.contentResolver,
            Settings.Global.WIFI_ON,
            if (enable) 1 else 0
        )
    } catch (e: SecurityException) {
        false  // 无 WRITE_SECURE_SETTINGS 权限
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式4a：弹出 WiFi 悬浮面板
 * 保护：Android 版本 + Intent 可用性 + 异常捕获
 */
fun execOpenWifiPanel(context: Context): Boolean {
    // 1. Android 版本检查
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        return false
    }
    
    // 2. Intent 可用性检查
    return try {
        val intent = Intent(Settings.Panel.ACTION_WIFI)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        
        // 检查是否有 Activity 处理此 Intent
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
 * 方式4b：跳转 WiFi 设置页
 * 保护：Intent 可用性 + 异常捕获
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
 * 方式5：svc wifi 命令（Root）
 * 保护：Root 检测 + 命令执行异常捕获
 */
fun execSvcWifi(enable: Boolean): Boolean {
    // 1. Root 检查
    if (!checkRoot()) {
        return false
    }
    
    // 2. 执行
    return execShell("su -c svc wifi ${if (enable) "enable" else "disable"}")
}

/**
 * 方式6：settings put global 命令（Root/ADB）
 * 保护：Root 检测 + 命令执行异常捕获
 */
fun execShellSettingsWifi(enable: Boolean): Boolean {
    // 1. Root 检查
    if (!checkRoot()) {
        return false
    }
    
    // 2. 执行
    return execShell("su -c settings put global wifi_on ${if (enable) 1 else 0}")
}

/**
 * 方式7：API 1-9 专用简单切换
 * 保护：版本检查 + 方法存在性 + 异常捕获
 */
@Suppress("DEPRECATION")
fun execWifiToggleSimple(context: Context): Boolean {
    // 1. 版本检查
    if (Build.VERSION.SDK_INT > 9) {
        return false
    }
    
    // 2. 方法存在性检查
    if (!checkWifiManagerSetEnabledExists()) {
        return false
    }
    
    // 3. 执行
    return try {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.setWifiEnabled(!wifiManager.isWifiEnabled)
        true
    } catch (e: Exception) {
        false
    }
}

// ==================== 工具方法 ====================

fun execShell(command: String): Boolean {
    return try {
        val process = Runtime.getRuntime().exec(command)
        process.waitFor()
        process.exitValue() == 0
    } catch (e: Exception) {
        false
    }
}
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
    val hasChangeWifiStatePerm: Boolean,
    val hasAccessWifiStatePerm: Boolean,
    val isDeviceOwner: Boolean,
    val hasWriteSecureSettings: Boolean,
    val isRoot: Boolean,
    val isShell: Boolean,
    val uid: Int,
    val hasWifiManagerSetEnabled: Boolean,
    val hasDpmSetWifiMethod: Boolean,
    val hasSettingsPanelWifi: Boolean,
    val hasSettingsGlobalWifiOn: Boolean
)

// ==================== 2. 检测方法 ====================

fun getWifiCapability(context: Context): WifiCapability {
    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val isDO = dpm.isDeviceOwnerApp(context.packageName)
    val uid = Process.myUid()

    return WifiCapability(
        apiLevel = Build.VERSION.SDK_INT,
        isWifiEnabled = wifiManager.isWifiEnabled,
        hasChangeWifiStatePerm = context.checkSelfPermission(Manifest.permission.CHANGE_WIFI_STATE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        hasAccessWifiStatePerm = context.checkSelfPermission(Manifest.permission.ACCESS_WIFI_STATE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        isDeviceOwner = isDO,
        hasWriteSecureSettings = hasWriteSecureSettings(context),
        isRoot = uid == 0,
        isShell = uid == 2000,
        uid = uid,
        hasWifiManagerSetEnabled = checkWifiManagerSetEnabledExists(),
        hasDpmSetWifiMethod = checkDpmSetWifiMethodExists(),
        hasSettingsPanelWifi = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q,
        hasSettingsGlobalWifiOn = checkSettingsGlobalWifiOnExists()
    )
}

private fun checkWifiManagerSetEnabledExists(): Boolean {
    return try {
        WifiManager::class.java.getMethod("setWifiEnabled", Boolean::class.java)
        true
    } catch (e: NoSuchMethodException) {
        false
    }
}

private fun checkDpmSetWifiMethodExists(): Boolean {
    return try {
        DevicePolicyManager::class.java.getMethod("setWifiEnabled", ComponentName::class.java, Boolean::class.java)
        true
    } catch (e: NoSuchMethodException) {
        false
    }
}

private fun checkSettingsGlobalWifiOnExists(): Boolean {
    return try {
        Settings.Global::class.java.getField("WIFI_ON")
        true
    } catch (e: NoSuchFieldException) {
        false
    }
}

private fun hasWriteSecureSettings(context: Context): Boolean {
    return try {
        context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
    } catch (e: Exception) {
        false
    }
}

// ==================== 3. 纯执行方法 ====================

@Suppress("DEPRECATION")
fun execWifiManager(context: Context, enable: Boolean): Boolean {
    return try {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.setWifiEnabled(enable)
    } catch (e: Exception) {
        false
    }
}

fun execDpmWifi(context: Context, adminComponent: ComponentName, enable: Boolean): Boolean {
    return try {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
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

fun execSettingsGlobal(context: Context, enable: Boolean): Boolean {
    return try {
        Settings.Global.putInt(
            context.contentResolver,
            Settings.Global.WIFI_ON,
            if (enable) 1 else 0
        )
    } catch (e: Exception) {
        false
    }
}

fun execSvcWifi(enable: Boolean): Boolean {
    return execShell("svc wifi ${if (enable) "enable" else "disable"}")
}

fun execSvcWifiWithSu(enable: Boolean): Boolean {
    return execShell("su -c svc wifi ${if (enable) "enable" else "disable"}")
}

fun execOpenWifiPanel(context: Context): Boolean {
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

// ==================== 4. 工具方法 ====================

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
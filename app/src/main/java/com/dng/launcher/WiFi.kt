package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.provider.Settings

@Suppress("DEPRECATION")
fun execWifiManager(context: Context, enable: Boolean): Boolean {
    return try {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.setWifiEnabled(enable)
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
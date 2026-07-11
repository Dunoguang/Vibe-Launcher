package com.dng.launcher

import android.content.Context
import android.net.wifi.WifiManager
import android.webkit.JavascriptInterface
import com.google.gson.Gson

class WifiModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun getWifiState(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val wifi = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
            gson.toJson(
                mapOf(
                    "success" to true,
                    "enabled" to wifi.isWifiEnabled,
                    "wifiState" to wifi.wifiState
                )
            )
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setWifiEnabled(enable: Boolean): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val result = execWifiManager(ctx, enable)
            gson.toJson(
                mapOf(
                    "success" to result,
                    "enable" to enable
                )
            )
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun openWifiSettings(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val result = execOpenWifiSettings(ctx)
            """{"success":$result}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getCurrentWifiInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val result = getCurrentWifiInfo(ctx)
            if (result != null) {
                val (ssid, rssi) = result
                gson.toJson(
                    mapOf(
                        "success" to true,
                        "ssid" to ssid,
                        "rssi" to rssi
                    )
                )
            } else {
                """{"success":false,"error":"not connected to wifi or insufficient permission"}"""
            }
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    private fun execWifiManager(context: Context, enable: Boolean): Boolean {
        val wifi = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
        return wifi.setWifiEnabled(enable)
    }

    private fun execOpenWifiSettings(context: Context): Boolean {
        return try {
            val intent = android.provider.Settings.ACTION_WIFI_SETTINGS
            context.startActivity(android.content.Intent(intent).apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun getCurrentWifiInfo(context: Context): Pair<String, Int>? {
        return try {
            val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wifiInfo = wifiManager.connectionInfo ?: return null
            val ssid = wifiInfo.ssid?.replace("^\"|\"$".toRegex(), "") ?: ""
            if (ssid.isEmpty() || ssid == "<unknown ssid>") return null
            Pair(ssid, wifiInfo.rssi)
        } catch (e: Exception) {
            null
        }
    }
}
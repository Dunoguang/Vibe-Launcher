package com.dng.launcher

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import android.webkit.JavascriptInterface
import com.google.gson.Gson

class InfoModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun getSimInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val simCount = tm.activeModemCount
            val simStates = (0 until simCount).map { i ->
                mapOf<String, Any>("slot" to i, "operator" to (tm.simOperatorName ?: ""), "state" to tm.simState)
            }
            """{"success":true,"count":$simCount,"sims":${gson.toJson(simStates)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getSystemInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val info = mapOf(
                "androidVersion" to Build.VERSION.RELEASE,
                "sdkVersion" to Build.VERSION.SDK_INT,
                "device" to Build.MODEL,
                "manufacturer" to Build.MANUFACTURER
            )
            """{"success":true,"info":${gson.toJson(info)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getNetworkInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork
            val caps = network?.let { cm.getNetworkCapabilities(it) }
            
            val info = mapOf(
                "isConnected" to (network != null),
                "hasWifi" to (caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true),
                "hasCellular" to (caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true),
                "hasInternet" to (caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
            )
            """{"success":true,"info":${gson.toJson(info)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }
}
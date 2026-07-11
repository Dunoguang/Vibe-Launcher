package com.dng.launcher

import android.webkit.JavascriptInterface
import com.google.gson.Gson

class ShizukuModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun isConnected(): String {
        return gson.toJson(mapOf("connected" to ShizukuAPI.isConnected()))
    }

    @JavascriptInterface
    fun execShell(command: String, callbackId: String) {
        ShizukuAPI.execute(command) { result ->
            val data = mapOf(
                "callbackId" to callbackId,
                "stdout" to result.stdout,
                "stderr" to result.stderr,
                "statusCode" to result.statusCode
            )
            bridge.callback("_onShizukuResult", gson.toJson(data))
        }
    }
}
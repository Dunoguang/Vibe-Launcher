package com.dng.launcher

import android.webkit.JavascriptInterface
import com.google.gson.Gson

class ShellModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun execShell(command: String, callbackId: String) {
        Shell.execute(command) { result ->
            val data = mapOf(
                "callbackId" to callbackId,
                "stdout" to result.stdout,
                "stderr" to result.stderr,
                "statusCode" to result.statusCode
            )
            bridge.callback("_onShellResult", gson.toJson(data))
        }
    }
}
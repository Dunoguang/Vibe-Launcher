package com.dng.launcher

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.webkit.JavascriptInterface
import com.google.gson.Gson

class AdminModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun lockScreen(callbackId: String) {
        val context = bridge.getContext()
        val success = Lock.lockScreen(context)
        
        val data = mapOf(
            "callbackId" to callbackId,
            "success" to success
        )
        bridge.callback("_onLockScreenResult", gson.toJson(data))
    }

    @JavascriptInterface
    fun isAdminActive(callbackId: String) {
        val context = bridge.getContext()
        val active = Lock.isAdminActive(context)
        
        val data = mapOf(
            "callbackId" to callbackId,
            "active" to active
        )
        bridge.callback("_onAdminStatusResult", gson.toJson(data))
    }
}
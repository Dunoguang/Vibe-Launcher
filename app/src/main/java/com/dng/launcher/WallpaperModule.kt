package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream

class WallpaperModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun pickWallpaper() {
        val ctx = bridge.contextRef.get() ?: return
        val activity = ctx as? MainActivity ?: return
        bridge.webViewRef.get()?.post { activity.pickWallpaper() }
    }

    @JavascriptInterface
    fun getWallpaperPath(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = File(ctx.filesDir, "wallpaper.png")
            if (file.exists()) """{"success":true,"path":"file://${file.absolutePath}"}"""
            else """{"success":false,"error":"no wallpaper"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun removeWallpaper(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = File(ctx.filesDir, "wallpaper.png")
            if (file.exists()) file.delete()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    fun onWallpaperPicked(uri: Uri?) {
        if (uri == null) {
            bridge.callback("_onWallpaperPicked", """{"success":false,"error":"cancelled"}""")
            return
        }
        try {
            val ctx = bridge.contextRef.get() ?: return
            val input = ctx.contentResolver.openInputStream(uri)
            val file = File(ctx.filesDir, "wallpaper.png")
            FileOutputStream(file).use { out -> input?.copyTo(out) }
            input?.close()
            bridge.callback("_onWallpaperPicked", """{"success":true,"path":"file://${file.absolutePath}"}""")
        } catch (e: Exception) {
            bridge.callback("_onWallpaperPicked", """{"success":false,"error":"${e.message}"}""")
        }
    }

    @JavascriptInterface
    fun pickTimeBg() {
        val ctx = bridge.contextRef.get() ?: return
        val activity = ctx as? MainActivity ?: return
        bridge.webViewRef.get()?.post { activity.pickTimeBg() }
    }

    @JavascriptInterface
    fun getTimeBgPath(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = File(ctx.filesDir, "time_bg.png")
            if (file.exists()) """{"success":true,"path":"file://${file.absolutePath}"}"""
            else """{"success":false,"error":"no time bg"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun removeTimeBg(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = File(ctx.filesDir, "time_bg.png")
            if (file.exists()) file.delete()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    fun onTimeBgPicked(uri: Uri?) {
        if (uri == null) {
            bridge.callback("_onTimeBgPicked", """{"success":false,"error":"cancelled"}""")
            return
        }
        try {
            val ctx = bridge.contextRef.get() ?: return
            val input = ctx.contentResolver.openInputStream(uri)
            val file = File(ctx.filesDir, "time_bg.png")
            FileOutputStream(file).use { out -> input?.copyTo(out) }
            input?.close()
            bridge.callback("_onTimeBgPicked", """{"success":true,"path":"file://${file.absolutePath}"}""")
        } catch (e: Exception) {
            bridge.callback("_onTimeBgPicked", """{"success":false,"error":"${e.message}"}""")
        }
    }
}
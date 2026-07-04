package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import java.text.Collator
import java.util.Locale
import java.util.concurrent.Executors

class JsBridge(context: Context, webView: WebView) {

    private val contextRef = WeakReference(context)
    private val webViewRef = WeakReference(webView)
    private val executor = Executors.newFixedThreadPool(4)
    private val gson = Gson()
    private val collator = Collator.getInstance(Locale.CHINA)
    private val iconCacheDir = File(context.cacheDir, "icons").also { it.mkdirs() }

    @Volatile private var appListCache: List<AppInfo>? = null

    @JavascriptInterface
    fun requestInstalledApps() {
        appListCache?.let {
            callback("_onAppsLoaded", gson.toJson(AppsResult(true, it)))
            return
        }
        executor.execute {
            try {
                val ctx = contextRef.get() ?: return@execute
                val pm = ctx.packageManager
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                    .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
                    .map {
                        AppInfo(
                            it.packageName,
                            pm.getApplicationLabel(it).toString(),
                            (it.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                        )
                    }
                    .sortedWith(compareBy(collator) { it.appName })
                appListCache = apps
                callback("_onAppsLoaded", gson.toJson(AppsResult(true, apps)))
            } catch (e: Exception) {
                callback("_onAppsError", "\"${e.message?.replace("\"", "\\\"")}\"")
            }
        }
    }

    @JavascriptInterface
    fun requestAppIcons(packageNamesJson: String) {
        executor.execute {
            try {
                val ctx = contextRef.get() ?: return@execute
                val pm = ctx.packageManager
                val pkgs = gson.fromJson(packageNamesJson, Array<String>::class.java)
                val results = pkgs.map { pkg ->
                    IconResult(pkg, getOrCreateIcon(ctx, pm, pkg))
                }
                callback("_onIconsLoaded", gson.toJson(results))
            } catch (e: Exception) {
                callback("_onIconsError", "\"${e.message}\"")
            }
        }
    }

    private fun getOrCreateIcon(ctx: Context, pm: PackageManager, pkg: String): String {
        val file = File(iconCacheDir, "$pkg.png")
        if (file.exists()) return "file://${file.absolutePath}"
        return try {
            val drawable = pm.getApplicationIcon(pkg)
            val bitmap = if (drawable is BitmapDrawable) drawable.bitmap
            else {
                val bmp = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
                Canvas(bmp).apply {
                    drawable.setBounds(0, 0, 96, 96)
                    drawable.draw(this)
                }
                bmp
            }
            val scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true)
            FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.PNG, 80, it) }
            if (scaled !== bitmap && bitmap !== drawable) bitmap.recycle()
            "file://${file.absolutePath}"
        } catch (e: Exception) { "" }
    }

    @JavascriptInterface
    fun launchApp(packageName: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            ctx.packageManager.getLaunchIntentForPackage(packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(it)
                """{"success":true}"""
            } ?: """{"success":false,"error":"no launch activity"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    private fun callback(funcName: String, jsonArg: String) {
        webViewRef.get()?.post {
            it.evaluateJavascript("window.$funcName($jsonArg);", null)
        }
    }

    data class AppInfo(val packageName: String, val appName: String, val isSystem: Boolean)
    data class AppsResult(val success: Boolean, val apps: List<AppInfo>)
    data class IconResult(val packageName: String, val iconUrl: String)
}

package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import java.text.Collator
import java.util.Locale
import android.content.IntentFilter
import android.os.BatteryManager
import android.net.Uri
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
                    .filter { pm.getLaunchIntentForPackage(it.packageName) != null && it.packageName != "com.dng.launcher" }
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
    fun requestAppIcons(packageNamesJson: String, iconRes: Int) {
        val targetSize = iconRes.coerceIn(16, 4096)
        executor.execute {
            try {
                val ctx = contextRef.get() ?: return@execute
                val pm = ctx.packageManager
                val pkgs = gson.fromJson(packageNamesJson, Array<String>::class.java)
                val results = pkgs.map { pkg ->
                    IconResult(pkg, getOrCreateIcon(ctx, pm, pkg, targetSize))
                }
                callback("_onIconsLoaded", gson.toJson(results))
            } catch (e: Exception) {
                callback("_onIconsError", "\"${e.message}\"")
            }
        }
    }

    private fun getOrCreateIcon(ctx: Context, pm: PackageManager, pkg: String, size: Int = 512): String {
        val file = File(iconCacheDir, "${pkg}_${size}.png")
        if (file.exists()) return "file://${file.absolutePath}"
        return try {
            val drawable = pm.getApplicationIcon(pkg)
            val srcBitmap = (drawable as? BitmapDrawable)?.bitmap ?: run {
                val bmp = Bitmap.createBitmap(
                    drawable.intrinsicWidth.coerceAtLeast(1),
                    drawable.intrinsicHeight.coerceAtLeast(1),
                    Bitmap.Config.ARGB_8888
                )
                Canvas(bmp).apply {
                    drawable.setBounds(0, 0, bmp.width, bmp.height)
                    drawable.draw(this)
                }
                bmp
            }
            val scaled = Bitmap.createScaledBitmap(srcBitmap, size, size, true)
            FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.PNG, 80, it) }
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

    @JavascriptInterface
    fun uninstallApp(packageName: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun openAppDetails(packageName: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$packageName"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getBatteryLevel(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            """{"success":true,"level":$level}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun isCharging(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val intent = ctx.registerReceiver(null, filter)
            val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                           status == BatteryManager.BATTERY_STATUS_FULL
            """{"success":true,"charging":$charging,"status":$status}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    private fun callback(funcName: String, jsonArg: String) {
        webViewRef.get()?.let { wv ->
            wv.post { wv.evaluateJavascript("window.$funcName($jsonArg);", null) }
        }
    }

    data class AppInfo(val packageName: String, val appName: String, val isSystem: Boolean)
    data class AppsResult(val success: Boolean, val apps: List<AppInfo>)
    data class IconResult(val packageName: String, val iconUrl: String)

    @JavascriptInterface
    fun goBack(): String {
        return try {
            webViewRef.get()?.post {
                webViewRef.get()?.evaluateJavascript("window._onBackPressed();", null)
            }
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun clearIconCache(): String {
        return try {
            iconCacheDir.listFiles()?.forEach { it.delete() }
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun log(msg: String) {
        Log.d("VibeLauncher", "[JS] $msg")
        val ctx = contextRef.get() ?: return
        val logFile = java.io.File(ctx.filesDir, "log.txt")
        try {
            logFile.appendText(java.time.Instant.now().toString() + " " + msg + "\n")
        } catch (_: Exception) {}
    }
}

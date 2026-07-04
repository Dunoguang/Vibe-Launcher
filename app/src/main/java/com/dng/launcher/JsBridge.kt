package com.dng.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.LruCache
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
    private val executor = Executors.newSingleThreadExecutor()
    private val gson = Gson()
    private val collator = Collator.getInstance(Locale.CHINA)
    private val iconCacheDir = File(context.cacheDir, "icons").also { it.mkdirs() }

    private val memoryCache = object : LruCache<String, Bitmap>(64 * 1024 * 1024) {
        override fun sizeOf(key: String, bitmap: Bitmap) = bitmap.allocationByteCount
    }

    @Volatile private var cachedApps: List<AppInfo>? = null

    companion object {
        @Volatile private var receiverRegistered = false
    }

    init {
        registerPackageReceiver(context)
    }

    private fun registerPackageReceiver(ctx: Context) {
        if (receiverRegistered) return
        receiverRegistered = true
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        }
        ctx.applicationContext.registerReceiver(object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                cachedApps = null
            }
        }, filter)
    }

    @JavascriptInterface
    fun requestInstalledApps() {
        cachedApps?.let {
            callback("_onAppsLoaded", gson.toJson(AppsResult(true, it)))
            return
        }
        executor.execute {
            try {
                val ctx = contextRef.get() ?: return@execute
                val pm = ctx.packageManager
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                val appList = apps
                    .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
                    .map {
                        AppInfo(
                            it.packageName,
                            pm.getApplicationLabel(it).toString(),
                            (it.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                        )
                    }
                    .sortedWith(compareBy(collator) { it.appName })
                cachedApps = appList
                callback("_onAppsLoaded", gson.toJson(AppsResult(true, appList)))
            } catch (e: Exception) {
                callback("_onAppsError", "\"${e.message?.replace("\\", "\\\\")?.replace("\"", "\\\"")}\"")
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
                callback("_onIconsError", "\"${e.message?.replace("\\", "\\\\")?.replace("\"", "\\\"")}\"")
            }
        }
    }

    private fun getOrCreateIcon(ctx: Context, pm: PackageManager, pkg: String): String {
        val file = File(iconCacheDir, "$pkg.png")
        if (file.exists()) return "file://${file.absolutePath}"

        memoryCache.get(pkg)?.let { cached ->
            saveBitmapToFile(cached, file)
            return "file://${file.absolutePath}"
        }

        return try {
            val icon = pm.getApplicationIcon(pkg)
            val bitmap = drawableToBitmap(icon)
            val scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true)
            if (scaled !== bitmap) bitmap.recycle()
            val rgb565 = if (scaled.config != Bitmap.Config.RGB_565)
                scaled.copy(Bitmap.Config.RGB_565, false).also { scaled.recycle() }
            else scaled

            memoryCache.put(pkg, rgb565)
            saveBitmapToFile(rgb565, file)
            "file://${file.absolutePath}"
        } catch (e: Exception) {
            ""
        }
    }

    private fun saveBitmapToFile(bitmap: Bitmap, file: File) {
        try { FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 80, it) } }
        catch (_: Exception) {}
    }

    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable) return drawable.bitmap
        val w = drawable.intrinsicWidth.takeIf { it > 0 } ?: 96
        val h = drawable.intrinsicHeight.takeIf { it > 0 } ?: 96
        return Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565).also { bitmap ->
            Canvas(bitmap).apply {
                drawable.setBounds(0, 0, w, h)
                drawable.draw(this)
            }
        }
    }

    @JavascriptInterface
    fun launchApp(packageName: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = ctx.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
                """{"success":true}"""
            } else {
                """{"success":false,"error":"no launch activity"}"""
            }
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}"""
        }
    }

    private fun callback(funcName: String, jsonArg: String) {
        webViewRef.get()?.post {
            evaluateJavascript("window.$funcName($jsonArg);", null)
        }
    }

    data class AppInfo(
        val packageName: String,
        val appName: String,
        val isSystem: Boolean
    )

    data class AppsResult(
        val success: Boolean,
        val apps: List<AppInfo>
    )

    data class IconResult(
        val packageName: String,
        val iconUrl: String
    )
}

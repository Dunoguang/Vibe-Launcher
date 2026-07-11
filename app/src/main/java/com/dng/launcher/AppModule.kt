package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream
import java.text.Collator
import java.util.Locale
import java.util.concurrent.Executors

class AppModule(private val bridge: JsBridge) {
    private val gson = Gson()
    private val collator = Collator.getInstance(Locale.CHINA)
    private val executor = Executors.newFixedThreadPool(4)
    private val iconCacheDir = File(bridge.contextRef.get()?.cacheDir, "icons").also { it.mkdirs() }

    @Volatile private var appListCache: List<AppInfo>? = null

    @JavascriptInterface
    fun requestInstalledApps() {
        appListCache?.let {
            bridge.callback("_onAppsLoaded", gson.toJson(AppsResult(true, it)))
            return
        }
        executor.execute {
            try {
                val ctx = bridge.contextRef.get() ?: return@execute
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
                bridge.callback("_onAppsLoaded", gson.toJson(AppsResult(true, apps)))
            } catch (e: Exception) {
                bridge.callback("_onAppsError", "\"${e.message?.replace("\"", "\\\"")}\"")
            }
        }
    }

    @JavascriptInterface
    fun requestAppIcons(packageNamesJson: String, iconRes: Int) {
        val targetSize = iconRes.coerceIn(16, 4096)
        executor.execute {
            try {
                val ctx = bridge.contextRef.get() ?: return@execute
                val pm = ctx.packageManager
                val pkgs = gson.fromJson(packageNamesJson, Array<String>::class.java)
                val results = pkgs.map { pkg ->
                    IconResult(pkg, getOrCreateIcon(ctx, pm, pkg, targetSize))
                }
                bridge.callback("_onIconsLoaded", gson.toJson(results))
            } catch (e: Exception) {
                bridge.callback("_onIconsError", "\"${e.message}\"")
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$packageName"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }
}
package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.BitmapFactory
import android.util.Log
import android.graphics.Path
import android.graphics.PorterDuff
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
    fun generateAtlas() {
        executor.execute {
            try {
                val ctx = bridge.contextRef.get() ?: return@execute
                val pm = ctx.packageManager

                // Fast path: 合图已存在 + 包名无变化 → 直接返回
                val atlasFile = File(ctx.cacheDir, "icon_atlas.png")
                if (atlasFile.exists()) {
                    // 读取当前已安装 APP 包名（有启动 Intent 的）
                    val currentPkgs = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                        .filter { pm.getLaunchIntentForPackage(it.packageName) != null && it.packageName != "com.dng.launcher" }
                        .map { it.packageName }
                        .toSet()
                    // 读取已缓存的图标包名
                    val cachedPkgs = iconCacheDir.listFiles()
                        ?.filter { it.name.endsWith("_192.png") }
                        ?.map { it.name.removeSuffix("_192.png") }
                        ?.toSet() ?: emptySet()
                    // 只有完全一致才走快速路径
                    if (currentPkgs == cachedPkgs) {
                        val apps = appListCache ?: pm.getInstalledApplications(PackageManager.GET_META_DATA)
                            .filter { pm.getLaunchIntentForPackage(it.packageName) != null && it.packageName != "com.dng.launcher" }
                            .map {
                                AppInfo(
                                    it.packageName,
                                    pm.getApplicationLabel(it).toString(),
                                    (it.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                                )
                            }
                            .sortedWith(compareBy(collator) { it.appName })
                            .also { appListCache = it }
                        bridge.callback("_onAppsLoaded", gson.toJson(AppsResult(true, apps)))
                        val atlasOrder = cachedPkgs.sorted()
                        bridge.webViewRef.get()?.post {
                            bridge.webViewRef.get()?.evaluateJavascript(
                                "typeof window._onIconsLoaded==='function'&&window._onIconsLoaded(${gson.toJson(atlasOrder)})",
                                null
                            )
                        }
                        bridge.webViewRef.get()?.post {
                            bridge.webViewRef.get()?.evaluateJavascript(
                                "typeof window._onAtlasReady==='function'&&window._onAtlasReady(\"file://${atlasFile.absolutePath}\")",
                                null
                            )
                        }
                        return@execute
                    }
                    // 包名有变化 → 清理旧缓存，走完整生成流程
                    atlasFile.delete()
                    iconCacheDir.listFiles()?.forEach { it.delete() }
                }

                // 1. Get all installed apps
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
                // Call back app list
                bridge.callback("_onAppsLoaded", gson.toJson(AppsResult(true, apps)))

                // 2. Fetch and cache all icons (192x192)
                val iconSize = 192
                for (app in apps) {
                    try {
                        val file = File(iconCacheDir, "${app.packageName}_${iconSize}.png")
                        if (!file.exists()) {
                            val drawable = pm.getApplicationIcon(app.packageName)
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
                            val scaled = Bitmap.createScaledBitmap(srcBitmap, iconSize, iconSize, true)
                            FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.PNG, 80, it) }
                        }
                    } catch (_: Exception) {}
                }

                // 3. Get sorted package names (atlas order = sorted by filename = sorted by packageName)
                val atlasOrder = iconCacheDir.listFiles()
                    ?.filter { it.name.endsWith("_${iconSize}.png") }
                    ?.map { it.name.removeSuffix("_${iconSize}.png") }
                    ?.sorted()
                    ?: emptyList()

                // 4. Call back sorted package list (so frontend can map position -> packageName)
                bridge.webViewRef.get()?.post {
                    bridge.webViewRef.get()?.evaluateJavascript(
                        "typeof window._onIconsLoaded==='function'&&window._onIconsLoaded(${gson.toJson(atlasOrder)})",
                        null
                    )
                }

                // 5. Generate atlas
                generateIconAtlas(ctx)

            } catch (e: Exception) {
                bridge.webViewRef.get()?.post {
                    bridge.webViewRef.get()?.evaluateJavascript(
                        "typeof window._onAtlasError==='function'&&window._onAtlasError('${e.message?.replace("'", "\\'") ?: "unknown"}')",
                        null
                    )
                }
            }
        }
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

    @JavascriptInterface
    fun clearIconCache() {
        try {
            iconCacheDir.listFiles()?.forEach { it.delete() }
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun getAtlasUrl(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return ""
            val atlasFile = File(ctx.cacheDir, "icon_atlas.png")
            if (atlasFile.exists()) "file://${atlasFile.absolutePath}" else ""
        } catch (_: Exception) { "" }
    }

    private fun generateIconAtlas(ctx: Context) {
        try {
            val cellSize = 192
            val files = iconCacheDir.listFiles()?.filter { it.name.endsWith("_${cellSize}.png") }?.sortedBy { it.name } ?: emptyList()
            if (files.isEmpty()) return
            val cols = 10
            val rows = Math.ceil(files.size.toDouble() / cols).toInt()
            val atlasW = cols * cellSize
            val atlasH = rows * cellSize

            val atlas = Bitmap.createBitmap(atlasW, atlasH, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(atlas)
            canvas.drawColor(0, PorterDuff.Mode.CLEAR)

            for ((index, file) in files.withIndex()) {
                val col = index % cols
                val row = index / cols
                val x = col * cellSize
                val y = row * cellSize
                try {
                    val src = BitmapFactory.decodeFile(file.absolutePath)
                    if (src != null) {
                        val scaled = Bitmap.createScaledBitmap(src, cellSize, cellSize, true)
                        val cx = x + cellSize / 2f
                        val cy = y + cellSize / 2f
                        val r = cellSize / 2f
                        val clipPath = Path().apply { addCircle(cx, cy, r, Path.Direction.CW) }
                        canvas.save()
                        canvas.clipPath(clipPath)
                        canvas.drawBitmap(scaled, x.toFloat(), y.toFloat(), null)
                        canvas.restore()
                        scaled.recycle()
                        src.recycle()
                    }
                } catch (_: Exception) {}
            }

            val outFile = File(ctx.cacheDir, "icon_atlas.png")
            FileOutputStream(outFile).use { atlas.compress(Bitmap.CompressFormat.PNG, 90, it) }
            atlas.recycle()
            Log.i("Vibe-Launcher", "icon_atlas generated: ${outFile.absolutePath} (${atlasW}x${atlasH}, ${files.size} icons)")
            bridge.webViewRef.get()?.post {
                bridge.webViewRef.get()?.evaluateJavascript("typeof window._onAtlasReady===\"function\"&&window._onAtlasReady(\"file://${outFile.absolutePath}\")", null)
            }
        } catch (e: Exception) {
            Log.w("Vibe-Launcher", "icon_atlas generation failed: ${e.message}")
            bridge.webViewRef.get()?.post {
                val errMsg = e.message?.replace("\"", "\\\"") ?: "unknown"
                bridge.webViewRef.get()?.evaluateJavascript("typeof window._onAtlasError===\"function\"&&window._onAtlasError(\"" + errMsg + "\")", null)
            }
        }
    }
}

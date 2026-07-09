package com.dng.launcher

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
import android.content.IntentFilter
import android.content.SharedPreferences
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

    companion object {
        private var webViewRefStatic: WeakReference<WebView>? = null

        fun setWebView(wv: WebView) {
            webViewRefStatic = WeakReference(wv)
        }

        fun notifyNewNotification(info: VibeNotificationListener.NotifInfo) {
            val wv = webViewRefStatic?.get() ?: return
            try {
                val json = Gson().toJson(info)
                wv.post {
                    wv.evaluateJavascript("window._onNotificationPosted(${json});", null)
                }
            } catch (e: Exception) {
                Log.e("JsBridge", "notifyNewNotification error: ${e.message}")
            }
        }
    }

    @JavascriptInterface
    fun crashTest() {
        throw RuntimeException("手动触发的崩溃测试 - 这不是真正的Bug")
    }

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
    fun setHotReload(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("hot_reload_enabled", enabled).apply()
            Log.d("VibeLauncher", "[JS] hotReload set to $enabled")
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getHotReload() {
        executor.execute {
            try {
                val ctx = contextRef.get() ?: return@execute
                val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
                val enabled = prefs.getBoolean("hot_reload_enabled", false)
                callback("_onHotReloadLoaded", """{"success":true,"enabled":$enabled}""")
            } catch (e: Exception) {
                callback("_onHotReloadLoaded", """{"success":false,"error":"${e.message}"}""")
            }
        }
    }

    private var currentLogFileName: String? = null

    private fun getLogFile(): java.io.File? {
        val ctx = contextRef.get() ?: return null
        val name = currentLogFileName ?: run {
            val sdf = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US)
            val ts = sdf.format(java.util.Date())
            "log_$ts.txt"
        }.also { currentLogFileName = it }
        return java.io.File(ctx.filesDir, name)
    }

    @JavascriptInterface
    fun log(msg: String) {
        Log.d("VibeLauncher", "[JS] $msg")
        val ctx = contextRef.get() ?: return
        val logFile = getLogFile() ?: return
        try {
            logFile.appendText(java.time.Instant.now().toString() + " " + msg + "\n")
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun pickWallpaper() {
        Log.d("VibeLauncher", "[wallpaper] pickWallpaper called from JS")
        val ctx = contextRef.get()
        if (ctx == null) {
            Log.e("VibeLauncher", "[wallpaper] context lost")
            return
        }
        val activity = ctx as? MainActivity
        if (activity == null) {
            Log.e("VibeLauncher", "[wallpaper] not MainActivity: ${ctx.javaClass.name}")
            return
        }
        val wv = webViewRef.get()
        if (wv == null) {
            Log.e("VibeLauncher", "[wallpaper] webView lost")
            return
        }
        wv.post {
            Log.d("VibeLauncher", "[wallpaper] launching picker on main thread")
            activity.pickWallpaper()
        }
    }

    @JavascriptInterface
    fun getWallpaperPath(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = java.io.File(ctx.filesDir, "wallpaper.png")
            if (file.exists()) """{"success":true,"path":"file://${file.absolutePath}"}"""
            else """{"success":false,"error":"no wallpaper"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun removeWallpaper(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = java.io.File(ctx.filesDir, "wallpaper.png")
            if (file.exists()) file.delete()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    fun onWallpaperPicked(uri: android.net.Uri?) {
        if (uri == null) {
            callback("_onWallpaperPicked", """{"success":false,"error":"cancelled"}""")
            return
        }
        try {
            val ctx = contextRef.get() ?: return
            val input = ctx.contentResolver.openInputStream(uri)
            val file = java.io.File(ctx.filesDir, "wallpaper.png")
            java.io.FileOutputStream(file).use { out -> input?.copyTo(out) }
            input?.close()
            callback("_onWallpaperPicked", """{"success":true,"path":"file://${file.absolutePath}"}""")
        } catch (e: Exception) {
            callback("_onWallpaperPicked", """{"success":false,"error":"${e.message}"}""")
        }
    }


    @JavascriptInterface
    fun pickTimeBg() {
        Log.d("VibeLauncher", "[timebg] pickTimeBg called")
        val ctx = contextRef.get() ?: return
        val activity = ctx as? MainActivity ?: return
        webViewRef.get()?.post {
            activity.pickTimeBg()
        }
    }

    @JavascriptInterface
    fun getTimeBgPath(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = java.io.File(ctx.filesDir, "time_bg.png")
            if (file.exists()) """{"success":true,"path":"file://${file.absolutePath}"}"""
            else """{"success":false,"error":"no time bg"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun removeTimeBg(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = java.io.File(ctx.filesDir, "time_bg.png")
            if (file.exists()) file.delete()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    fun onTimeBgPicked(uri: android.net.Uri?) {
        if (uri == null) {
            callback("_onTimeBgPicked", """{"success":false,"error":"cancelled"}""")
            return
        }
        try {
            val ctx = contextRef.get() ?: return
            val input = ctx.contentResolver.openInputStream(uri)
            val file = java.io.File(ctx.filesDir, "time_bg.png")
            java.io.FileOutputStream(file).use { out -> input?.copyTo(out) }
            input?.close()
            callback("_onTimeBgPicked", """{"success":true,"path":"file://${file.absolutePath}"}""")
        } catch (e: Exception) {
            callback("_onTimeBgPicked", """{"success":false,"error":"${e.message}"}""")
        }
    }

    // ==================== 通知相关 ====================

    @JavascriptInterface
    fun getActiveNotifications(): String {
        return try {
            val notifications = VibeNotificationListener.getActiveNotifications()
            gson.toJson(mapOf("success" to true, "notifications" to notifications))
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}","notifications":[]}"""
        }
    }

    @JavascriptInterface
    fun clearNotification(packageName: String): String {
        return try {
            val listener = VibeNotificationListener.getInstance()
            if (listener != null) {
                val active = listener.activeNotifications ?: arrayOf()
                active.filter { it.packageName == packageName }.forEach {
                    try { listener.cancelNotification(it.key) } catch (_: Exception) {}
                }
                """{"success":true}"""
            } else {
                """{"success":false,"error":"NotificationListener not active"}"""
            }
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun openNotificationSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun isNotificationListenerEnabled(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val flat = android.provider.Settings.Secure.getString(
                ctx.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            val enabled = flat.contains("com.dng.launcher/VibeNotificationListener")
            """{"success":true,"enabled":$enabled}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ==================== 快捷方式管理 ====================

    @JavascriptInterface
    fun getPinnedShortcuts(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
            val json = prefs.getString("pinned_shortcuts", "[]") ?: "[]"
            """{"success":true,"shortcuts":$json}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}","shortcuts":[]}"""
        }
    }

    @JavascriptInterface
    fun setPinnedShortcuts(shortcutsJson: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("pinned_shortcuts", shortcutsJson).apply()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ==================== 主题设置 ====================

    @JavascriptInterface
    fun getThemeColor(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
            val color = prefs.getString("theme_color", "#8ab4f8") ?: "#8ab4f8"
            """{"success":true,"color":"$color"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setThemeColor(color: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("theme_color", color).apply()
            callback("_onThemeColorChanged", """{"success":true,"color":"$color"}""")
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ==================== 快捷设置 ====================

    @JavascriptInterface
    fun getWifiEnabled(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            """{"success":true,"enabled":${wm.isWifiEnabled}}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun setWifiEnabled(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            @Suppress("DEPRECATION")
            wm.isWifiEnabled = enabled
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun getBluetoothEnabled(): String {
        return try {
            val adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            """{"success":true,"enabled":${adapter?.isEnabled ?: false}}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun setBluetoothEnabled(enabled: Boolean): String {
        return try {
            val adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            if (adapter == null) return """{"success":false,"error":"no bluetooth"}"""
            @Suppress("DEPRECATION")
            if (enabled) adapter.enable() else adapter.disable()
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun getAutoRotate(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val on = android.provider.Settings.System.getInt(
                ctx.contentResolver, "accelerometer_rotation", 0
            ) == 1
            """{"success":true,"enabled":$on}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun setAutoRotate(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            android.provider.Settings.System.putInt(
                ctx.contentResolver, "accelerometer_rotation", if (enabled) 1 else 0
            )
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun getDataUsage(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            val carrier = tm.networkOperatorName ?: "未知"
            val signalLevel = when (tm.dataState) {
                android.telephony.TelephonyManager.DATA_CONNECTED -> "已连接"
                android.telephony.TelephonyManager.DATA_CONNECTING -> "连接中"
                android.telephony.TelephonyManager.DATA_DISCONNECTED -> "未连接"
                android.telephony.TelephonyManager.DATA_SUSPENDED -> "暂停"
                else -> "未知"
            }
            """{"success":true,"carrier":"$carrier","state":"$signalLevel"}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun openWifiSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            ctx.startActivity(Intent(android.provider.Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun openBluetoothSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            ctx.startActivity(Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    // ==================== 媒体控制 ====================

    @JavascriptInterface
    fun getMediaInfo(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            val vol = am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC)
            val maxVol = am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
            val muted = am.isStreamMute(android.media.AudioManager.STREAM_MUSIC)
            """{"success":true,"volume":$vol,"maxVolume":$maxVol,"muted":$muted}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun setMediaVolume(vol: Int): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            am.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, vol, 0)
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    @JavascriptInterface
    fun sendMediaButton(keyCode: Int): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val down = android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode)
            val up = android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, keyCode)
            ctx.sendBroadcast(Intent(Intent.ACTION_MEDIA_BUTTON).putExtra(Intent.EXTRA_KEY_EVENT, down))
            ctx.sendBroadcast(Intent(Intent.ACTION_MEDIA_BUTTON).putExtra(Intent.EXTRA_KEY_EVENT, up))
            """{"success":true}"""
        } catch (e: Exception) { """{"success":false,"error":"${e.message}"}""" }
    }

    // ==================== 亮度控制 ====================

    @JavascriptInterface
    fun getBrightness(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val brightness = android.provider.Settings.System.getInt(
                ctx.contentResolver,
                android.provider.Settings.System.SCREEN_BRIGHTNESS,
                128
            )
            """{"success":true,"brightness":$brightness,"max":255}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}","brightness":128,"max":255}"""
        }
    }

    @JavascriptInterface
    fun setBrightness(value: Int): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val clamped = value.coerceIn(0, 255)
            android.provider.Settings.System.putInt(
                ctx.contentResolver,
                android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
                android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
            )
            android.provider.Settings.System.putInt(
                ctx.contentResolver,
                android.provider.Settings.System.SCREEN_BRIGHTNESS,
                clamped
            )
            """{"success":true,"brightness":$clamped}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun canWriteSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false}"""
            val canWrite = android.provider.Settings.System.canWrite(ctx)
            """{"success":true,"canWrite":$canWrite}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun openWriteSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(android.provider.Settings.ACTION_MANAGE_WRITE_SETTINGS)
            intent.data = Uri.parse("package:com.dng.launcher")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ==================== 搜索功能 ====================

    @JavascriptInterface
    fun searchApps(query: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val pm = ctx.packageManager
            val apps = appListCache ?: run {
                val loaded = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                    .filter { pm.getLaunchIntentForPackage(it.packageName) != null && it.packageName != "com.dng.launcher" }
                    .map {
                        AppInfo(
                            it.packageName,
                            pm.getApplicationLabel(it).toString(),
                            (it.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                        )
                    }
                    .sortedWith(compareBy(collator) { it.appName })
                appListCache = loaded
                loaded
            }
            val results = if (query.isBlank()) apps
            else apps.filter { it.appName.contains(query, ignoreCase = true) || it.packageName.contains(query, ignoreCase = true) }
            gson.toJson(mapOf("success" to true, "apps" to results))
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}","apps":[]}"""
        }
    }
}

package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.media.session.MediaSessionManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import java.text.Collator
import java.text.SimpleDateFormat
import java.util.Date
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
    fun crashTest() {
        Thread {
            throw RuntimeException("手动触发的崩溃测试 - 这不是真正的Bug")
        }.start()
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
    fun log(msg: String) {
        Log.d("VibeLauncher", "[web] $msg")
        val ctx = contextRef.get() ?: return
        try {
            val file = File(ctx.filesDir, currentLogFileName)
            if (file.exists() && file.length() > 5 * 1024 * 1024) return
            FileOutputStream(file, true).use { it.write("$msg\n".toByteArray()) }
        } catch (_: Exception) {}
    }

    @Volatile private var currentLogFileName: String? = null

    fun setLogFileName(name: String) {
        currentLogFileName = name
    }

    // ========== 壁纸 API ==========

    @JavascriptInterface
    fun pickWallpaper() {
        val ctx = contextRef.get() ?: return
        val activity = ctx as? MainActivity ?: return
        webViewRef.get()?.post { activity.pickWallpaper() }
    }

    @JavascriptInterface
    fun getWallpaperPath(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = File(ctx.filesDir, "wallpaper.png")
            if (file.exists()) file.delete()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    fun onWallpaperPicked(uri: Uri?) {
        if (uri == null) {
            callback("_onWallpaperPicked", """{"success":false,"error":"cancelled"}""")
            return
        }
        try {
            val ctx = contextRef.get() ?: return
            val input = ctx.contentResolver.openInputStream(uri)
            val file = File(ctx.filesDir, "wallpaper.png")
            FileOutputStream(file).use { out -> input?.copyTo(out) }
            input?.close()
            callback("_onWallpaperPicked", """{"success":true,"path":"file://${file.absolutePath}"}""")
        } catch (e: Exception) {
            callback("_onWallpaperPicked", """{"success":false,"error":"${e.message}"}""")
        }
    }

    @JavascriptInterface
    fun pickTimeBg() {
        val ctx = contextRef.get() ?: return
        val activity = ctx as? MainActivity ?: return
        webViewRef.get()?.post { activity.pickTimeBg() }
    }

    @JavascriptInterface
    fun getTimeBgPath(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val file = File(ctx.filesDir, "time_bg.png")
            if (file.exists()) file.delete()
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    fun onTimeBgPicked(uri: Uri?) {
        if (uri == null) {
            callback("_onTimeBgPicked", """{"success":false,"error":"cancelled"}""")
            return
        }
        try {
            val ctx = contextRef.get() ?: return
            val input = ctx.contentResolver.openInputStream(uri)
            val file = File(ctx.filesDir, "time_bg.png")
            FileOutputStream(file).use { out -> input?.copyTo(out) }
            input?.close()
            callback("_onTimeBgPicked", """{"success":true,"path":"file://${file.absolutePath}"}""")
        } catch (e: Exception) {
            callback("_onTimeBgPicked", """{"success":false,"error":"${e.message}"}""")
        }
    }

    // ========== 控制中心 API ==========

    @JavascriptInterface
    fun getWifiEnabled(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val wifi = ctx.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            """{"success":true,"enabled":${wifi.isWifiEnabled}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setWifiEnabled(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val wifi = ctx.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            wifi.isWifiEnabled = enabled
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getMobileDataEnabled(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val enabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val network = cm.activeNetwork
                val caps = network?.let { cm.getNetworkCapabilities(it) }
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true
            } else {
                @Suppress("DEPRECATION")
                cm.getMobileDataEnabled()
            }
            """{"success":true,"enabled":$enabled}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getBrightness(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val brightness = Settings.System.getInt(
                ctx.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS
            )
            """{"success":true,"brightness":$brightness}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setBrightness(brightness: Int): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            if (!Settings.System.canWrite(ctx)) {
                val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
                return """{"success":false,"error":"WRITE_SETTINGS not granted"}"""
            }
            Settings.System.putInt(
                ctx.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                brightness.coerceIn(0, 255)
            )
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getVolume(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val current = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            """{"success":true,"current":$current,"max":$max}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setVolume(volume: Int): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, volume.coerceIn(0, max), 0)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun toggleFlashlight(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val camera = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = camera.cameraIdList[0]
            val current = camera.getTorchMode(cameraId)
            camera.setTorchMode(cameraId, !current)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getFlashlightState(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val camera = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = camera.cameraIdList[0]
            """{"success":true,"enabled":${camera.getTorchMode(cameraId)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setFlashlight(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val camera = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = camera.cameraIdList[0]
            camera.setTorchMode(cameraId, enabled)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun lockScreen(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val activity = ctx as? MainActivity ?: return """{"success":false,"error":"not activity context"}"""
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.goToSleep(SystemClock.uptimeMillis())
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun openSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(Settings.ACTION_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun shareText(text: String): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(Intent.createChooser(intent, "分享"))
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getMusicInfo(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val sm = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val sessions = sm.getActiveSessions(null)
            if (sessions.isNotEmpty()) {
                val controller = sessions[0]
                val metadata = controller.metadata
                if (metadata != null) {
                    val title = metadata.getString(android.media.MediaMetadata.METADATA_KEY_TITLE) ?: ""
                    val artist = metadata.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST) ?: ""
                    val album = metadata.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM) ?: ""
                    val duration = metadata.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION)
                    val isPlaying = controller.playbackState?.state == android.media.session.PlaybackState.STATE_PLAYING
                    return """{"success":true,"title":"${title.replace("\"","\\\"")}","artist":"${artist.replace("\"","\\\"")}","album":"${album.replace("\"","\\\"")}","duration":$duration,"isPlaying":$isPlaying}"""
                }
            }
            """{"success":false,"error":"no music"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getMusicCoverUrl(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val sm = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val sessions = sm.getActiveSessions(null)
            if (sessions.isNotEmpty()) {
                val controller = sessions[0]
                val metadata = controller.metadata
                if (metadata != null) {
                    val bitmap = metadata.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART)
                    if (bitmap != null) {
                        val file = File(ctx.cacheDir, "music_cover.png")
                        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 80, it) }
                        return """{"success":true,"url":"file://${file.absolutePath}"}"""
                    }
                }
            }
            """{"success":false,"error":"no cover"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getSimInfo(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val simCount = tm.activeModemCount
            val simStates = (0 until simCount).map { i ->
                mapOf("slot" to i, "operator" to (tm.simOperatorName ?: ""), "state" to tm.simState)
            }
            """{"success":true,"count":$simCount,"sims":${gson.toJson(simStates)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun hotspotEnabled(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork
            val caps = network?.let { cm.getNetworkCapabilities(it) }
            val isHotspot = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI_AWARE) == true
            """{"success":true,"enabled":$isHotspot}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getVolumeInfo(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val media = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
            val mediaMax = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val ring = audio.getStreamVolume(AudioManager.STREAM_RING)
            val ringMax = audio.getStreamMaxVolume(AudioManager.STREAM_RING)
            val alarm = audio.getStreamVolume(AudioManager.STREAM_ALARM)
            val alarmMax = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            """{"success":true,"media":{"current":$media,"max":$mediaMax},"ring":{"current":$ring,"max":$ringMax},"alarm":{"current":$alarm,"max":$alarmMax}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun requestSettingsPermission(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            if (!Settings.System.canWrite(ctx)) {
                val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
                """{"success":false,"error":"redirecting"}"""
            } else """{"success":true,"granted":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun canWriteSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            """{"success":true,"canWrite":${Settings.System.canWrite(ctx)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ========== 内部 ==========

    private fun callback(funcName: String, jsonArg: String) {
        webViewRef.get()?.let { wv ->
            wv.post { wv.evaluateJavascript("window.$funcName($jsonArg);", null) }
        }
    }

    data class AppInfo(val packageName: String, val appName: String, val isSystem: Boolean)
    data class AppsResult(val success: Boolean, val apps: List<AppInfo>)
    data class IconResult(val packageName: String, val iconUrl: String)
}

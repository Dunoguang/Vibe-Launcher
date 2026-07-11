package com.dng.launcher

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.media.session.MediaSessionManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.gson.Gson
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.lang.ref.WeakReference
import java.nio.charset.StandardCharsets
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
    private var torchEnabled = false
    private var adminComponent: ComponentName? = null

    data class AppInfo(val packageName: String, val appName: String, val isSystem: Boolean)
    data class AppsResult(val success: Boolean, val apps: List<AppInfo>)
    data class IconResult(val packageName: String, val iconUrl: String)

    // ==================== Shell 执行 ====================

    /**
     * 执行 Shell 命令（异步回调）
     * @param command 要执行的命令
     * @param callbackId 回调ID，用于在 JS 中识别
     */
    @JavascriptInterface
    fun execShell(command: String, callbackId: String) {
        if (command.isBlank()) {
            callback("_onShellResult", """{"callbackId":"$callbackId","stdout":"","stderr":"Command is empty","statusCode":-1}""")
            return
        }

        Thread {
            var process: java.lang.Process? = null
            try {
                process = ProcessBuilder("sh").start()
                
                process!!.outputStream.use { out ->
                    out.write((command + "\n").toByteArray(StandardCharsets.UTF_8))
                    out.write("exit\n".toByteArray(StandardCharsets.UTF_8))
                    out.flush()
                }
                
                val stdout = readAll(process!!.inputStream)
                val stderr = readAll(process!!.errorStream)
                val statusCode = process!!.waitFor()
                
                val result = mapOf(
                    "callbackId" to callbackId,
                    "stdout" to stdout,
                    "stderr" to stderr,
                    "statusCode" to statusCode
                )
                callback("_onShellResult", gson.toJson(result))
            } catch (e: Exception) {
                val result = mapOf(
                    "callbackId" to callbackId,
                    "stdout" to "",
                    "stderr" to (e.message ?: "Unknown error"),
                    "statusCode" to -1
                )
                callback("_onShellResult", gson.toJson(result))
            } finally {
                process?.destroy()
            }
        }.start()
    }

    private fun readAll(inputStream: java.io.InputStream): String {
        val builder = StringBuilder()
        BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8)).use { reader ->
            var line: String?
            var first = true
            while (reader.readLine().also { line = it } != null) {
                if (!first) builder.append('\n')
                builder.append(line)
                first = false
            }
        }
        return builder.toString()
    }

    // ==================== WiFi 检测方法 ====================

    private fun checkWifiManagerSetEnabledExists(): Boolean {
        return try {
            WifiManager::class.java.getMethod("setWifiEnabled", Boolean::class.java)
            true
        } catch (e: NoSuchMethodException) {
            false
        }
    }

    private fun checkDpmSetWifiMethodExists(): Boolean {
        return try {
            DevicePolicyManager::class.java.getMethod("setWifiEnabled", ComponentName::class.java, Boolean::class.java)
            true
        } catch (e: NoSuchMethodException) {
            false
        }
    }

    private fun checkSettingsGlobalWifiOnExists(): Boolean {
        return try {
            Settings.Global::class.java.getField("WIFI_ON")
            true
        } catch (e: NoSuchFieldException) {
            false
        }
    }

    private fun hasWriteSecureSettings(context: Context): Boolean {
        return try {
            context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) ==
                    PackageManager.PERMISSION_GRANTED
        } catch (e: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun getWifiCapability(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val wifiManager = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isDO = dpm.isDeviceOwnerApp(ctx.packageName)
            val uid = Process.myUid()

            val cap = mapOf(
                "apiLevel" to Build.VERSION.SDK_INT,
                "isWifiEnabled" to wifiManager.isWifiEnabled,
                "hasChangeWifiStatePerm" to (ctx.checkSelfPermission(Manifest.permission.CHANGE_WIFI_STATE) == PackageManager.PERMISSION_GRANTED),
                "hasAccessWifiStatePerm" to (ctx.checkSelfPermission(Manifest.permission.ACCESS_WIFI_STATE) == PackageManager.PERMISSION_GRANTED),
                "isDeviceOwner" to isDO,
                "hasWriteSecureSettings" to hasWriteSecureSettings(ctx),
                "isRoot" to (uid == 0),
                "isShell" to (uid == 2000),
                "uid" to uid,
                "hasWifiManagerSetEnabled" to checkWifiManagerSetEnabledExists(),
                "hasDpmSetWifiMethod" to checkDpmSetWifiMethodExists(),
                "hasSettingsPanelWifi" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q),
                "hasSettingsGlobalWifiOn" to checkSettingsGlobalWifiOnExists(),
                "hasSU" to hasSU()
            )

            gson.toJson(mapOf("success" to true, "data" to cap))
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ==================== WiFi 执行方法 ====================

    @Suppress("DEPRECATION")
    private fun execWifiManager(context: Context, enable: Boolean): Boolean {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiManager.setWifiEnabled(enable)
        } catch (e: Exception) {
            false
        }
    }

    private fun execDpmWifi(context: Context, adminComponent: ComponentName, enable: Boolean): Boolean {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val method = DevicePolicyManager::class.java.getMethod(
                "setWifiEnabled",
                ComponentName::class.java,
                Boolean::class.java
            )
            method.invoke(dpm, adminComponent, enable) as Boolean
        } catch (e: Exception) {
            false
        }
    }

    private fun execSettingsGlobal(context: Context, enable: Boolean): Boolean {
        return try {
            Settings.Global.putInt(
                context.contentResolver,
                Settings.Global.WIFI_ON,
                if (enable) 1 else 0
            )
        } catch (e: Exception) {
            false
        }
    }

    private fun execSvcWifi(enable: Boolean): Boolean {
        return execShellSync("svc wifi ${if (enable) "enable" else "disable"}")
    }

    private fun execSvcWifiWithSu(enable: Boolean): Boolean {
        return execShellSync("su -c svc wifi ${if (enable) "enable" else "disable"}")
    }

    private fun execOpenWifiPanel(context: Context): Boolean {
        return try {
            val intent = Intent(Settings.Panel.ACTION_WIFI)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun execOpenWifiSettings(context: Context): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_WIFI_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun execShellSync(command: String): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(command)
            val exitCode = process.waitFor()
            process.destroy()
            exitCode == 0
        } catch (e: Exception) {
            false
        }
    }

    private fun hasSU(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("su", "-c", "echo root"))
            val reader = java.io.BufferedReader(java.io.InputStreamReader(process.inputStream))
            val result = reader.readLine()
            process.waitFor()
            process.destroy()
            result == "root"
        } catch (e: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun setWifiByMethod(method: String, enable: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""

            val result = when (method) {
                "manager" -> execWifiManager(ctx, enable)
                "dpm" -> {
                    if (adminComponent == null) {
                        return """{"success":false,"error":"adminComponent not set, call setAdminComponent first"}"""
                    }
                    execDpmWifi(ctx, adminComponent!!, enable)
                }
                "settings" -> execSettingsGlobal(ctx, enable)
                "svc" -> execSvcWifi(enable)
                "svc_su" -> execSvcWifiWithSu(enable)
                "panel" -> execOpenWifiPanel(ctx)
                "settingsPage" -> execOpenWifiSettings(ctx)
                else -> {
                    return """{"success":false,"error":"unknown method: $method, available: manager|dpm|settings|svc|svc_su|panel|settingsPage"}"""
                }
            }

            gson.toJson(
                mapOf(
                    "success" to result,
                    "method" to method,
                    "enable" to enable
                )
            )
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setAdminComponent(packageName: String, className: String): String {
        return try {
            adminComponent = ComponentName(packageName, className)
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getWifiState(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val wifi = ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager
            gson.toJson(
                mapOf(
                    "success" to true,
                    "enabled" to wifi.isWifiEnabled,
                    "wifiState" to wifi.wifiState
                )
            )
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    // ==================== 原有方法 ====================

    @JavascriptInterface
    fun setHotReload(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return "{\"success\":false,\"error\":\"context lost\"}"
            val prefs = ctx.getSharedPreferences("vibe_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("hot_reload_enabled", enabled).apply()
            "{\"success\":true}"
        } catch (e: Exception) {
            "{\"success\":false,\"error\":\"${e.message}\"}"
        }
    }

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
            val file = File(ctx.filesDir, currentLogFileName ?: "")
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
                val method = cm.javaClass.getMethod("getMobileDataEnabled")
                method.invoke(cm) as Boolean
            }
            """{"success":true,"enabled":$enabled}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun setMobileDataEnabled(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val intent = Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
            } else {
                val intent = Intent(Settings.ACTION_WIRELESS_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
            }
            """{"success":false,"error":"redirecting to settings"}"""
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
                return """{"success":false,"error":"WRITE_SETTINGS not granted","needPermission":true}"""
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
            val ctx = contextRef.get() ?: return "{\"success\":false,\"error\":\"context lost\"}"
            val camera = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = camera.cameraIdList[0]
            torchEnabled = !torchEnabled
            camera.setTorchMode(cameraId, torchEnabled)
            "{\"success\":true,\"enabled\":$torchEnabled}"
        } catch (e: Exception) {
            "{\"success\":false,\"error\":\"${e.message}\"}"
        }
    }

    @JavascriptInterface
    fun getFlashlightState(): String {
        return try {
            "{\"success\":true,\"enabled\":$torchEnabled}"
        } catch (e: Exception) {
            "{\"success\":false,\"error\":\"${e.message}\"}"
        }
    }

    @JavascriptInterface
    fun setFlashlight(enabled: Boolean): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val camera = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            torchEnabled = enabled
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
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            try {
                val method = pm.javaClass.getMethod("goToSleep", Long::class.javaPrimitiveType)
                method.invoke(pm, SystemClock.uptimeMillis())
            } catch (_: NoSuchMethodException) {}
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
    fun openAirplaneModeSettings(): String {
        return try {
            val ctx = contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val intent = Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS)
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
                mapOf<String, Any>("slot" to i, "operator" to (tm.simOperatorName ?: ""), "state" to tm.simState)
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

    // ========== 内部方法 ==========

    private fun callback(funcName: String, jsonArg: String) {
        webViewRef.get()?.let { wv ->
            wv.post { wv.evaluateJavascript("window.$funcName($jsonArg);", null) }
        }
    }
}
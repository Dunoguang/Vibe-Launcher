package com.dng.launcher

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.content.SharedPreferences
import android.os.Build
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedDispatcher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "VibeLauncher"
        private const val RC_RUNTIME_PERMS = 1001
        private const val RC_WRITE_SETTINGS = 1002
        private const val RC_OVERLAY = 1003
        private const val RC_ADMIN = 1004

        private val RUNTIME_PERMISSIONS = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CAMERA
        )
    }

    private lateinit var wallpaperPickerLauncher: androidx.activity.result.ActivityResultLauncher<String>

    fun pickWallpaper() {
        if (::wallpaperPickerLauncher.isInitialized) {
            wallpaperPickerLauncher.launch("image/*")
        }
    }

    private lateinit var timeBgPickerLauncher: androidx.activity.result.ActivityResultLauncher<String>

    fun pickTimeBg() {
        if (::timeBgPickerLauncher.isInitialized) {
            timeBgPickerLauncher.launch("image/*")
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemBars()
        }
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
        }
    }

    private var webView: WebView? = null
    private var jsBridge: JsBridge? = null
    private var errorDialogShown = false  // 每次启动重置
    private var currentLogFileName: String? = null

    private fun getLogFile(): File {
        val name = currentLogFileName ?: run {
            val sdf = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US)
            val ts = sdf.format(java.util.Date())
            "log_$ts.txt"
        }.also { currentLogFileName = it }
        return File(filesDir, name)
    }

    private val exportLogLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("text/plain")
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val logFile = getLogFile()
                if (logFile.exists()) {
                    contentResolver.openOutputStream(uri)?.use { out ->
                        logFile.inputStream().use { it.copyTo(out) }
                    }
                    Log.d(TAG, "log exported to $uri")
                }
            } catch (e: Exception) {
                Log.e(TAG, "export failed: ${e.message}")
            }
        }
    }

    @Suppress("deprecation")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTitle(R.string.in_app_title)
        setContentView(R.layout.activity_main)

        // 沉浸模式：隐藏状态栏和导航栏
        window.setDecorFitsSystemWindows(false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        hideSystemBars()

        // ========== 请求所有权限 ==========
        requestAllPermissions()

        wallpaperPickerLauncher = registerForActivityResult(
            ActivityResultContracts.GetContent()
        ) { uri: Uri? ->
            jsBridge?.onWallpaperPicked(uri)
        }

        timeBgPickerLauncher = registerForActivityResult(
            ActivityResultContracts.GetContent()
        ) { uri: Uri? ->
            jsBridge?.onTimeBgPicked(uri)
        }

        val prefs = getSharedPreferences("vibe_prefs", MODE_PRIVATE)

        webView = findViewById(R.id.webView)
        webView?.let { wv ->
            wv.settings.apply {
                javaScriptEnabled = true
                allowFileAccess = true
                domStorageEnabled = true
                allowUniversalAccessFromFileURLs = true
                allowFileAccessFromFileURLs = true
            }
            wv.overScrollMode = View.OVER_SCROLL_NEVER
            wv.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                    val line = "[${msg.messageLevel()}] ${msg.sourceId()}:${msg.lineNumber()} - ${msg.message()}"
                    Log.d(TAG, line)
                    try {
                        getLogFile().appendText(line + "\n")
                    } catch (_: Exception) {}

                    if (msg.messageLevel() == ConsoleMessage.MessageLevel.ERROR && !errorDialogShown) {
                        showErrorExportDialog()
                    }
                    return true
                }

                override fun onJsAlert(view: WebView, url: String, message: String, result: android.webkit.JsResult): Boolean {
                    Log.d(TAG, "[ALERT] $message")
                    result.confirm()
                    return true
                }


            }
            wv.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    Log.d(TAG, "onPageFinished: $url")
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    Log.e(TAG, "onReceivedError: ${request.url} code=${error.errorCode} ${error.description}")
                    if (!errorDialogShown) showErrorExportDialog()
                }

                override fun onReceivedError(view: WebView, errorCode: Int, description: String, failingUrl: String) {
                    Log.e(TAG, "onReceivedError(deprecated): $failingUrl code=$errorCode $description")
                    if (!errorDialogShown) showErrorExportDialog()
                }
            }
            val bridge = JsBridge(this, wv); jsBridge = bridge; wv.addJavascriptInterface(bridge, "NativeBridge")
            // 检查历史崩溃日志
        filesDir.listFiles()?.filter { it.name.startsWith("crash_") }?.forEach { crashFile ->
            try {
                val text = crashFile.readText()
                runOnUiThread {
                    AlertDialog.Builder(this)
                        .setTitle("应用上次异常退出❌")
                        .setMessage("是否导出或分享崩溃日志？")
                        .setPositiveButton("导出") { _, _ ->
                            exportLogLauncher.launch(crashFile.name)
                        }
                        .setNeutralButton("分享") { _, _ ->
                            try {
                                val text = crashFile.readText()
                                val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(android.content.Intent.EXTRA_SUBJECT, "Vibe Launcher 崩溃日志")
                                    putExtra(android.content.Intent.EXTRA_TEXT, text)
                                }
                                startActivity(android.content.Intent.createChooser(intent, "分享日志"))
                            } catch (_: Exception) {}
                        }
                        .setNegativeButton("删除") { _, _ ->
                            crashFile.delete()
                        }
                        .show()
                }
            } catch (_: Exception) {}
        }

        val hotReload = prefs.getBoolean("hot_reload_enabled", false)
            val externalHtml = java.io.File(filesDir, "index.html")
            val loadPath = if (hotReload && externalHtml.exists()) {
                Log.d(TAG, "loading external index.html from $externalHtml (hot-reload ON)")
                "file://${externalHtml.absolutePath}"
            } else {
                Log.d(TAG, "loading bundled index.html (hot-reload OFF)")
                "file:///android_asset/index.html"
            }
            wv.loadUrl(loadPath)

            // Predictive back gesture (Android 14+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                onBackInvokedDispatcher.registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    object : OnBackAnimationCallback {
                        override fun onBackStarted(backEvent: BackEvent) {
                            wv.evaluateJavascript("if(window._onBackStarted)window._onBackStarted();", null)
                        }
                        override fun onBackProgressed(backEvent: BackEvent) {
                            wv.evaluateJavascript("if(window._onBackProgress)window._onBackProgress(${backEvent.progress});", null)
                        }
                        override fun onBackInvoked() {
                            wv.evaluateJavascript("if(window._onBackPressed)window._onBackPressed();", null)
                        }
                        override fun onBackCancelled() {
                            wv.evaluateJavascript("if(window._onBackCancelled)window._onBackCancelled();", null)
                        }
                    }
                )
            } else {
                onBackPressedDispatcher.addCallback {
                    wv.evaluateJavascript("if(window._onBackPressed)window._onBackPressed();", null)
                }
            }
        }
    }

    // ==================== 权限请求 ====================

    private fun requestAllPermissions() {
        // 1. 运行时危险权限
        val needRuntime = RUNTIME_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()
        if (needRuntime.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needRuntime, RC_RUNTIME_PERMS)
        }

        // 2. 特殊权限：WRITE_SETTINGS
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.System.canWrite(this)) {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivityForResult(intent, RC_WRITE_SETTINGS)
        }

        // 3. 特殊权限：SYSTEM_ALERT_WINDOW
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivityForResult(intent, RC_OVERLAY)
        }

        // 4. 设备管理员激活引导
        if (!isDeviceAdminActive()) {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                    ComponentName(this@MainActivity, VibeDeviceAdminReceiver::class.java))
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "激活设备管理员后，Vibe Launcher 可以锁定屏幕、擦除数据等")
            }
            startActivityForResult(intent, RC_ADMIN)
        }

        // 5. 无障碍服务引导
        if (!isAccessibilityServiceEnabled()) {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }
    }

    private fun isDeviceAdminActive(): Boolean {
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val component = ComponentName(this@MainActivity, VibeDeviceAdminReceiver::class.java)
        return dpm.isAdminActive(component)
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val service = ComponentName(this, VibeAccessibilityService::class.java)
        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabledServices.split(':').any { it.equals(service.flattenToString(), ignoreCase = true) }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == RC_RUNTIME_PERMS) {
            val denied = permissions.filterIndexed { i, _ ->
                grantResults[i] != PackageManager.PERMISSION_GRANTED
            }
            if (denied.isNotEmpty()) {
                Log.w(TAG, "权限被拒绝: $denied")
            } else {
                Log.d(TAG, "所有运行时权限已授予")
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            RC_WRITE_SETTINGS -> {
                Log.d(TAG, "WRITE_SETTINGS 结果: canWrite=${Settings.System.canWrite(this)}")
            }
            RC_OVERLAY -> {
                Log.d(TAG, "SYSTEM_ALERT_WINDOW 结果: canDrawOverlays=${Settings.canDrawOverlays(this)}")
            }
            RC_ADMIN -> {
                Log.d(TAG, "设备管理员结果: isActive=${isDeviceAdminActive()}")
            }
        }
    }

    private fun showErrorExportDialog() {
        errorDialogShown = true

        AlertDialog.Builder(this)
            .setTitle("应用出现错误❌")
            .setMessage("是否导出或分享日志文件？")
            .setPositiveButton("导出") { _, _ ->
                exportLogLauncher.launch("vibe-launcher-error-log.txt")
            }
            .setNeutralButton("分享") { _, _ ->
                try {
                    val logFile = getLogFile()
                    val text = if (logFile.exists()) logFile.readText() else "日志为空"
                    Log.d(TAG, "Share: logFile exists=${logFile.exists()} size=${logFile.length()}")
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Vibe Launcher 错误日志")
                        putExtra(Intent.EXTRA_TEXT, text)
                    }
                    startActivity(Intent.createChooser(intent, "分享日志"))
                    Log.d(TAG, "Share intent sent successfully")
                } catch (e: Exception) {
                    Log.e(TAG, "Share failed: ${e.message}")
                }
            }
            .setNegativeButton("取消", null)
            .setCancelable(false)
            .show()
    }

    @Suppress("deprecation")
    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}

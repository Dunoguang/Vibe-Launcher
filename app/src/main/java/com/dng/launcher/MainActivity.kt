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

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "VibeLauncher"
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
    private var errorDialogShown = false
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

        window.setDecorFitsSystemWindows(false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        hideSystemBars()

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
            // Set static reference for notification bridge
            JsBridge.setWebView(wv)

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

            // Crash log check
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

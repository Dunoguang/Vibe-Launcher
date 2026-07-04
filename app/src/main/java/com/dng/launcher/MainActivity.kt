package com.dng.launcher

import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.io.FileWriter
import java.io.PrintWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private var webView: WebView? = null
    private lateinit var logFile: File
    private var logWriter: PrintWriter? = null

    @Suppress("deprecation")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTitle(R.string.in_app_title)
        setContentView(R.layout.activity_main)

        // Setup log file
        val logDir = File(filesDir, "logs")
        logDir.mkdirs()
        val sdf = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
        logFile = File(logDir, "webview_${sdf.format(Date())}.log")
        logWriter = PrintWriter(FileWriter(logFile, true), true)
        log("=== WebView log started ===")
        log("filesDir: $filesDir")
        log("logFile: ${logFile.absolutePath}")

        webView = findViewById(R.id.webView)
        webView?.let { wv ->
            wv.settings.apply {
                javaScriptEnabled = true
                allowFileAccess = true
                domStorageEnabled = true
            }
            wv.overScrollMode = View.OVER_SCROLL_NEVER

            wv.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                    val level = when (msg.messageLevel()) {
                        ConsoleMessage.MessageLevel.ERROR -> "E"
                        ConsoleMessage.MessageLevel.WARNING -> "W"
                        ConsoleMessage.MessageLevel.LOG -> "L"
                        ConsoleMessage.MessageLevel.TIP -> "I"
                        ConsoleMessage.MessageLevel.DEBUG -> "D"
                        else -> "?"
                    }
                    log("[JS:$level] ${msg.sourceId()}:${msg.lineNumber()} ${msg.message()}")
                    Log.d("WebView", "[$level] ${msg.message()}")
                    return true
                }
            }

            wv.addJavascriptInterface(JsBridge(this, wv), "NativeBridge")
            wv.loadUrl("file:///android_asset/index.html")
        }

        onBackPressedDispatcher.addCallback {
            if (webView?.canGoBack() == true) {
                webView?.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
            }
        }
    }

    private fun log(msg: String) {
        try {
            logWriter?.let {
                val ts = SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
                it.println("$ts $msg")
                it.flush()
            }
        } catch (_: Exception) {}
    }

    @Suppress("deprecation")
    override fun onDestroy() {
        log("=== WebView log ended ===")
        logWriter?.close()
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}

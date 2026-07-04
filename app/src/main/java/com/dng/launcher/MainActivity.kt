package com.dng.launcher

import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "VibeLauncher"
    }

    private var webView: WebView? = null

    @Suppress("deprecation")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTitle(R.string.in_app_title)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        webView?.let { wv ->
            wv.settings.apply {
                javaScriptEnabled = true
                allowFileAccess = true
                domStorageEnabled = true
                allowUniversalAccessFromFileURLs = true
            }
            wv.overScrollMode = View.OVER_SCROLL_NEVER
            wv.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                    Log.d(TAG, "[${msg.messageLevel()}] ${msg.sourceId()}:${msg.lineNumber()} - ${msg.message()}")
                    return true
                }
            }
            wv.addJavascriptInterface(JsBridge(this, wv), "NativeBridge")
            wv.loadUrl("file:///android_asset/index.html")
        }

        onBackPressedDispatcher.addCallback {
            if (webView?.canGoBack() == true) webView?.goBack()
            else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
        }
    }

    @Suppress("deprecation")
    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}

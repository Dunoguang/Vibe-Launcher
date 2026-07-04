package com.dng.launcher

import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
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
                allowFileAccessFromFileURLs = true
            }
            wv.overScrollMode = View.OVER_SCROLL_NEVER
            wv.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                    Log.d(TAG, "[${msg.messageLevel()}] ${msg.sourceId()}:${msg.lineNumber()} - ${msg.message()}")
                    return true
                }
            }
            wv.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    Log.d(TAG, "onPageFinished: $url")
                }
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    Log.e(TAG, "onReceivedError: ${request.url} code=${error.errorCode} ${error.description}")
                }
                override fun onReceivedError(view: WebView, errorCode: Int, description: String, failingUrl: String) {
                    Log.e(TAG, "onReceivedError(deprecated): $failingUrl code=$errorCode $description")
                }
            }
            wv.addJavascriptInterface(JsBridge(this, wv), "NativeBridge")
            val externalHtml = java.io.File(filesDir, "index.html")
            val loadPath = if (externalHtml.exists()) {
                Log.d(TAG, "loading external index.html from $externalHtml")
                "file://${externalHtml.absolutePath}"
            } else {
                Log.d(TAG, "loading bundled index.html")
                "file:///android_asset/index.html"
            }
            wv.loadUrl(loadPath)
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

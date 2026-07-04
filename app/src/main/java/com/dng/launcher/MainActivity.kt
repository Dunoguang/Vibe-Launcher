package com.dng.launcher

import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

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
            }
            wv.overScrollMode = View.OVER_SCROLL_NEVER
            wv.webChromeClient = WebChromeClient()
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

    @Suppress("deprecation")
    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}

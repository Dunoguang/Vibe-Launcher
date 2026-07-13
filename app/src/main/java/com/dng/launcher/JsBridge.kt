package com.dng.launcher

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.lang.ref.WeakReference

class JsBridge(context: Context, webView: WebView) {
    val contextRef = WeakReference(context)
    val webViewRef = WeakReference(webView)

    // 模块实例
    private val shellModule = ShellModule(this)
    private val shizukuModule = ShizukuModule(this)  // 新增
    private val wifiModule = WifiModule(this)
    private val appModule = AppModule(this)
    private val systemModule = SystemModule(this)
    private val mediaModule = MediaModule(this)
    private val wallpaperModule = WallpaperModule(this)
    private val infoModule = InfoModule(this)
    private val adminModule = AdminModule(this)

    // ============ ShizukuModule 委托 ============
    @JavascriptInterface
    fun shizukuIsConnected(): String = shizukuModule.isConnected()

    @JavascriptInterface
    fun shizukuExecShell(command: String, callbackId: String) = shizukuModule.execShell(command, callbackId)

    // ============ ShellModule 委托 ============
    @JavascriptInterface
    fun execShell(command: String, callbackId: String) = shellModule.execShell(command, callbackId)

    // ============ WifiModule 委托 ============
    @JavascriptInterface
    fun getWifiState() = wifiModule.getWifiState()

    @JavascriptInterface
    fun setWifiEnabled(enable: Boolean) = wifiModule.setWifiEnabled(enable)

    @JavascriptInterface
    fun openWifiSettings() = wifiModule.openWifiSettings()

    @JavascriptInterface
    fun getCurrentWifiInfo() = wifiModule.getCurrentWifiInfo()

    // ============ AppModule 委托 ============
    @JavascriptInterface
    fun requestInstalledApps() = appModule.requestInstalledApps()

    @JavascriptInterface
    fun requestAppIcons(packageNamesJson: String, iconRes: Int) = appModule.requestAppIcons(packageNamesJson, iconRes)
    @JavascriptInterface
    fun clearIconCache() = appModule.clearIconCache()

    @JavascriptInterface
    fun launchApp(packageName: String) = appModule.launchApp(packageName)

    @JavascriptInterface
    fun uninstallApp(packageName: String) = appModule.uninstallApp(packageName)

    @JavascriptInterface
    fun openAppDetails(packageName: String) = appModule.openAppDetails(packageName)
    // ============ SystemModule 委托 ============
    @JavascriptInterface
    fun setHotReload(enabled: Boolean) = systemModule.setHotReload(enabled)

    @JavascriptInterface
    fun crashTest() = systemModule.crashTest()

    @JavascriptInterface
    fun goBack() = systemModule.goBack()

    @JavascriptInterface
    fun log(msg: String) = systemModule.log(msg)

    @JavascriptInterface
    fun getBatteryLevel() = systemModule.getBatteryLevel()

    @JavascriptInterface
    fun isCharging() = systemModule.isCharging()

    @JavascriptInterface
    fun getMobileDataEnabled() = systemModule.getMobileDataEnabled()

    @JavascriptInterface
    fun setMobileDataEnabled(enabled: Boolean) = systemModule.setMobileDataEnabled(enabled)

    @JavascriptInterface
    fun getBrightness() = systemModule.getBrightness()

    @JavascriptInterface
    fun setBrightness(brightness: Int) = systemModule.setBrightness(brightness)

    @JavascriptInterface
    fun getVolume() = systemModule.getVolume()

    @JavascriptInterface
    fun setVolume(volume: Int) = systemModule.setVolume(volume)

    @JavascriptInterface
    fun toggleFlashlight() = systemModule.toggleFlashlight()

    @JavascriptInterface
    fun getFlashlightState() = systemModule.getFlashlightState()

    @JavascriptInterface
    fun setFlashlight(enabled: Boolean) = systemModule.setFlashlight(enabled)
    @JavascriptInterface
    fun mediaPlayPause() = mediaModule.mediaPlayPause()

    @JavascriptInterface
    fun mediaNext() = mediaModule.mediaNext()

    @JavascriptInterface
    fun mediaPrevious() = mediaModule.mediaPrevious()

    @JavascriptInterface
    fun lockScreen() = systemModule.lockScreen()

    @JavascriptInterface
    fun openSettings() = systemModule.openSettings()

    @JavascriptInterface
    fun openAirplaneModeSettings() = systemModule.openAirplaneModeSettings()

    @JavascriptInterface
    fun shareText(text: String) = systemModule.shareText(text)

    @JavascriptInterface
    fun getVolumeInfo() = systemModule.getVolumeInfo()

    @JavascriptInterface
    fun requestSettingsPermission() = systemModule.requestSettingsPermission()

    @JavascriptInterface
    fun canWriteSettings() = systemModule.canWriteSettings()

    @JavascriptInterface
    fun getSimInfo() = systemModule.getSimInfo()

    @JavascriptInterface
    fun hotspotEnabled() = systemModule.hotspotEnabled()

    // ============ MediaModule 委托 ============
    @JavascriptInterface
    fun getMusicInfo() = mediaModule.getMusicInfo()

    @JavascriptInterface
    fun getMusicCoverUrl() = mediaModule.getMusicCoverUrl()

    // ============ WallpaperModule 委托 ============
    @JavascriptInterface
    fun pickWallpaper() = wallpaperModule.pickWallpaper()

    @JavascriptInterface
    fun getWallpaperPath() = wallpaperModule.getWallpaperPath()

    @JavascriptInterface
    fun removeWallpaper() = wallpaperModule.removeWallpaper()

    @JavascriptInterface
    fun pickTimeBg() = wallpaperModule.pickTimeBg()

    @JavascriptInterface
    fun getTimeBgPath() = wallpaperModule.getTimeBgPath()

    @JavascriptInterface
    fun removeTimeBg() = wallpaperModule.removeTimeBg()

    // ============ InfoModule 委托 ============
    @JavascriptInterface
    fun getSystemInfo() = infoModule.getSystemInfo()

    @JavascriptInterface
    fun getNetworkInfo() = infoModule.getNetworkInfo()

    // ============ AdminModule 委托 ============
    @JavascriptInterface
    fun lockScreen(callbackId: String) = adminModule.lockScreen(callbackId)

    @JavascriptInterface
    fun isAdminActive(callbackId: String) = adminModule.isAdminActive(callbackId)

    // 内部回调方法
    fun callback(funcName: String, jsonArg: String) {
        webViewRef.get()?.let { wv ->
            wv.post { wv.evaluateJavascript("window.$funcName($jsonArg);", null) }
        }
    }

    fun getContext(): Context? = contextRef.get()

    // 壁纸回调
    fun onWallpaperPicked(uri: android.net.Uri?) {
        wallpaperModule.onWallpaperPicked(uri)
    }

    fun onTimeBgPicked(uri: android.net.Uri?) {
        wallpaperModule.onTimeBgPicked(uri)
    }
}
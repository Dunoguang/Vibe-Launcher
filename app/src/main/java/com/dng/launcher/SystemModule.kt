package com.dng.launcher

import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.google.gson.Gson

class SystemModule(private val bridge: JsBridge) {
    private val gson = Gson()
    private var torchEnabled = false

    @JavascriptInterface
    fun setHotReload(enabled: Boolean): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return "{\"success\":false,\"error\":\"context lost\"}"
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
    fun goBack(): String {
        return try {
            bridge.webViewRef.get()?.post {
                bridge.webViewRef.get()?.evaluateJavascript("window._onBackPressed();", null)
            }
            """{"success":true}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun log(msg: String) {
        android.util.Log.d("VibeLauncher", "[web] $msg")
    }

    @JavascriptInterface
    fun getBatteryLevel(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            val level = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
            """{"success":true,"level":$level}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun isCharging(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val filter = android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val intent = ctx.registerReceiver(null, filter)
            val status = intent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
            val charging = status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
                           status == android.os.BatteryManager.BATTERY_STATUS_FULL
            """{"success":true,"charging":$charging,"status":$status}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getMobileDataEnabled(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val intent = Intent(android.provider.Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
            } else {
                val intent = Intent(android.provider.Settings.ACTION_WIRELESS_SETTINGS)
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return "{\"success\":false,\"error\":\"context lost\"}"
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
    fun getVolumeInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            """{"success":true,"canWrite":${Settings.System.canWrite(ctx)}}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getSimInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
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
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork
            val caps = network?.let { cm.getNetworkCapabilities(it) }
            val isHotspot = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI_AWARE) == true
            """{"success":true,"enabled":$isHotspot}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }
}
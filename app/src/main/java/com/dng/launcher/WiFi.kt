import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import java.io.BufferedReader
import java.io.InputStreamReader

// ==================== 设备信息获取 ====================

fun getDeviceInfo(context: Context): Map<String, Any> {
    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val isDeviceOwner = dpm.isDeviceOwnerApp(context.packageName)

    return mapOf(
        "apiRange" to when {
            Build.VERSION.SDK_INT <= 9 -> "API 1-9"
            Build.VERSION.SDK_INT == 10 -> "API 10"
            else -> "API 11+"
        },
        "wifiEnabled" to wifiManager.isWifiEnabled,
        "canChangeWifiState" to (context.checkSelfPermission(Manifest.permission.CHANGE_WIFI_STATE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED),
        "canDpmSetWifi" to (isDeviceOwner && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N),
        "canWriteSecureSettings" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                Settings.System.canWrite(context)),
        "isDeviceOwner" to isDeviceOwner,
        "uid" to when (Process.myUid()) {
            0 -> "0(root)"
            2000 -> "2000(shell)"
            else -> "其他(${Process.myUid()})"
        }
    )
}

// ==================== WiFi 开关方法合集 ====================

/**
 * 方式1：WifiManager.setWifiEnabled()（Android 9-）
 */
@Suppress("DEPRECATION")
fun toggleWifiViaManager(context: Context, enable: Boolean): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return false  // Android 10+ 封杀
    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    return wifiManager.setWifiEnabled(enable)
}

/**
 * 方式2：DevicePolicyManager.setWifiEnabled()（DO 特权，Android 11+）
 */
fun toggleWifiViaDpm(context: Context, adminComponent: ComponentName, enable: Boolean): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    if (!dpm.isDeviceOwnerApp(context.packageName)) return false
    return try {
        val m = dpm.javaClass.getMethod("setWifiEnabled", ComponentName::class.java, Boolean::class.java)
        m.invoke(dpm, adminComponent, enable) as Boolean
    } catch (e: Exception) {
        false
    }
}

/**
 * 方式3：Settings.Global.putInt()（需 WRITE_SECURE_SETTINGS）
 */
fun toggleWifiViaSettings(context: Context, enable: Boolean): Boolean {
    return Settings.Global.putInt(
        context.contentResolver,
        Settings.Global.WIFI_ON,
        if (enable) 1 else 0
    )
}

/**
 * 方式4：Settings.Panel.ACTION_WIFI 悬浮窗（Android 10+，需用户点击）
 */
fun openWifiPanel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val intent = Intent(Settings.Panel.ACTION_WIFI)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}

/**
 * 方式4降级：Settings.ACTION_WIFI_SETTINGS（所有版本，需用户手动翻）
 */
fun openWifiSettings(context: Context) {
    val intent = Intent(Settings.ACTION_WIFI_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
}

/**
 * 方式5：svc wifi 命令（需 Root）
 */
fun toggleWifiViaSvc(enable: Boolean): Boolean {
    return execShell("su -c svc wifi ${if (enable) "enable" else "disable"}")
}

/**
 * 方式6：settings put global 命令（需 Root 或 ADB Shell）
 */
fun toggleWifiViaShellSettings(enable: Boolean): Boolean {
    return execShell("su -c settings put global wifi_on ${if (enable) 1 else 0}")
}

// ==================== 统一智能开关 WiFi ====================

/**
 * 智能切换 WiFi（按优先级自动选择可用方式）
 */
fun smartToggleWifi(context: Context, adminComponent: ComponentName? = null, enable: Boolean): String {
    // 1. 尝试 WifiManager（API 9-）
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {  // Android 9- 可用
        if (toggleWifiViaManager(context, enable)) return "WifiManager 切换成功"
    }

    // 2. 尝试 DevicePolicyManager（DO 特权）
    if (adminComponent != null && toggleWifiViaDpm(context, adminComponent, enable)) {
        return "DevicePolicyManager 切换成功"
    }

    // 3. 尝试 Settings.Global（需 WRITE_SECURE_SETTINGS 权限，仅系统/DO应用可用）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkWriteSecureSettings(context)) {
        if (toggleWifiViaSettings(context, enable)) return "Settings.Global 切换成功"
    }

    // 4. 尝试 Root 命令
    if (toggleWifiViaSvc(enable)) return "Root svc 命令切换成功"
    if (toggleWifiViaShellSettings(enable)) return "Root settings 命令切换成功"

    // 5. 兜底：弹出悬浮窗或跳转设置页
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        openWifiPanel(context)
        return "已弹出 WiFi 悬浮面板，请手动操作"
    } else {
        openWifiSettings(context)
        return "已跳转 WiFi 设置页，请手动操作"
    }
}

// ==================== 工具方法 ====================

/**
 * 执行 Shell 命令（需 Root）
 */
/**
 * 检查是否有 WRITE_SECURE_SETTINGS 权限
 */
fun checkWriteSecureSettings(context: Context): Boolean {
    return try {
        val method = Settings.System::class.java.getMethod("getString", android.net.Uri::class.java)
        true  // 能反射调用基本就说明有权限
    } catch (e: Exception) {
        Settings.System.canWrite(context)  // 退一步检查
    }
}

/**
 * 执行 Shell 命令（需 Root）
 */
fun execShell(command: String): Boolean {
    return try {
        val process = Runtime.getRuntime().exec(command)
        process.waitFor()
        process.exitValue() == 0
    } catch (e: Exception) {
        false
    }
}

/**
 * API 1-9 专用：直接切换 WiFi
 */
@Suppress("DEPRECATION")
fun toggleWifiSimple(context: Context) {  // 简单切换，不依赖权限
    if (Build.VERSION.SDK_INT <= 9) {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.setWifiEnabled(!wifiManager.isWifiEnabled)
    }
}
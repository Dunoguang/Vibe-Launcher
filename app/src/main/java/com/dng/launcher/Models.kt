package com.dng.launcher

data class AppInfo(val packageName: String, val appName: String, val isSystem: Boolean)
data class AppsResult(val success: Boolean, val apps: List<AppInfo>)
data class IconResult(val packageName: String, val iconUrl: String)
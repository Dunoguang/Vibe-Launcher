# Keep all @JavascriptInterface methods (JsBridge + all modules)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Gson data classes used by NativeBridge
-keep class com.dng.launcher.AppInfo { *; }
-keep class com.dng.launcher.AppsResult { *; }
-keep class com.dng.launcher.IconResult { *; }

# Keep all module classes with their public methods
-keep class com.dng.launcher.AppModule { *; }
-keep class com.dng.launcher.WifiModule { *; }
-keep class com.dng.launcher.SystemModule { *; }
-keep class com.dng.launcher.MediaModule { *; }
-keep class com.dng.launcher.WallpaperModule { *; }
-keep class com.dng.launcher.InfoModule { *; }
-keep class com.dng.launcher.ShellModule { *; }

# Keep MainActivity
-keep class com.dng.launcher.MainActivity { *; }

# Keep JsBridge inner classes (Message etc.)
-keep class com.dng.launcher.JsBridge$** { *; }

# Keep AdminModule
-keep class com.dng.launcher.AdminModule { *; }

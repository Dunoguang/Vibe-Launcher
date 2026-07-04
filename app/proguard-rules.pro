# Keep JavascriptInterface methods
-keepclassmembers class com.dng.launcher.JsBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Gson data classes
-keep class com.dng.launcher.JsBridge$** { *; }

# Keep MainActivity (entry point)
-keep class com.dng.launcher.MainActivity { *; }

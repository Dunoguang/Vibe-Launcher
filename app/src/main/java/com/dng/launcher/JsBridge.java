package com.dng.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.LruCache;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.ref.WeakReference;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class JsBridge {

    private final WeakReference<Context> contextRef;
    private final WeakReference<WebView> webViewRef;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Gson gson = new Gson();
    private final Collator collator = Collator.getInstance(Locale.CHINA);

    // Memory cache: max 64 icons
    private final LruCache<String, Bitmap> memoryCache = new LruCache<String, Bitmap>(64 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap bitmap) {
            return bitmap.getAllocationByteCount();
        }
    };

    // Disk cache dir
    private final File iconCacheDir;

    // Cached app list (invalidated on package change)
    private volatile List<AppInfo> cachedApps = null;
    private volatile boolean appsLoaded = false;

    // Track if receiver is registered
    private static volatile boolean receiverRegistered = false;

    public JsBridge(Context context, WebView webView) {
        this.contextRef = new WeakReference<>(context);
        this.webViewRef = new WeakReference<>(webView);
        this.iconCacheDir = new File(context.getCacheDir(), "icons");
        iconCacheDir.mkdirs();
        registerPackageReceiver(context);
    }

    private void registerPackageReceiver(Context ctx) {
        if (receiverRegistered) return;
        receiverRegistered = true;
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED);
        filter.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filter.addAction(Intent.ACTION_PACKAGE_REPLACED);
        filter.addDataScheme("package");
        ctx.getApplicationContext().registerReceiver(new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                // Invalidate cache on package changes
                cachedApps = null;
                appsLoaded = false;
            }
        }, filter);
    }

    // ── P0 #1: Async getInstalledApps with JS callback ──

    @JavascriptInterface
    public void requestInstalledApps() {
        if (cachedApps != null) {
            callback("_onAppsLoaded", gson.toJson(new AppsResult(true, cachedApps)));
            return;
        }
        executor.execute(() -> {
            try {
                Context ctx = contextRef.get();
                if (ctx == null) return;
                PackageManager pm = ctx.getPackageManager();
                List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);

                List<AppInfo> appList = new ArrayList<>();
                for (ApplicationInfo app : apps) {
                    if (pm.getLaunchIntentForPackage(app.packageName) == null) continue;
                    appList.add(new AppInfo(
                        app.packageName,
                        pm.getApplicationLabel(app).toString(),
                        (app.flags & ApplicationInfo.FLAG_SYSTEM) != 0
                    ));
                }

                // P2 #9: Chinese collation
                Collections.sort(appList, (a, b) -> collator.compare(a.appName, b.appName));

                cachedApps = appList;
                appsLoaded = true;

                String json = gson.toJson(new AppsResult(true, appList));
                callback("_onAppsLoaded", json);
            } catch (Exception e) {
                callback("_onAppsError", "\"" + escapeJson(e.getMessage()) + "\"");
            }
        });
    }

    // ── P0 #2: Batch icon API ──

    @JavascriptInterface
    public void requestAppIcons(String packageNamesJson) {
        executor.execute(() -> {
            try {
                Context ctx = contextRef.get();
                if (ctx == null) return;
                PackageManager pm = ctx.getPackageManager();

                String[] pkgs = gson.fromJson(packageNamesJson, String[].class);
                List<IconResult> results = new ArrayList<>();

                for (String pkg : pkgs) {
                    String url = getOrCreateIcon(ctx, pm, pkg);
                    results.add(new IconResult(pkg, url));
                }

                callback("_onIconsLoaded", gson.toJson(results));
            } catch (Exception e) {
                callback("_onIconsError", "\"" + escapeJson(e.getMessage()) + "\"");
            }
        });
    }

    // ── P0 #3: Icon to file cache, RGB_565, 96x96 ──

    private String getOrCreateIcon(Context ctx, PackageManager pm, String pkg) {
        File file = new File(iconCacheDir, pkg + ".png");

        // Check disk cache
        if (file.exists()) {
            return "file://" + file.getAbsolutePath();
        }

        // Check memory cache
        Bitmap cached = memoryCache.get(pkg);
        if (cached != null) {
            // Save from memory to disk
            saveBitmapToFile(cached, file);
            return "file://" + file.getAbsolutePath();
        }

        // Load and process
        try {
            Drawable icon = pm.getApplicationIcon(pkg);
            Bitmap bitmap = drawableToBitmap(icon);
            // P1 #6: RGB_565 + 96x96
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true);
            if (scaled.getConfig() != Bitmap.Config.RGB_565) {
                Bitmap rgb565 = scaled.copy(Bitmap.Config.RGB_565, false);
                scaled.recycle();
                scaled = rgb565;
            }
            if (scaled != bitmap) bitmap.recycle();

            // P2 #11: LruCache
            memoryCache.put(pkg, scaled);

            // Save to disk (P0 #3)
            saveBitmapToFile(scaled, file);

            return "file://" + file.getAbsolutePath();
        } catch (Exception e) {
            return "";
        }
    }

    private void saveBitmapToFile(Bitmap bitmap, File file) {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 80, fos);
        } catch (Exception ignored) {}
    }

    // ── P1 #6: RGB_565 96x96 ──
    private Bitmap drawableToBitmap(Drawable drawable) {
        if (drawable instanceof BitmapDrawable) {
            return ((BitmapDrawable) drawable).getBitmap();
        }
        int w = drawable.getIntrinsicWidth();
        int h = drawable.getIntrinsicHeight();
        if (w <= 0) w = 96;
        if (h <= 0) h = 96;
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, w, h);
        drawable.draw(canvas);
        return bitmap;
    }

    // ── launchApp (sync, fast) ──

    @JavascriptInterface
    public String launchApp(String packageName) {
        try {
            Context ctx = contextRef.get();
            if (ctx == null) return "{\"success\":false,\"error\":\"context lost\"}";
            Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
                return "{\"success\":true}";
            }
            return "{\"success\":false,\"error\":\"no launch activity\"}";
        } catch (Exception e) {
            return "{\"success\":false,\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
        }
    }

    // ── Helper: callback to JS ──

    private void callback(String funcName, String jsonArg) {
        WebView wv = webViewRef.get();
        if (wv != null) {
            wv.post(() -> wv.evaluateJavascript(
                "window." + funcName + "(" + jsonArg + ");", null));
        }
    }

    private String escapeJson(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // ── Data classes ──

    static class AppInfo {
        String packageName;
        String appName;
        boolean isSystem;
        AppInfo(String p, String n, boolean s) {
            packageName = p; appName = n; isSystem = s;
        }
    }

    static class AppsResult {
        boolean success;
        List<AppInfo> apps;
        AppsResult(boolean s, List<AppInfo> a) { success = s; apps = a; }
    }

    static class IconResult {
        String packageName;
        String iconUrl;
        IconResult(String p, String u) { packageName = p; iconUrl = u; }
    }
}

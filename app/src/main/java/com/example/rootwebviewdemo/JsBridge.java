package com.example.rootwebviewdemo;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class JsBridge {

    private final Context context;

    public JsBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public String getInstalledApps() {
        JSONObject response = new JSONObject();
        try {
            PackageManager pm = context.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);

            // Sort by app name
            Collections.sort(apps, (a, b) -> {
                String labelA = pm.getApplicationLabel(a).toString();
                String labelB = pm.getApplicationLabel(b).toString();
                return labelA.compareToIgnoreCase(labelB);
            });

            JSONArray appList = new JSONArray();
            for (ApplicationInfo app : apps) {
                JSONObject appObj = new JSONObject();
                appObj.put("packageName", app.packageName);
                appObj.put("appName", pm.getApplicationLabel(app).toString());
                appObj.put("isSystem", (app.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                appList.put(appObj);
            }

            response.put("success", true);
            response.put("apps", appList);
        } catch (Exception e) {
            try {
                response.put("success", false);
                response.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return response.toString();
    }

    @JavascriptInterface
    public String getAppIcon(String packageName) {
        JSONObject response = new JSONObject();
        try {
            PackageManager pm = context.getPackageManager();
            Drawable icon = pm.getApplicationIcon(packageName);
            Bitmap bitmap = drawableToBitmap(icon);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos);
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            response.put("success", true);
            response.put("icon", "data:image/png;base64," + base64);
        } catch (Exception e) {
            try {
                response.put("success", false);
                response.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return response.toString();
    }

    @JavascriptInterface
    public String launchApp(String packageName) {
        JSONObject response = new JSONObject();
        try {
            Intent intent = context.getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                response.put("success", true);
            } else {
                response.put("success", false);
                response.put("error", "App not found or has no launch activity");
            }
        } catch (Exception e) {
            try {
                response.put("success", false);
                response.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return response.toString();
    }

    private Bitmap drawableToBitmap(Drawable drawable) {
        if (drawable instanceof BitmapDrawable) {
            return ((BitmapDrawable) drawable).getBitmap();
        }
        int width = drawable.getIntrinsicWidth();
        int height = drawable.getIntrinsicHeight();
        if (width <= 0) width = 128;
        if (height <= 0) height = 128;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }
}

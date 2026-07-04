package com.example.rootwebviewdemo;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle(R.string.in_app_title);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (request.getResources() != null && request.getResources().length > 0) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            }
        });

        webView.addJavascriptInterface(new JsBridge(this), "NativeBridge");
        webView.loadUrl("file:///android_asset/index.html");

        tryGrantCameraPermission();
        tryGrantStoragePermission();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }

        super.onBackPressed();
    }

    private static final int REQUEST_CAMERA_PERMISSION = 1001;
    private static final int REQUEST_STORAGE_PERMISSION = 1002;

    private void tryGrantCameraPermission() {
        if (hasCameraPermission()) {
            return;
        }

        String packageName = getPackageName();
        RootShellExecutor.CommandResult result =
                RootShellExecutor.execute("pm grant " + packageName + " android.permission.CAMERA");

        if (!hasCameraPermission()) {
            requestCameraPermission();
        }
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestCameraPermission() {
        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
    }

    private void tryGrantStoragePermission() {
        if (hasStoragePermission()) {
            return;
        }

        String packageName = getPackageName();
        RootShellExecutor.CommandResult result =
                RootShellExecutor.execute("pm grant " + packageName + " android.permission.WRITE_EXTERNAL_STORAGE");

        if (!hasStoragePermission()) {
            requestStoragePermission();
        }
    }

    private boolean hasStoragePermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestStoragePermission() {
        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQUEST_STORAGE_PERMISSION);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           String[] permissions,
                                           int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "已授权相机权限", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "未获取相机权限，部分功能可能不可用", Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == REQUEST_STORAGE_PERMISSION) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "已授权存储权限", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "未获取存储权限，无法保存照片", Toast.LENGTH_LONG).show();
            }
        }
    }
}

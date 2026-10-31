const fs = require('fs');

function patchAndroidUi(mainActivityPath) {
  if (!fs.existsSync(mainActivityPath)) {
    throw new Error(`Missing MainActivity: ${mainActivityPath}`);
  }

  const content = `/*
       Licensed to the Apache Software Foundation (ASF) under one
       or more contributor license agreements.  See the NOTICE file
       distributed with this work for additional information
       regarding copyright ownership.  The ASF licenses this file
       to you under the Apache License, Version 2.0 (the
       "License"); you may not use this file except in compliance
       with the License.  You may obtain a copy of the License at

         http://www.apache.org/licenses/LICENSE-2.0

       Unless required by applicable law or agreed to in writing,
       software distributed under the License is distributed on an
       "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
       KIND, either express or implied.  See the License for the
       specific language governing permissions and limitations
       under the License.
 */

package com.liarsbar.game;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.text.format.Formatter;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import android.util.Base64;
import android.media.MediaScannerConnection;

import org.apache.cordova.CordovaActivity;
import org.apache.cordova.engine.SystemWebView;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;

public class MainActivity extends CordovaActivity
{
    private static final int DARK_BG_COLOR = Color.parseColor("#0d0e14");

    public String getDeviceIpAddress()
    {
        try {
            // 优先通过 WifiManager 获取 WiFi IP
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wm.getConnectionInfo() != null) {
                int ipInt = wm.getConnectionInfo().getIpAddress();
                if (ipInt != 0) {
                    String ip = Formatter.formatIpAddress(ipInt);
                    if (ip != null && !ip.equals("0.0.0.0") && !ip.equals("127.0.0.1")) {
                        return ip;
                    }
                }
            }
        } catch (Exception ignored) {}

        try {
            // 遍历所有网络接口获取局域网 IPv4
            for (Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces(); en.hasMoreElements();) {
                NetworkInterface intf = en.nextElement();
                for (Enumeration<InetAddress> enumIpAddr = intf.getInetAddresses(); enumIpAddr.hasMoreElements();) {
                    InetAddress inetAddress = enumIpAddr.nextElement();
                    if (!inetAddress.isLoopbackAddress() && inetAddress instanceof Inet4Address) {
                        String ip = inetAddress.getHostAddress();
                        if (ip != null && (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172."))) {
                            return ip;
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        return "127.0.0.1";
    }

    private void applySystemBarStyling()
    {
        Window window = getWindow();
        if (window == null) {
            return;
        }

        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(DARK_BG_COLOR);
        window.setNavigationBarColor(DARK_BG_COLOR);
        window.getDecorView().setBackgroundColor(DARK_BG_COLOR);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // 暗黑背景 => 浅色文字/图标
                controller.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(0);
        }
    }

    private void configureWebViewSettings()
    {
        if (appView != null) {
            View webView = appView.getView();
            if (webView != null) {
                webView.setBackgroundColor(DARK_BG_COLOR);
                if (webView instanceof SystemWebView) {
                    SystemWebView sysView = (SystemWebView) webView;
                    WebSettings settings = sysView.getSettings();
                    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                    settings.setDomStorageEnabled(true);
                    settings.setDatabaseEnabled(true);
                    settings.setAllowFileAccess(true);
                    settings.setAllowContentAccess(true);
                    settings.setJavaScriptEnabled(true);

                    // 暴露 AndroidDevice 给前端 JavaScript (实时获取手机 IP 与原生直存相册)
                    sysView.addJavascriptInterface(new Object() {
                        @JavascriptInterface
                        public String getDeviceIp() {
                            return getDeviceIpAddress();
                        }

                        @JavascriptInterface
                        public boolean saveImageToGallery(String base64Data) {
                            try {
                                if (base64Data == null || base64Data.isEmpty()) return false;
                                if (base64Data.contains(",")) {
                                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                                }
                                byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);

                                long now = System.currentTimeMillis();
                                String timeTag = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.CHINA).format(new Date(now));
                                String fileName = "IMG_" + timeTag + "_骗子酒馆.png";

                                // 1. Android 10+ (API 29+) 官方推荐标准 MediaStore 插入 (相册主页秒显)
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    ContentValues values = new ContentValues();
                                    values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/Camera");
                                    values.put(MediaStore.Images.Media.IS_PENDING, 1);

                                    ContentResolver resolver = getContentResolver();
                                    Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                                    if (uri != null) {
                                        OutputStream out = resolver.openOutputStream(uri);
                                        if (out != null) {
                                            out.write(decodedBytes);
                                            out.flush();
                                            out.close();
                                        }
                                        values.clear();
                                        values.put(MediaStore.Images.Media.IS_PENDING, 0);
                                        resolver.update(uri, values, null, null);

                                        MediaScannerConnection.scanFile(
                                            getApplicationContext(),
                                            new String[]{Environment.getExternalStorageDirectory() + "/DCIM/Camera/" + fileName},
                                            new String[]{"image/png"},
                                            null
                                        );
                                        return true;
                                    }
                                }

                                // 2. Android 9 及以下直接写入 DCIM/Camera
                                File dcim = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM);
                                File camera = new File(dcim, "Camera");
                                if (!camera.exists()) camera.mkdirs();
                                File file = new File(camera, fileName);
                                FileOutputStream fos = new FileOutputStream(file);
                                fos.write(decodedBytes);
                                fos.flush();
                                fos.close();

                                MediaScannerConnection.scanFile(
                                    getApplicationContext(),
                                    new String[]{file.getAbsolutePath()},
                                    new String[]{"image/png"},
                                    null
                                );
                                return true;
                            } catch (Exception e) {
                                e.printStackTrace();
                                return false;
                            }
                        }
                    }, "AndroidDevice");
                }
            }
        }
    }

    @Override
    protected void createViews()
    {
        super.createViews();
        configureWebViewSettings();
    }

    @Override
    public void onCreate(Bundle savedInstanceState)
    {
        setTheme(R.style.Theme_App_Main);
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        applySystemBarStyling();

        Bundle extras = getIntent().getExtras();
        if (extras != null && extras.getBoolean("cdvStartInBackground", false)) {
            moveTaskToBack(true);
        }

        loadUrl(launchUrl);
        configureWebViewSettings();
    }

    @Override
    public void onResume()
    {
        super.onResume();
        applySystemBarStyling();
        configureWebViewSettings();
    }
}
`;

  fs.writeFileSync(mainActivityPath, content, 'utf8');
  console.log(`Patched Android system bar styling in ${mainActivityPath}`);

  // 同时同步更新 AndroidManifest.xml 为横屏
  const manifestPath = mainActivityPath.replace(/java[\\\/].*$/, 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, 'utf8');
    if (manifest.includes('android:screenOrientation=')) {
      manifest = manifest.replace(/android:screenOrientation="[^"]*"/g, 'android:screenOrientation="sensorLandscape"');
    }
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log(`Patched screenOrientation to sensorLandscape in ${manifestPath}`);
  }
}

if (require.main === module) {
  const mainActivityPath = process.argv[2];
  if (!mainActivityPath) {
    console.error('Usage: node scripts/patch-android-ui.js <MainActivity.java>');
    process.exit(1);
  }
  patchAndroidUi(mainActivityPath);
}

module.exports = { patchAndroidUi };

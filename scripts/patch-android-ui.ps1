param(
  [string]$MainActivityPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $MainActivityPath)) {
  throw "Missing MainActivity: $MainActivityPath"
}

$content = @"
/*
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

package com.rps.royale;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;

import org.apache.cordova.CordovaActivity;
import org.apache.cordova.engine.SystemWebView;

public class MainActivity extends CordovaActivity
{
    private static final int DARK_BG_COLOR = Color.parseColor("#0f172a");

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
                // Dark background => light icons (do not set APPEARANCE_LIGHT_STATUS_BARS)
                controller.setSystemBarsAppearance(0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState)
    {
        setTheme(R.style.Theme_App_Main);
        super.onCreate(savedInstanceState);
        applySystemBarStyling();

        if (appView != null) {
            View webView = appView.getView();
            webView.setBackgroundColor(DARK_BG_COLOR);
            if (webView instanceof SystemWebView) {
                WebSettings settings = ((SystemWebView) webView).getSettings();
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        }

        Bundle extras = getIntent().getExtras();
        if (extras != null && extras.getBoolean("cdvStartInBackground", false)) {
            moveTaskToBack(true);
        }

        loadUrl(launchUrl);
    }

    @Override
    public void onResume()
    {
        super.onResume();
        applySystemBarStyling();
    }
}
"@

Set-Content -Path $MainActivityPath -Value $content -Encoding UTF8

Write-Host "Patched Android system bar styling in $MainActivityPath"

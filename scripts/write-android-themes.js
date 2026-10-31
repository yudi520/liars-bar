const fs = require('fs');
const path = require('path');

function writeAndroidThemes(themesPath) {
  if (!fs.existsSync(path.dirname(themesPath))) {
    fs.mkdirSync(path.dirname(themesPath), { recursive: true });
  }

  const content = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools">
    <style name="Theme.App.Main" parent="Theme.AppCompat.NoActionBar">
        <item name="android:statusBarColor">#0d0e14</item>
        <item name="android:navigationBarColor">#0d0e14</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar" tools:targetApi="27">false</item>
        <item name="android:windowDrawsSystemBarBackgrounds">true</item>
        <item name="android:windowBackground">#0d0e14</item>
    </style>

    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen.IconBackground">
        <item name="windowSplashScreenBackground">#0d0e14</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_cdv_splashscreen_image</item>
        <item name="windowSplashScreenAnimationDuration">0</item>
        <item name="postSplashScreenTheme">@style/Theme.App.Main</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement" tools:targetApi="35">true</item>
        <item name="android:statusBarColor">#0d0e14</item>
        <item name="android:navigationBarColor">#0d0e14</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar" tools:targetApi="27">false</item>
        <item name="android:windowDrawsSystemBarBackgrounds">true</item>
    </style>
</resources>
`;

  fs.writeFileSync(themesPath, content, 'utf8');
  console.log(`Wrote Android themes to ${themesPath}`);
}

if (require.main === module) {
  const themesPath = process.argv[2];
  if (!themesPath) {
    console.error('Usage: node scripts/write-android-themes.js <themes.xml>');
    process.exit(1);
  }
  writeAndroidThemes(themesPath);
}

module.exports = { writeAndroidThemes };

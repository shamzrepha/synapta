# Native updater for the Android app (for Antigravity, `sunroot-mobile` project)

The website already finds new releases by itself and shows the update banner (see `docs/RELEASING.md`). It downloads inside the page if it has to, but Android's WebView cannot reliably download or install files. This small Capacitor plugin does the download natively with real progress and opens Android's installer. The website uses it automatically when it exists (`Capacitor.Plugins.SunrootUpdater`) and falls back to the browser when it does not.

Android never allows silent installs outside Google Play: the system installer always shows **Install** and the person taps it once. That is the best possible without Play.

## 1. Manifest (`android/app/src/main/AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

<!-- inside <application> -->
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
</provider>
```

## 2. `android/app/src/main/res/xml/file_paths.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-files-path name="downloads" path="Download/" />
</paths>
```

## 3. `android/app/src/main/java/com/sunroot/app/SunrootUpdaterPlugin.java`
```java
package com.sunroot.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/** Downloads the update APK with progress and opens the system installer. The call resolves when the installer has been opened. */
@CapacitorPlugin(name = "SunrootUpdater")
public class SunrootUpdaterPlugin extends Plugin {
    private static final String OFFICIAL =
        "^https://(sunrootlearn\\.vercel\\.app/|github\\.com/shamzrepha/synapta/releases/download/[A-Za-z0-9._-]+/)[A-Za-z0-9._-]+\\.apk$";
    private final Handler ui = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.matches(OFFICIAL)) {
            call.reject("Refused: not an official update link");
            return;
        }
        final Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(settings);
            JSObject r = new JSObject();
            r.put("needsPermission", true);
            call.resolve(r);
            return;
        }

        final DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        final File file = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "sunroot-update.apk");
        if (file.exists()) file.delete();
        final long id = dm.enqueue(
            new DownloadManager.Request(Uri.parse(url))
                .setTitle("Sunroot update")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationUri(Uri.fromFile(file)));
        getBridge().saveCall(call); // the call stays open until the download is done

        ui.post(new Runnable() {
            @Override
            public void run() {
                DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
                try (Cursor c = dm.query(q)) {
                    if (c == null || !c.moveToFirst()) { fail(call, "The download disappeared"); return; }
                    int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    JSObject p = new JSObject();
                    p.put("received", got);
                    if (total > 0) { p.put("total", total); p.put("percent", got * 100.0 / total); }
                    notifyListeners("progress", p);
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        install(ctx, file);
                        JSObject r = new JSObject();
                        r.put("started", true);
                        call.resolve(r);
                        getBridge().releaseCall(call);
                        return;
                    }
                    if (status == DownloadManager.STATUS_FAILED) { fail(call, "The download failed"); return; }
                }
                ui.postDelayed(this, 400);
            }
        });
    }

    private void fail(PluginCall call, String message) {
        call.reject(message);
        getBridge().releaseCall(call);
    }

    private void install(Context ctx, File file) {
        Uri apk = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(apk, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }
}
```

## 4. Register it in `MainActivity.java`
```java
@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SunrootUpdaterPlugin.class); // before super.onCreate
    super.onCreate(savedInstanceState);
}
```

## 5. Check it
1. Install the previous build, then raise `versionCode` in `public/app-version.json` with `npm run release:app` (see `docs/RELEASING.md`).
2. Open the app: the banner shows the notes. Press **Update**: the bar moves with real percentages, then Android asks **Install**.
3. First time only: Android may open "Install unknown apps" for Sunroot. Turn it on, return and press **Update** again (the banner says so).
4. Reopen the app: Settings shows the new build number; **Check for updates** says "You're up to date".

## Report back
Whether the plugin compiled against your Capacitor version, and a short screen recording of steps 2 and 3.

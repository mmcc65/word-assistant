package com.personal.cet6words;

import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class MobileUpdater {
    private static final String PREFS = "word_assistant_updates";
    private static final String PENDING = "pending_update";
    private static final String LOG_TAG = "WordAssistantUpdater";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);

    private MobileUpdater() {}

    static void check(MainActivity activity, String manifestUrlsValue, boolean userInitiated) {
        List<String> manifestUrls = parseManifestUrls(manifestUrlsValue);
        if (manifestUrls.isEmpty()) {
            if (userInitiated) showMessage(activity, "暂时无法检查更新", "此版本尚未配置可信的 HTTPS 更新源。");
            return;
        }
        if (!BUSY.compareAndSet(false, true)) return;
        EXECUTOR.execute(() -> {
            try {
                UpdateInfo update = fetchLatestManifest(manifestUrls);
                long installed = installedVersionCode(activity);
                activity.runOnUiThread(() -> {
                    if (update.versionCode > installed) offerUpdate(activity, update);
                    else if (userInitiated) showMessage(activity, "已经是最新版", "当前版本：" + activity.getAppVersionName());
                });
            } catch (Exception error) {
                Log.e(LOG_TAG, "All update channels failed", error);
                if (userInitiated) activity.runOnUiThread(() -> showMessage(activity, "检查更新失败", "更新通道暂时不可用，请检查网络后重试。"));
            } finally {
                BUSY.set(false);
            }
        });
    }

    static void resumePendingInstall(MainActivity activity) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) return;
        SharedPreferences preferences = activity.getSharedPreferences(PREFS, MainActivity.MODE_PRIVATE);
        String pending = preferences.getString(PENDING, "");
        if (pending.isEmpty()) return;
        preferences.edit().remove(PENDING).apply();
        try { downloadAndInstall(activity, UpdateInfo.fromJson(new JSONObject(pending))); }
        catch (Exception ignored) { }
    }

    private static List<String> parseManifestUrls(String value) {
        LinkedHashSet<String> urls = new LinkedHashSet<>();
        String normalized = value == null ? "" : value.trim();
        try {
            if (normalized.startsWith("[")) {
                JSONArray array = new JSONArray(normalized);
                for (int index = 0; index < array.length(); index++) addTrustedUrl(urls, array.optString(index));
            } else addTrustedUrl(urls, normalized);
        } catch (Exception error) {
            Log.w(LOG_TAG, "Invalid update channel list", error);
        }
        return new ArrayList<>(urls);
    }

    private static void addTrustedUrl(LinkedHashSet<String> urls, String value) {
        try {
            URL url = new URL(value == null ? "" : value.trim());
            if ("https".equalsIgnoreCase(url.getProtocol())) urls.add(url.toString());
        } catch (Exception ignored) { }
    }

    private static UpdateInfo fetchLatestManifest(List<String> manifestUrls) throws Exception {
        Exception lastError = null;
        UpdateInfo latest = null;
        for (String manifestUrl : manifestUrls) {
            try {
                UpdateInfo candidate = fetchManifest(manifestUrl);
                if (latest == null || candidate.versionCode > latest.versionCode) latest = candidate;
            } catch (Exception error) {
                lastError = error;
                Log.w(LOG_TAG, "Update channel failed", error);
            }
        }
        if (latest != null) return latest;
        if (lastError != null) throw lastError;
        throw new IOException("No update channel is available");
    }

    private static UpdateInfo fetchManifest(String manifestUrl) throws Exception {
        URL source = new URL(manifestUrl);
        HttpURLConnection connection = (HttpURLConnection) source.openConnection();
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(12_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("User-Agent", "Word-Assistant-Android-Updater");
        try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream())) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            JSONObject object = new JSONObject(output.toString(java.nio.charset.StandardCharsets.UTF_8.name()));
            URL apkUrl = new URL(source, object.getString("apkUrl"));
            if (!"https".equalsIgnoreCase(apkUrl.getProtocol())) throw new IllegalArgumentException("APK URL must use HTTPS");
            return new UpdateInfo(object.getLong("versionCode"), object.getString("versionName"), apkUrl.toString(), object.getString("sha256").toLowerCase(Locale.ROOT), object.optString("notes", "包含体验改进和问题修复。"));
        } finally {
            connection.disconnect();
        }
    }

    private static void offerUpdate(MainActivity activity, UpdateInfo update) {
        new AlertDialog.Builder(activity)
                .setTitle("发现生词助手 " + update.versionName)
                .setMessage(update.notes)
                .setNegativeButton("稍后", null)
                .setPositiveButton("下载更新", (dialog, which) -> beginInstall(activity, update))
                .show();
    }

    private static void beginInstall(MainActivity activity, UpdateInfo update) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            activity.getSharedPreferences(PREFS, MainActivity.MODE_PRIVATE).edit().putString(PENDING, update.toJson().toString()).apply();
            new AlertDialog.Builder(activity)
                    .setTitle("允许安装更新")
                    .setMessage("请允许“生词助手”安装未知应用，返回后会自动继续下载。")
                    .setNegativeButton("取消", (dialog, which) -> activity.getSharedPreferences(PREFS, MainActivity.MODE_PRIVATE).edit().remove(PENDING).apply())
                    .setPositiveButton("去开启", (dialog, which) -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))))
                    .show();
            return;
        }
        downloadAndInstall(activity, update);
    }

    private static void downloadAndInstall(MainActivity activity, UpdateInfo update) {
        if (!BUSY.compareAndSet(false, true)) return;
        ProgressDialog progress = new ProgressDialog(activity);
        progress.setTitle("正在下载生词助手 " + update.versionName);
        progress.setMessage("下载并校验完成后将打开系统安装界面");
        progress.setIndeterminate(true);
        progress.setCancelable(false);
        progress.show();
        EXECUTOR.execute(() -> {
            try {
                File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null) throw new IllegalStateException("Download directory is unavailable");
                File target = new File(directory, "WordAssistant-" + update.versionName + ".apk");
                download(update.apkUrl, target);
                if (!sha256(target).equalsIgnoreCase(update.sha256)) {
                    target.delete();
                    throw new SecurityException("Update checksum mismatch");
                }
                activity.runOnUiThread(() -> {
                    progress.dismiss();
                    Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", target);
                    Intent install = new Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(install);
                });
            } catch (Exception error) {
                Log.e(LOG_TAG, "Update download or verification failed", error);
                activity.runOnUiThread(() -> {
                    progress.dismiss();
                    showMessage(activity, "下载更新失败", "安装包下载或校验失败，请稍后重试。");
                });
            } finally {
                BUSY.set(false);
            }
        });
    }

    private static void download(String source, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            long total = 0;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > 150 * 1024 * 1024L) throw new IllegalStateException("APK is too large");
                output.write(buffer, 0, count);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (BufferedInputStream input = new BufferedInputStream(new java.io.FileInputStream(file))) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder value = new StringBuilder();
        for (byte item : digest.digest()) value.append(String.format(Locale.ROOT, "%02x", item));
        return value.toString();
    }

    private static void showMessage(MainActivity activity, String title, String message) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(message).setPositiveButton("知道了", null).show();
    }

    @SuppressWarnings("deprecation")
    private static long installedVersionCode(MainActivity activity) throws Exception {
        android.content.pm.PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    private static final class UpdateInfo {
        final long versionCode;
        final String versionName;
        final String apkUrl;
        final String sha256;
        final String notes;

        UpdateInfo(long versionCode, String versionName, String apkUrl, String sha256, String notes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.sha256 = sha256;
            this.notes = notes;
        }

        JSONObject toJson() {
            JSONObject value = new JSONObject();
            try {
                value.put("versionCode", versionCode);
                value.put("versionName", versionName);
                value.put("apkUrl", apkUrl);
                value.put("sha256", sha256);
                value.put("notes", notes);
            } catch (Exception ignored) { }
            return value;
        }

        static UpdateInfo fromJson(JSONObject value) throws Exception {
            return new UpdateInfo(value.getLong("versionCode"), value.getString("versionName"), value.getString("apkUrl"), value.getString("sha256"), value.optString("notes", ""));
        }
    }
}

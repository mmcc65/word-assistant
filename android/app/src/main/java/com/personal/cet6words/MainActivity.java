package com.personal.cet6words;

import android.os.Bundle;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ActivityResultLauncher<String[]> textFilePicker;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        textFilePicker = registerForActivityResult(new ActivityResultContracts.OpenDocument(), this::onTextFilePicked);
        getBridge().getWebView().addJavascriptInterface(new WordAssistantBridge(this), "WordAssistantAndroid");
    }

    private void onTextFilePicked(Uri uri) {
        if (uri == null) return;
        new Thread(() -> readTextFile(uri), "import-text-file").start();
    }

    private void readTextFile(Uri uri) {
        try {
            String name = "words.txt";
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (nameIndex >= 0 && cursor.getString(nameIndex) != null) name = cursor.getString(nameIndex);
                }
            }
            java.io.ByteArrayOutputStream content = new java.io.ByteArrayOutputStream();
            try (java.io.InputStream input = getContentResolver().openInputStream(uri)) {
                byte[] buffer = new byte[8192];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    if (content.size() + length > 5 * 1024 * 1024) throw new IllegalArgumentException("File too large");
                    content.write(buffer, 0, length);
                }
            }
            final String fileName = name;
            final String fileText = new String(content.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
            runOnUiThread(() -> {
                String event = "window.dispatchEvent(new CustomEvent('wordAssistantFilePicked',{detail:{name:" + org.json.JSONObject.quote(fileName)
                    + ",text:" + org.json.JSONObject.quote(fileText) + "}}))";
                getBridge().getWebView().evaluateJavascript(event, null);
            });
        } catch (Exception error) {
            runOnUiThread(() -> android.widget.Toast.makeText(this, "读取失败：请选择不超过 5 MB 的 TXT 或 CSV。", android.widget.Toast.LENGTH_LONG).show());
        }
    }

    void chooseTextFile() {
        runOnUiThread(() -> textFilePicker.launch(new String[]{"text/plain", "text/csv", "application/vnd.ms-excel", "application/octet-stream"}));
    }

    void deliverAudioResult(String requestId, String dataUrl) {
        String event = "window.dispatchEvent(new CustomEvent('wordAssistantAudioDownloaded',{detail:{requestId:"
            + org.json.JSONObject.quote(requestId) + ",dataUrl:" + org.json.JSONObject.quote(dataUrl) + "}}))";
        getBridge().getWebView().evaluateJavascript(event, null);
    }

    void startBackgroundPlayback() {
        Intent intent = new Intent(this, PlaybackService.class).setAction(PlaybackService.ACTION_START);
        androidx.core.content.ContextCompat.startForegroundService(this, intent);
    }

    void stopBackgroundPlayback() {
        stopService(new Intent(this, PlaybackService.class).setAction(PlaybackService.ACTION_STOP));
    }

    @Override
    public void onResume() {
        super.onResume();
        MobileUpdater.resumePendingInstall(this);
    }

    void checkForUpdate(String manifestUrls, boolean userInitiated) {
        MobileUpdater.check(this, manifestUrls, userInitiated);
    }

    String getAppVersionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception ignored) { return ""; }
    }
}

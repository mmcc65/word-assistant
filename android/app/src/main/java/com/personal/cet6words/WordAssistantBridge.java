package com.personal.cet6words;

import android.webkit.JavascriptInterface;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public final class WordAssistantBridge {
    private final MainActivity activity;

    WordAssistantBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void checkForUpdate(String manifestUrls, boolean userInitiated) {
        activity.runOnUiThread(() -> activity.checkForUpdate(manifestUrls, userInitiated));
    }

    @JavascriptInterface
    public String getAppVersion() {
        return activity.getAppVersionName();
    }

    @JavascriptInterface
    public void startBackgroundPlayback() {
        activity.startBackgroundPlayback();
    }

    @JavascriptInterface
    public void stopBackgroundPlayback() {
        activity.stopBackgroundPlayback();
    }

    @JavascriptInterface
    public void pickTextFile() {
        activity.chooseTextFile();
    }

    @JavascriptInterface
    public void downloadAudio(String address, String requestId) {
        new Thread(() -> {
            String dataUrl = readAudio(address);
            activity.runOnUiThread(() -> activity.deliverAudioResult(requestId, dataUrl));
        }, "offline-audio-download").start();
    }

    private String readAudio(String address) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(address);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return "";
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "WordAssistant/1.0 (offline audio pack)");
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return "";
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase().startsWith("audio/")) return "";
            int declaredSize = connection.getContentLength();
            if (declaredSize > 5 * 1024 * 1024) return "";
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    if (output.size() + length > 5 * 1024 * 1024) return "";
                    output.write(buffer, 0, length);
                }
            }
            if (output.size() < 256) return "";
            return "data:" + contentType.split(";")[0] + ";base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}

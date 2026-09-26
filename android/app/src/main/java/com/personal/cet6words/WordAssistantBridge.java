package com.personal.cet6words;

import android.webkit.JavascriptInterface;

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
}

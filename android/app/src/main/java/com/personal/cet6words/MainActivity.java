package com.personal.cet6words;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new WordAssistantBridge(this), "WordAssistantAndroid");
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

package com.smarttv.mediaplayer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Handler;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout settingsOverlay;
    private EditText ipInput;
    private String serverIp = "192.168.0.196";
    private static final int PORT = 3000;
    private static final String PREFS_NAME = "SmartTVPrefs";
    private static final String KEY_SERVER_IP = "server_ip";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        serverIp = prefs.getString(KEY_SERVER_IP, serverIp);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT));
        root.addView(webView);

        settingsOverlay = new FrameLayout(this);
        settingsOverlay.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        settingsOverlay.setBackgroundColor(0xCC000000);
        settingsOverlay.setVisibility(View.GONE);
        settingsOverlay.setFocusable(true);
        settingsOverlay.setFocusableInTouchMode(true);

        LinearLayout settingsLayout = new LinearLayout(this);
        settingsLayout.setOrientation(LinearLayout.VERTICAL);
        settingsLayout.setGravity(Gravity.CENTER);
        settingsLayout.setPadding(60, 40, 60, 40);

        TextView title = new TextView(this);
        title.setText("Configurar Servidor");
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 30);
        settingsLayout.addView(title);

        TextView label = new TextView(this);
        label.setText("IP do servidor:");
        label.setTextColor(0xFFAAAAAA);
        label.setTextSize(16);
        label.setPadding(0, 0, 0, 10);
        settingsLayout.addView(label);

        ipInput = new EditText(this);
        ipInput.setText(serverIp);
        ipInput.setTextColor(0xFFFFFFFF);
        ipInput.setTextSize(18);
        ipInput.setInputType(InputType.TYPE_CLASS_PHONE);
        ipInput.setSelectAllOnFocus(true);
        ipInput.setBackgroundResource(android.R.drawable.editbox_background);
        ipInput.setPadding(20, 20, 20, 20);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                500, LinearLayout.LayoutParams.WRAP_CONTENT);
        inputParams.setMargins(0, 0, 0, 30);
        ipInput.setLayoutParams(inputParams);
        settingsLayout.addView(ipInput);

        Button connectBtn = new Button(this);
        connectBtn.setText("Conectar");
        connectBtn.setTextSize(18);
        connectBtn.setPadding(40, 20, 40, 20);
        connectBtn.setOnClickListener(v -> connectToServer());
        settingsLayout.addView(connectBtn);

        Button cancelBtn = new Button(this);
        cancelBtn.setText("Cancelar");
        cancelBtn.setTextSize(16);
        cancelBtn.setPadding(40, 20, 40, 20);
        cancelBtn.setOnClickListener(v -> hideSettings());
        settingsLayout.addView(cancelBtn);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER;
        settingsLayout.setLayoutParams(lp);
        settingsOverlay.addView(settingsLayout);

        root.addView(settingsOverlay);
        setContentView(root);

        setupWebView();

        if (!prefs.contains(KEY_SERVER_IP)) {
            showSettings();
        } else {
            loadServer();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                hideSettings();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                if (progress == 100) {
                    webView.requestFocus();
                }
            }
        });

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
    }

    private void loadServer() {
        webView.loadUrl("http://" + serverIp + ":" + PORT);
    }

    private void connectToServer() {
        String ip = ipInput.getText().toString().trim();
        if (ip.isEmpty()) return;
        serverIp = ip;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_SERVER_IP, serverIp).apply();
        hideSettings();
        loadServer();
    }

    private void showSettings() {
        webView.setVisibility(View.GONE);
        settingsOverlay.setVisibility(View.VISIBLE);
        settingsOverlay.requestFocus();
        new Handler().postDelayed(() -> ipInput.requestFocus(), 100);
    }

    private void hideSettings() {
        settingsOverlay.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.requestFocus();
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_MENU) {
            showSettings();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (settingsOverlay.getVisibility() == View.VISIBLE) {
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                hideSettings();
                return true;
            }
            return super.onKeyDown(keyCode, event);
        }

        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showSettings();
            return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        if (settingsOverlay.getVisibility() == View.VISIBLE) {
            hideSettings();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
        }
    }
}

package com.lmchat.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {

    private HttpBridge httpBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        httpBridge = new HttpBridge();
        webView.addJavascriptInterface(httpBridge, "NativeHttpBridge");
    }

    private static class HttpBridge {
        @JavascriptInterface
        public String get(String urlString) {
            return httpRequest(urlString, "GET", null);
        }

        @JavascriptInterface
        public String post(String urlString, String body) {
            return httpRequest(urlString, "POST", body);
        }

        @JavascriptInterface
        public String delete(String urlString) {
            return httpRequest(urlString, "DELETE", null);
        }

        private String httpRequest(String urlString, String method, String body) {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlString);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod(method);
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(60000);

                if (body != null && !body.isEmpty()) {
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);
                    try (DataOutputStream dos = new DataOutputStream(conn.getOutputStream())) {
                        dos.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }

                int code = conn.getResponseCode();
                InputStream inputStream = (code >= 200 && code < 300)
                    ? conn.getInputStream()
                    : conn.getErrorStream();

                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line).append('\n');
                    }
                }
                return sb.toString();
            } catch (Exception e) {
                return "{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
    }
}
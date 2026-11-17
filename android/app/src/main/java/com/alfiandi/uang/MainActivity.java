package com.alfiandi.uang;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // File picker for JSON backup import
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback != null) {
                    Uri[] uris = null;
                    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                        Intent data = result.getData();
                        if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            uris = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                uris[i] = data.getClipData().getItemAt(i).getUri();
                            }
                        } else if (data.getData() != null) {
                            uris = new Uri[]{ data.getData() };
                        }
                    }
                    filePathCallback.onReceiveValue(uris);
                    filePathCallback = null;
                }
            }
        );

        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);

        setupStatusBar();
        setupWebView();
        setupBackNavigation();
    }

    private void setupStatusBar() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#F2EEE3"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Bridge to export backup JSON & CSV to Android Downloads
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("appassets.androidplatform.net".equals(url.getHost())) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, url);
                    startActivity(intent);
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                try {
                    Intent intent = fileChooserParams.createIntent();
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("*/*");
                    fileChooserLauncher.launch(Intent.createChooser(fallback, "Pilih berkas cadangan"));
                }
                return true;
            }
        });

        // Load root app via modern secure WebViewAssetLoader
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // If a modal/dialog is open, simulate Escape key to close it first
                webView.evaluateJavascript(
                    "(function() { " +
                    "  var modal = document.querySelector('.modal-overlay'); " +
                    "  if (modal) { " +
                    "    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); " +
                    "    return true; " +
                    "  } " +
                    "  return false; " +
                    "})()",
                    result -> {
                        if (!"true".equals(result)) {
                            if (webView.canGoBack()) {
                                webView.goBack();
                            } else {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                            }
                        }
                    }
                );
            }
        });
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void downloadFile(String filename, String content, String mimeType) {
            runOnUiThread(() -> {
                try {
                    saveFile(filename, content, mimeType);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Gagal menyimpan berkas: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private void saveFile(String filename, String content, String mimeType) {
        boolean success = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out != null) {
                        out.write(content.getBytes(StandardCharsets.UTF_8));
                        success = true;
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        } else {
            try {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadsDir.exists()) downloadsDir.mkdirs();
                File targetFile = new File(downloadsDir, filename);
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(content.getBytes(StandardCharsets.UTF_8));
                    success = true;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        if (success) {
            Toast.makeText(this, "Berkas disimpan di Unduhan: " + filename, Toast.LENGTH_LONG).show();
        } else {
            // Fallback: share sheet
            try {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType(mimeType);
                shareIntent.putExtra(Intent.EXTRA_TEXT, content);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
                startActivity(Intent.createChooser(shareIntent, "Simpan / Bagikan " + filename));
            } catch (Exception ignored) {
            }
        }
    }
}

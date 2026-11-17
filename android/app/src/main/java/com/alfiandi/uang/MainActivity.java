package com.alfiandi.uang;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
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

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<Intent> createDocumentLauncher;
    private PendingDownload pendingDownload;

    private static final class PendingDownload {
        final String filename;
        final String content;
        final String mimeType;

        PendingDownload(String filename, String content, String mimeType) {
            this.filename = filename;
            this.content = content;
            this.mimeType = mimeType;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // File picker untuk impor cadangan JSON.
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

        // Penyimpanan cadangan di Android 7–9 memakai SAF, tanpa izin storage.
        createDocumentLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                PendingDownload download = pendingDownload;
                pendingDownload = null;
                if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || download == null) {
                    return;
                }
                Uri uri = result.getData().getData();
                if (uri == null) return;
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("Tidak bisa membuka berkas tujuan.");
                    out.write(download.content.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "Berkas disimpan: " + download.filename, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Gagal menyimpan berkas: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        );

        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);

        setupStatusBar();
        setupWebView();
        setupBackNavigation();
    }

    private boolean isSystemDark() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void setupStatusBar() {
        applyNativeTheme(isSystemDark());
    }

    private void applyNativeTheme(boolean dark) {
        Window window = getWindow();
        int background = Color.parseColor(dark ? "#14120F" : "#F2EEE3");
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(background);
        window.setNavigationBarColor(background);

        View decor = window.getDecorView();
        int flags = decor.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            else flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Bridge untuk ekspor cadangan/CSV dan sinkronisasi warna status bar.
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

        // Aset lokal dimuat lewat origin https yang aman dan di-intercept.
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Kalau ada dialog, tutup dialog dulu lewat Escape.
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

    private String baseMimeType(String mimeType) {
        if (mimeType == null || mimeType.trim().isEmpty()) return "application/octet-stream";
        int semicolon = mimeType.indexOf(';');
        String base = semicolon >= 0 ? mimeType.substring(0, semicolon) : mimeType;
        return base.trim().isEmpty() ? "application/octet-stream" : base.trim();
    }

    private String safeFilename(String filename) {
        String name = filename == null ? "" : filename.trim();
        if (name.isEmpty()) name = "uang-export.txt";
        return name.replaceAll("[\\\\/:*?\"<>|]", "-");
    }

    private void handleDownload(String filename, String content, String mimeType) {
        String safeName = safeFilename(filename);
        String safeContent = content == null ? "" : content;
        String safeMime = baseMimeType(mimeType);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (!saveToDownloads(safeName, safeContent, safeMime)) {
                shareContent(safeName, safeContent, safeMime);
            }
            return;
        }

        // Android 7–9: pengguna memilih lokasi lewat sistem, tanpa izin storage.
        launchCreateDocument(safeName, safeContent, safeMime);
    }

    private boolean saveToDownloads(String filename, String content, String mimeType) {
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) return false;

            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) {
                    getContentResolver().delete(uri, null, null);
                    return false;
                }
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, done, null, null);
            Toast.makeText(this, "Berkas disimpan di Unduhan: " + filename, Toast.LENGTH_LONG).show();
            return true;
        } catch (Exception e) {
            if (uri != null) {
                try { getContentResolver().delete(uri, null, null); } catch (Exception ignored) { }
            }
            return false;
        }
    }

    private void launchCreateDocument(String filename, String content, String mimeType) {
        pendingDownload = new PendingDownload(filename, content, mimeType);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            createDocumentLauncher.launch(intent);
            Toast.makeText(this, "Pilih lokasi penyimpanan berkas.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            pendingDownload = null;
            shareContent(filename, content, mimeType);
        }
    }

    private void shareContent(String filename, String content, String mimeType) {
        try {
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
            shareIntent.putExtra(Intent.EXTRA_TEXT, content);
            startActivity(Intent.createChooser(shareIntent, "Simpan / Bagikan " + filename));
        } catch (Exception ignored) {
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void downloadFile(String filename, String content, String mimeType) {
            runOnUiThread(() -> handleDownload(filename, content, mimeType));
        }

        @JavascriptInterface
        public void setTheme(String theme) {
            runOnUiThread(() -> applyNativeTheme("dark".equals(theme)));
        }
    }
}

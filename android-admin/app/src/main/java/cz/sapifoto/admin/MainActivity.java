package cz.sapifoto.admin;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.WindowInsets;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;
import android.widget.Button;
import android.widget.EditText;
import android.text.InputType;
import android.util.Base64;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.ScrollView;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://www.sapifoto.cz/admin";
    private static final String HOST_MAIN = "www.sapifoto.cz";
    private static final String HOST_APEX = "sapifoto.cz";
    private static final int INK = Color.rgb(41, 35, 31);
    private static final int ACCENT = Color.rgb(164, 95, 32);
    private static final int BG = Color.rgb(250, 247, 243);
    private static final String KEY_ALIAS = "sapifoto_admin_password_key";
    private static final String PREFS = "secure_admin_credentials";
    private static final String PREF_IV = "password_iv";
    private static final String PREF_CIPHER = "password_ciphertext";

    private WebView webView;
    private ProgressBar progress;
    private FrameLayout root;
    private LinearLayout errorPanel;
    private TextView errorTitle;
    private TextView errorMessage;
    private LinearLayout homePanel;
    private LinearLayout webPanel;
    private TextView webSectionTitle;
    private String currentSection = "Správa focení";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildLayout();
        configureWebView();
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
            if (webView.getUrl() == null) loadHome();
        } else {
            loadHome();
        }
    }

    private void buildLayout() {
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        homePanel = new LinearLayout(this);
        homePanel.setOrientation(LinearLayout.VERTICAL);
        homePanel.setPadding(dp(20), dp(16), dp(20), dp(20));
        homePanel.setBackgroundColor(BG);
        ScrollView homeScroll = new ScrollView(this);
        homeScroll.setFillViewport(true);
        homeScroll.addView(homePanel);
        root.addView(homeScroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout brandRow = new LinearLayout(this);
        brandRow.setOrientation(LinearLayout.VERTICAL);
        brandRow.setPadding(dp(4), dp(10), dp(4), dp(22));
        homePanel.addView(brandRow);
        TextView brand = new TextView(this);
        brand.setText("ŠAPI FOTO");
        brand.setTextColor(INK);
        brand.setTextSize(28);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        brandRow.addView(brand);
        TextView subtitle = new TextView(this);
        subtitle.setText("ADMINISTRACE");
        subtitle.setTextColor(ACCENT);
        subtitle.setTextSize(12);
        subtitle.setLetterSpacing(0.14f);
        subtitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(4);
        brandRow.addView(subtitle, subtitleParams);
        TextView intro = new TextView(this);
        intro.setText("Co potřebujete právě vyřídit?");
        intro.setTextColor(INK);
        intro.setTextSize(17);
        intro.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams introParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        introParams.bottomMargin = dp(14);
        homePanel.addView(intro, introParams);

        addSectionCard(homePanel, "Objednávky", "Přehled objednávek podle soutěže, typu a úhrady", "🧾", Color.rgb(226, 230, 246));
        addSectionCard(homePanel, "Správa focení", "Přehled a správa fotografování", "📷", Color.rgb(244, 231, 216));
        addSectionCard(homePanel, "Odeslat fotografie", "Navázat na stávající odesílání", "✉", Color.rgb(225, 237, 229));
        addSectionCard(homePanel, "Upomínky", "Práce se stávajícími upomínkami", "🔔", Color.rgb(249, 235, 207));
        addSectionCard(homePanel, "QR platba", "Otevřít stávající platební funkce", "▦", Color.rgb(226, 230, 246));

        TextView note = new TextView(this);
        note.setText("Web a jeho stávající funkce zůstávají beze změny.");
        note.setTextColor(Color.rgb(112, 105, 98));
        note.setTextSize(12);
        note.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        noteParams.topMargin = dp(16);
        homePanel.addView(note, noteParams);

        webPanel = new LinearLayout(this);
        webPanel.setOrientation(LinearLayout.VERTICAL);
        webPanel.setBackgroundColor(BG);
        webPanel.setVisibility(View.GONE);
        root.addView(webPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), dp(4), dp(6), dp(4));
        toolbar.setBackgroundColor(Color.WHITE);
        webPanel.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(58)));

        Button backToSections = new Button(this);
        backToSections.setText("‹ Sekce");
        backToSections.setTextColor(ACCENT);
        backToSections.setAllCaps(false);
        backToSections.setMinWidth(0);
        backToSections.setPadding(dp(4), 0, dp(4), 0);
        backToSections.setOnClickListener(v -> showHome());
        toolbar.addView(backToSections, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        webSectionTitle = new TextView(this);
        webSectionTitle.setText(currentSection);
        webSectionTitle.setTextColor(INK);
        webSectionTitle.setTextSize(14);
        webSectionTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        webSectionTitle.setMaxLines(2);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        titleParams.leftMargin = dp(4);
        toolbar.addView(webSectionTitle, titleParams);

        Button refresh = new Button(this);
        refresh.setText("↻");
        refresh.setTextSize(19);
        refresh.setContentDescription("Obnovit");
        refresh.setTextColor(ACCENT);
        refresh.setAllCaps(false);
        refresh.setOnClickListener(v -> loadHomeOrReload());
        toolbar.addView(refresh, new LinearLayout.LayoutParams(dp(44), dp(44)));

        Button passwordButton = new Button(this);
        passwordButton.setText("Heslo");
        passwordButton.setTextColor(ACCENT);
        passwordButton.setAllCaps(false);
        passwordButton.setOnClickListener(v -> showPasswordOptions());
        toolbar.addView(passwordButton, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        webPanel.addView(progress, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        webView = new WebView(this);
        webPanel.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(24), dp(28), dp(24));
        errorPanel.setBackgroundColor(BG);
        errorPanel.setVisibility(View.GONE);
        errorTitle = new TextView(this);
        errorTitle.setText("Administraci se nepodařilo načíst");
        errorTitle.setTextColor(INK);
        errorTitle.setTextSize(20);
        errorTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        errorTitle.setGravity(Gravity.CENTER);
        errorPanel.addView(errorTitle, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        errorMessage = new TextView(this);
        errorMessage.setText("Zkontrolujte připojení k internetu a zkuste to znovu.");
        errorMessage.setTextColor(Color.DKGRAY);
        errorMessage.setTextSize(14);
        errorMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(10);
        errorPanel.addView(errorMessage, messageParams);
        Button retry = new Button(this);
        retry.setText("Zkusit znovu");
        retry.setAllCaps(false);
        retry.setTextColor(Color.WHITE);
        retry.setBackground(tintedButton());
        retry.setOnClickListener(v -> loadHome());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(48));
        retryParams.topMargin = dp(18);
        errorPanel.addView(retry, retryParams);
        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private void addSectionCard(LinearLayout parent, String title, String description,
                                String symbol, int iconBackground) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(14), dp(12), dp(12), dp(12));
        GradientDrawable cardBackground = new GradientDrawable();
        cardBackground.setColor(Color.WHITE);
        cardBackground.setCornerRadius(dp(16));
        cardBackground.setStroke(dp(1), Color.rgb(236, 230, 223));
        card.setBackground(cardBackground);
        card.setElevation(dp(2));
        card.setClickable(true);
        card.setFocusable(true);

        TextView icon = new TextView(this);
        icon.setText(symbol);
        icon.setTextSize(25);
        icon.setGravity(Gravity.CENTER);
        GradientDrawable iconShape = new GradientDrawable();
        iconShape.setColor(iconBackground);
        iconShape.setCornerRadius(dp(13));
        icon.setBackground(iconShape);
        card.addView(icon, new LinearLayout.LayoutParams(dp(54), dp(54)));

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams labelsParams = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        labelsParams.leftMargin = dp(14);
        labelsParams.rightMargin = dp(8);
        card.addView(labels, labelsParams);
        TextView heading = new TextView(this);
        heading.setText(title);
        heading.setTextColor(INK);
        heading.setTextSize(16);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        labels.addView(heading);
        TextView detail = new TextView(this);
        detail.setText(description);
        detail.setTextColor(Color.rgb(112, 105, 98));
        detail.setTextSize(12);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        detailParams.topMargin = dp(4);
        labels.addView(detail, detailParams);
        TextView arrow = new TextView(this);
        arrow.setText("›");
        arrow.setTextColor(ACCENT);
        arrow.setTextSize(30);
        card.addView(arrow);

        card.setOnClickListener(v -> openSection(title));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardParams.bottomMargin = dp(12);
        parent.addView(card, cardParams);
    }

    private void openSection(String section) {
        if ("Objednávky".equals(section)) {
            new AlertDialog.Builder(this)
                    .setTitle("Objednávky")
                    .setMessage("Návrh obrazovky je připraven. Pro bezpečné načtení všech objednávek je potřeba doplnit samostatnou čtecí akci do Google Apps Scriptu. Stávající akce pro upomínky vrací pouze neuhrazené objednávky, takže je nelze použít jako úplný přehled. Web ani stávající funkce nebudou měněny.")
                    .setPositiveButton("Rozumím", (dialog, which) -> {})
                    .show();
            return;
        }
        currentSection = section;
        webSectionTitle.setText(section);
        homePanel.setVisibility(View.GONE);
        webPanel.setVisibility(View.VISIBLE);
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        String targetUrl;
        switch (section) {
            case "Objednávky":
                targetUrl = HOME_URL;
                break;
            case "Správa focení":
                targetUrl = "https://www.sapifoto.cz/admin-foceni.html";
                break;
            case "Odeslat fotografie":
                targetUrl = "https://www.sapifoto.cz/admin-album.html";
                break;
            case "Upomínky":
                targetUrl = "https://www.sapifoto.cz/admin-upominky.html";
                break;
            case "QR platba":
                targetUrl = "https://www.sapifoto.cz/qrplatba.html";
                break;
            default:
                targetUrl = HOME_URL;
                break;
        }
        if (!targetUrl.equals(webView.getUrl())) webView.loadUrl(targetUrl);
        else webView.reload();
    }

    private void showHome() {
        webPanel.setVisibility(View.GONE);
        errorPanel.setVisibility(View.GONE);
        homePanel.setVisibility(View.VISIBLE);
    }

    private GradientDrawable tintedButton() {
        GradientDrawable d = new GradientDrawable();
        d.setColor(ACCENT);
        d.setCornerRadius(dp(10));
        return d;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " SapiFotoAdminAndroid/1.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if ("https".equalsIgnoreCase(scheme)
                        && (HOST_MAIN.equals(host) || HOST_APEX.equals(host))) {
                    return false;
                }
                if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
                    openExternal(uri);
                    return true;
                }
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    openExternal(uri);
                    return true;
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                errorPanel.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                errorPanel.setVisibility(View.GONE);
                if (isTrustedAdminUrl(url)) autofillSavedPassword();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showLoadError();
            }
        });
    }


    private boolean isTrustedAdminUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            return "https".equalsIgnoreCase(uri.getScheme())
                    && (HOST_MAIN.equals(host) || HOST_APEX.equals(host));
        } catch (Exception ignored) {
            return false;
        }
    }

    private void showPasswordOptions() {
        String[] options = {"Zapamatovat heslo z aktuální stránky", "Zadat nebo změnit uložené heslo", "Smazat uložené heslo"};
        new AlertDialog.Builder(this).setTitle("Uložení admin hesla")
                .setItems(options, (dialog, which) -> {
                    if (which == 0) savePasswordFromCurrentPage();
                    else if (which == 1) promptForPassword();
                    else if (which == 2) {
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
                        showPasswordMessage("Uložené heslo bylo smazáno.");
                    }
                }).setNegativeButton("Zrušit", null).show();
    }

    private void savePasswordFromCurrentPage() {
        if (webView == null || !isTrustedAdminUrl(webView.getUrl())) {
            showPasswordMessage("Otevři nejprve stránku administrace s polem pro heslo.");
            return;
        }
        String js = "(function(){var e=document.querySelector('input[type=password]');return JSON.stringify(e ? e.value : '');})()";
        webView.evaluateJavascript(js, value -> {
            try {
                Object parsed = new JSONTokener(value).nextValue();
                String password = parsed instanceof String ? (String) parsed : "";
                if (password.trim().isEmpty()) {
                    showPasswordMessage("Na aktuální stránce není vyplněné heslo. Nejprve ho zadej do formuláře.");
                    return;
                }
                encryptAndStorePassword(password);
                showPasswordMessage("Heslo je bezpečně uloženo v tomto zařízení a bude se předvyplňovat v administraci.");
            } catch (Exception e) {
                showPasswordMessage("Heslo se nepodařilo uložit. Zkus zadání ručně přes nabídku Heslo.");
            }
        });
    }

    private void promptForPassword() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setHint("Administrační heslo");
        int padding = dp(20);
        input.setPadding(padding, dp(12), padding, dp(12));
        new AlertDialog.Builder(this).setTitle("Zapamatovat admin heslo")
                .setMessage("Heslo bude zašifrované uložené pouze v tomto zařízení.")
                .setView(input)
                .setPositiveButton("Uložit", (dialog, which) -> {
                    String password = input.getText().toString();
                    if (password.isEmpty()) showPasswordMessage("Prázdné heslo nelze uložit.");
                    else {
                        try {
                            encryptAndStorePassword(password);
                            autofillSavedPassword();
                            showPasswordMessage("Heslo je bezpečně uloženo.");
                        } catch (Exception e) {
                            showPasswordMessage("Heslo se nepodařilo bezpečně uložit.");
                        }
                    }
                }).setNegativeButton("Zrušit", null).show();
    }

    private void showPasswordMessage(String message) {
        new AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK", null).show();
    }

    private void encryptAndStorePassword(String password) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
        byte[] encrypted = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(PREF_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(PREF_CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply();
    }

    private String decryptStoredPassword() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String ivText = prefs.getString(PREF_IV, null);
            String cipherText = prefs.getString(PREF_CIPHER, null);
            if (ivText == null || cipherText == null) return null;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(),
                    new GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(cipherText, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private void autofillSavedPassword() {
        String password = decryptStoredPassword();
        if (password == null || webView == null || !isTrustedAdminUrl(webView.getUrl())) return;
        String encoded = org.json.JSONObject.quote(password);
        String js = "(function(){var p=" + encoded + ";var fields=document.querySelectorAll('input[type=password]');"
                + "fields.forEach(function(e){if(!e.value){e.value=p;"
                + "e.dispatchEvent(new Event('input',{bubbles:true}));"
                + "e.dispatchEvent(new Event('change',{bubbles:true}));}});})()";
        webView.evaluateJavascript(js, null);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // Leave the app stable if no compatible external handler is installed.
        }
    }

    private void loadHomeOrReload() {
        if (webView.getUrl() == null) loadHome();
        else {
            errorPanel.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.reload();
        }
    }

    private void loadHome() {
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(HOME_URL);
    }

    private void showLoadError() {
        if (!hasInternet()) {
            errorTitle.setText("Jste offline");
            errorMessage.setText("Připojte se k internetu a zkuste načtení zopakovat.");
        } else {
            errorTitle.setText("Administraci se nepodařilo načíst");
            errorMessage.setText("Server neodpovídá nebo je dočasně nedostupný. Zkuste to znovu.");
        }
        webView.setVisibility(View.GONE);
        progress.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private boolean hasInternet() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            Network network = cm == null ? null : cm.getActiveNetwork();
            NetworkCapabilities caps = network == null ? null : cm.getNetworkCapabilities(network);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return false;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webPanel != null && webPanel.getVisibility() == View.VISIBLE) {
            if (webView != null && webView.canGoBack()) webView.goBack();
            else showHome();
        } else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}

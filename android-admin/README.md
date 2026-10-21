# ŠAPI Foto Admin for Android

Android client wrapper for the existing ŠAPI Foto administration at https://www.sapifoto.cz/admin.

## Design principles

- The website remains the source of truth; this app does not replace Google Apps Script or Google Sheets.
- Existing admin forms and workflows continue to run on the site.
- JavaScript, DOM storage and cookies are enabled for the current web app.
- Only HTTPS pages on sapifoto.cz stay inside the app. Other links open in the system browser.
- SSL errors are rejected; no cleartext HTTP traffic is allowed.
- The app requires an internet connection.

## Build

Requires JDK 17, Android SDK platform 35 and Gradle 8.9 or compatible.

```sh
cd android-admin
gradle --no-daemon assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

The debug build uses application ID `cz.sapifoto.admin.debug`. It is suitable for internal installation/testing; a production Play Store build should use a managed signing key.

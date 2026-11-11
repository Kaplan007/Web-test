# Interní test APK

1. V GitHub otevřít **Actions → ŠAPI Foto Admin Android APK**.
2. Po dokončení úspěšného běhu otevřít artefakt `sapi-foto-admin-android-debug`.
3. Stáhnout ZIP, rozbalit `app-debug.apk` a přenést APK do telefonu.
4. Povolit instalaci z použitého zdroje, nainstalovat aplikaci a otevřít **ŠAPI Foto Admin**.
5. Ověřit přihlášení a administrativní úkony ve stávajícím webu.

Tato debug APK má aplikační ID `cz.sapifoto.admin.debug`, takže může být nainstalována souběžně s budoucí podepsanou verzí produkční aplikace.

Aplikace pro fungování potřebuje internetové připojení; provozní data dál zpracovává existující web a jeho backend.

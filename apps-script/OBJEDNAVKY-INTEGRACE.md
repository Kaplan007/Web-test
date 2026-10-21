# ŠAPI FOTO – doplněk Přehled objednávek

Tento doplněk je záměrně oddělený od stávajícího Apps Scriptu. Nemění `handleOrder`, `handleSendAlbumMail`, `handleRemindersLoad`, `handleRemindersSend` ani žádnou existující funkci. Čtení objednávek je pouze čtecí operace; změna úhrady zapisuje výhradně do sloupce Y.

## Bezpečné zapojení do existujícího Apps Scriptu

1. Vytvoř zálohu aktuálního projektu Apps Script (Projekt → Vytvořit kopii nebo export zdrojového kódu).
2. Přidej obsah souboru `objednavky-admin-addon.gs` jako nový soubor do **stejného** Apps Script projektu, který používá současný web.
3. V existující funkci `doPost(e)`, hned pod řádek `const action = clean(e.parameter.action);`, přidej tyto nové větve:
   ```javascript
   if (action === "adminOrdersLoad") return handleAdminOrdersLoad_(e.parameter);
   if (action === "adminOrdersPaid") return handleAdminOrdersPaid_(e.parameter);
   if (action === "adminAlbumUrlsLoad") return handleAdminAlbumUrlsLoad_(e.parameter);
   ```
4. V existující funkci `doGet(e)`, hned pod určení `action`, přidej obě větve:
   ```javascript
   if (action === "getAdminOrdersStatus") return getAdminOrdersStatus_(params);
   if (action === "getAdminAlbumUrlsStatus") return getAdminAlbumUrlsStatus_(params);
   ```
5. Ostatní řádky ponech beze změny. Ulož a otestuj nejprve na kopii tabulky. Teprve po úspěšném testu aktualizuj existující nasazení jako novou verzi.

## Přenos dat a ochranné kontroly

- Zdroj je existující list `Objednávky` ve stávající tabulce.
- Soutěž A, číslo objednávky J, položky W, cena X, zaplaceno Y, poznámka Z a upomínka AA.
- Více položek objednávky se čte z JSON ve W. Při odesílání fotografií se odkazy načítají z T pro všechny řádky se stejným číslem objednávky v J. Odkazy se přiřazují v pořadí řádků a položek; pokud počet nesouhlasí, odeslání se zablokuje.
- Načítání nic nepřepisuje.
- Úhrada se mění pouze v Y a jen pokud číslo objednávky odpovídá právě jednomu řádku.
- Je vyžadováno stávající administrační heslo z Script Properties `ADMIN_PASSWORD`.

## Stav integrace

Toto je pouze doplněk serverových funkcí. Sám o sobě nezpřístupní novou obrazovku v APK ani se automaticky nenasadí do Google Apps Scriptu. Androidová obrazovka musí volat tyto akce až po přidání větví a aktualizaci existujícího nasazení. Stávající webové funkce tím zůstávají nedotčené.

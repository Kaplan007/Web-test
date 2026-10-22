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

## Důležitá kontrola před nasazením – více řádků jedné objednávky

Původní funkce `getAlbumOrderData(orderNumber)` používá `findOrderByOrderNumber(...)`, která vrací pouze první řádek s daným číslem objednávky. Samotné připojení nových větví `doPost`/`doGet` proto nestačí pro objednávku, jejíž položky jsou rozložené do více řádků.

Před nasazením je nutné upravit a otestovat také načítání i odesílání alba tak, aby:
- našlo **všechny** řádky se stejným číslem objednávky ve sloupci J;
- sestavilo položky ve stejném pořadí jako odpovídající URL ve sloupci T;
- načetlo rodiče a e-mail z řádku objednávky a bezpečně ověřilo, že se údaje mezi řádky nerozcházejí;
- po odeslání aktualizovalo stav odeslání konzistentně u všech příslušných řádků, aniž by přepsalo nesouvisející objednávky;
- zachovalo původní logování a zapsalo `ANO` až po úspěšném odeslání e-mailu.

**Zatím nenasazovat do ostrého provozu.** Odkazy se nyní načítají přes samostatný doplněk, ale plný scénář víceřádkové objednávky není ověřený. Nejprve je třeba integrovat uvedené změny do původního Apps Scriptu a vyzkoušet je na kopii tabulky. Tento doplněk sám o sobě nezpřístupní novou obrazovku v APK ani se automaticky nenasadí do Google Apps Scriptu.

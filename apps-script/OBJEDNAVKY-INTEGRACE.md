# ŠAPI FOTO – doplněk Přehled objednávek

Tento doplněk přidává nové obslužné funkce vedle stávajícího Apps Scriptu. Nevyžaduje přepsání původních funkcí handleOrder, handleSendAlbumMail ani připomínek. Nové odesílání alba používá samostatnou funkci handleAdminAlbumMailSend_, která aktualizuje všechny řádky patřící do objednávky až po úspěšném odeslání e-mailu.

## Bezpečné zapojení do existujícího Apps Scriptu

1. Vytvoř zálohu aktuálního projektu Apps Script (Projekt → Vytvořit kopii nebo export zdrojového kódu).
2. Přidej obsah souboru `objednavky-admin-addon.gs` jako nový soubor do **stejného** Apps Script projektu, který používá současný web.
3. V existující funkci `doPost(e)`, hned pod řádek `const action = clean(e.parameter.action);`, přidej tyto nové větve:
   ```javascript
   if (action === "adminOrdersLoad") return handleAdminOrdersLoad_(e.parameter);
   if (action === "adminOrdersPaid") return handleAdminOrdersPaid_(e.parameter);
   if (action === "adminAlbumUrlsLoad") return handleAdminAlbumUrlsLoad_(e.parameter);
   if (action === "adminAlbumMailSend") return handleAdminAlbumMailSend_(e.parameter);
   ```
4. V existující funkci `doGet(e)`, hned pod určení `action`, přidej obě větve:
   ```javascript
   if (action === "getAdminOrdersStatus") return getAdminOrdersStatus_(params);
   if (action === "getAdminAlbumUrlsStatus") return getAdminAlbumUrlsStatus_(params);
   if (action === "getAdminAlbumMailStatus") return getAdminAlbumMailStatus_(params);
   ```
5. Ostatní řádky ponech beze změny. Ulož a otestuj nejprve na kopii tabulky. Teprve po úspěšném testu aktualizuj existující nasazení jako novou verzi.

## Přenos dat a ochranné kontroly

- Zdroj je existující list `Objednávky` ve stávající tabulce.
- Soutěž A, číslo objednávky J, položky W, cena X, zaplaceno Y, poznámka Z a upomínka AA.
- Více položek objednávky se čte z JSON ve W. Při odesílání fotografií se odkazy načítají z T pro všechny řádky se stejným číslem objednávky v J. Odkazy se přiřazují v pořadí řádků a položek; pokud počet nesouhlasí, odeslání se zablokuje.
- Načítání nic nepřepisuje.
- Úhrada se mění pouze v Y a jen pokud číslo objednávky odpovídá právě jednomu řádku.
- Je vyžadováno stávající administrační heslo z Script Properties `ADMIN_PASSWORD`.

## Víceřádkové objednávky a přiřazení URL

Nové akce načítají všechny řádky se stejným číslem objednávky ve sloupci J. Každý řádek zpracují v pořadí listu a jeho položky ve W v pořadí JSON. Sloupec T poskytne URL pro jednořádkovou položku; u řádku s více položkami doplní URL první položky, pokud už není uložená ve W. **Jedna URL ze sloupce T se nikdy nekopíruje do všech položek.** Pokud v tabulce pro další položky URL chybí, formulář je nechá prázdné k ručnímu doplnění a HTML validace nedovolí odeslat neúplný e-mail.

Nová akce adminAlbumMailSend:
- znovu načte všechny řádky objednávky a ověří shodu jména rodiče a e-mailu;
- ověří počet URL a jejich HTTPS formát;
- zapíše URL a JSON položek do příslušných řádků, nikoli do jiné objednávky;
- zapíše stav ANO do sloupce U u všech řádků až po úspěšném odeslání e-mailu;
- zachová logování e-mailu a stav chyby, pokud odeslání selže.

## Nasazení a test

**Zatím nenasazovat do ostrého provozu.** Tento repozitář neumožňuje přímo publikovat Google Apps Script. Před nasazením je nutné:
1. Vytvořit zálohu existujícího Apps Scriptu.
2. Přidat obsah apps-script/objednavky-admin-addon.gs do stejného Apps Script projektu.
3. Doplnit výše uvedené větve do existujících doPost(e) a doGet(e); žádné existující větve neodstraňovat.
4. Otestovat na kopii tabulky: jednu položku, více položek v jednom řádku W, více řádků se stejným číslem objednávky, chybějící URL, nesouhlasící e-maily a neúspěšné odeslání. Pro testovací e-mail použít kontrolovanou adresu.
5. Teprve po úspěšném testu nasadit novou verzi webové aplikace Apps Script.

Toto doplnění samo o sobě nezmění živý Apps Script, dokud nebude vloženo a publikováno.

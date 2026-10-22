/**
 * ŠAPI FOTO – doplněk pro přehled objednávek v admin aplikaci.
 *
 * BEZPEČNOSTNÍ ZÁSADA:
 * Tento soubor je pouze doplněk. Nenahrazuje ani neupravuje existující funkce.
 * V existujícím doPost(e) přidej samostatnou větev:
 *   if (action === "adminOrdersLoad") return handleAdminOrdersLoad_(e.parameter);
 *   if (action === "adminOrdersPaid") return handleAdminOrdersPaid_(e.parameter);
 * V existujícím doGet(e) přidej:
 *   if (action === "getAdminOrdersStatus") return getAdminOrdersStatus_(params);
 *
 * Používá stávající konstanty/funkce: ADMIN_PASSWORD, clean, verifyAlbumAdminPassword,
 * getOrderSheet, validateRequestId, setRequestStatus, getRequestStatus, jsonResponse,
 * jsonpResponse. Nic z nich nepřepisuje.
 */

function handleAdminOrdersLoad_(data) {
  var requestId;
  try {
    verifyAlbumAdminPassword(data.password);
    requestId = validateRequestId(data.request_id);
    setRequestStatus("DN_ADMIN_ORDERS", requestId, {
      state: "PROCESSING",
      ok: false,
      message: "Načítám objednávky."
    });

    var sheet = getOrderSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      setRequestStatus("DN_ADMIN_ORDERS", requestId, {
        state: "DONE", ok: true, competitions: [], orders: []
      });
      return jsonResponse({ status: "OK", message: "Přehled objednávek je připraven." });
    }

    // Čteme data pouze; žádné buňky objednávek se při načítání nemění.
    var rows = sheet.getRange(2, 1, lastRow - 1, Math.max(27, sheet.getLastColumn())).getDisplayValues();
    var competitions = {};
    var orders = rows.map(function (r, i) {
      var competition = String(r[0] || "").trim();
      if (competition) competitions[competition] = true;
      var items = [];
      try {
        var parsed = JSON.parse(String(r[22] || "[]"));
        if (Array.isArray(parsed)) items = parsed.map(function (item) {
          return {
            name: String((item && (item.name || item.title || item.type || (Array.isArray(item.dancers) ? item.dancers.join(" + ") : ""))) || ""),
            category: String((item && item.category) || ""),
            type: String((item && item.type) || ""),
            dancers: item && Array.isArray(item.dancers) ? item.dancers : [],
            albumUrl: String((item && item.albumUrl) || "")
          };
        });
      } catch (ignore) {}

      var total = adminOrdersMoney_(r[23]);
      var paid = adminOrdersMoney_(r[24]);
      return {
        rowNumber: i + 2,
        competition: competition,
        parentName: String(r[1] || ""),
        phone: String(r[2] || ""),
        email: String(r[3] || ""),
        type: String(r[4] || ""),
        soloName: String(r[5] || ""),
        duoNames: String(r[6] || ""),
        category: String(r[7] || ""),
        note: String(r[8] || ""),
        orderNumber: String(r[9] || ""),
        createdAt: String(r[10] || ""),
        status: String(r[11] || ""),
        albumUrl: String(r[19] || ""),
        sent: String(r[20] || ""),
        itemCount: Number(r[21] || items.length || 0),
        items: items,
        totalPrice: total,
        paidAmount: paid,
        internalNote: String(r[25] || ""),
        reminder: String(r[26] || "")
      };
    }).filter(function (o) {
      return o.competition || o.orderNumber || o.parentName || o.email;
    });

    setRequestStatus("DN_ADMIN_ORDERS", requestId, {
      state: "DONE",
      ok: true,
      competitions: Object.keys(competitions).sort(),
      orders: orders
    });
    return jsonResponse({ status: "OK", message: "Přehled objednávek je připraven." });
  } catch (error) {
    var message = safeErrorText(error);
    if (requestId) setRequestStatus("DN_ADMIN_ORDERS", requestId, {
      state: "DONE", ok: false, message: message
    });
    return jsonResponse({ status: "ERROR", message: message });
  }
}

function getAdminOrdersStatus_(params) {
  try {
    var requestId = validateRequestId(params.requestId || params.request_id);
    var status = getRequestStatus("DN_ADMIN_ORDERS", requestId) || { state: "UNKNOWN" };
    return jsonpResponse({ status: "OK", requestStatus: status }, params.callback);
  } catch (error) {
    return jsonpResponse({ status: "ERROR", message: safeErrorText(error) }, params.callback);
  }
}

function handleAdminOrdersPaid_(data) {
  var requestId = "";
  try {
    verifyAlbumAdminPassword(data.password);
    requestId = validateRequestId(data.request_id);
    var orderNumber = String(data.order_number || "").trim();
    if (!/^\d{1,10}$/.test(orderNumber)) throw new Error("Neplatné číslo objednávky.");

    var rawAmount = String(data.paid_amount == null ? "" : data.paid_amount).trim().replace(",", ".");
    if (!rawAmount || !/^\d+(\.\d{1,2})?$/.test(rawAmount)) {
      throw new Error("Zadejte zaplacenou částku v Kč.");
    }
    var amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) {
      throw new Error("Zaplacená částka je mimo povolený rozsah.");
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var sheet = getOrderSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) throw new Error("Tabulka neobsahuje žádné objednávky.");
      var values = sheet.getRange(2, 10, lastRow - 1, 1).getDisplayValues();
      var matches = [];
      values.forEach(function (row, index) {
        if (String(row[0]).trim() === orderNumber) matches.push(index + 2);
      });
      if (matches.length === 0) throw new Error("Objednávka č. " + orderNumber + " nebyla nalezena.");
      if (matches.length > 1) throw new Error("Číslo objednávky není v tabulce jednoznačné; úhrada nebyla změněna.");
      // Sloupec Y = 25. Mění se pouze pole Zaplaceno u nalezeného řádku.
      sheet.getRange(matches[0], 25).setValue(amount);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    setRequestStatus("DN_ADMIN_ORDERS_PAID", requestId, {
      state: "DONE", ok: true, orderNumber: orderNumber, paidAmount: amount,
      message: "Zaplacená částka byla aktualizována."
    });
    return jsonResponse({ status: "OK", message: "Zaplacená částka byla aktualizována." });
  } catch (error) {
    var message = safeErrorText(error);
    if (requestId) setRequestStatus("DN_ADMIN_ORDERS_PAID", requestId, {
      state: "DONE", ok: false, message: message
    });
    return jsonResponse({ status: "ERROR", message: message });
  }
}

function adminOrdersMoney_(value) {
  var text = String(value == null ? "" : value).trim().replace(/[^0-9,.-]/g, "").replace(",", ".");
  var number = Number(text);
  return Number.isFinite(number) ? number : 0;
}


/**
 * Read album URLs and item details across every row sharing the order number.
 * Column T is authoritative for a single-item row. For a row storing several
 * items in W, existing per-item URLs in W are retained; T supplies the first
 * item's URL only if that item has no URL. A single T URL is never duplicated
 * across several items.
 */
function handleAdminAlbumUrlsLoad_(data) {
  var requestId = "";
  try {
    verifyAlbumAdminPassword(data.password);
    requestId = validateRequestId(data.request_id);
    var orderNumber = String(data.order_number || "").trim();
    if (!/^\d{1,10}$/.test(orderNumber)) throw new Error("Neplatné číslo objednávky.");

    var order = adminAlbumGetOrderMultiRow_(orderNumber);
    var items = [];
    order.groups.forEach(function (group) {
      group.items.forEach(function (item) { items.push(item); });
    });

    var urls = items.map(function (item, index) {
      return { index: index, albumUrl: String(item.albumUrl || "") };
    });
    setRequestStatus("DN_ADMIN_ALBUM_URLS", requestId, {
      state: "DONE", ok: true, orderNumber: orderNumber,
      parentName: order.parentName, email: order.email,
      alreadySent: order.alreadySent, totalPrice: items.length * PRICE_PER_ITEM,
      items: items, urls: urls,
      message: "Položky a odkazy na alba byly načteny."
    });
    return jsonResponse({ status: "OK", message: "Položky a odkazy na alba byly načteny." });
  } catch (error) {
    var message = safeErrorText(error);
    if (requestId) setRequestStatus("DN_ADMIN_ALBUM_URLS", requestId, {
      state: "DONE", ok: false, message: message
    });
    return jsonResponse({ status: "ERROR", message: message });
  }
}

function getAdminAlbumUrlsStatus_(params) {
  try {
    var requestId = validateRequestId(params.requestId || params.request_id);
    var status = getRequestStatus("DN_ADMIN_ALBUM_URLS", requestId) || { state: "UNKNOWN" };
    return jsonpResponse({ status: "OK", requestStatus: status }, params.callback);
  } catch (error) {
    return jsonpResponse({ status: "ERROR", message: safeErrorText(error) }, params.callback);
  }
}

/**
 * Load a logical order even when legacy/manual data uses several rows with
 * the same order number. Each physical row remains the owner of its items.
 */
function adminAlbumGetOrderMultiRow_(orderNumber) {
  var sheet = getOrderSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Tabulka neobsahuje žádné objednávky.");

  var rows = sheet.getRange(2, 1, lastRow - 1, DN_COLUMNS.TOTAL_PRICE).getDisplayValues();
  var groups = [];
  var parentName = "";
  var email = "";
  var alreadySent = false;

  rows.forEach(function (row, index) {
    if (String(row[DN_COLUMNS.ORDER_NUMBER - 1] || "").trim() !== orderNumber) return;
    var rowNumber = index + 2;
    var currentParent = String(row[DN_COLUMNS.PARENT_NAME - 1] || "").trim();
    var currentEmail = String(row[DN_COLUMNS.EMAIL - 1] || "").trim();
    if (!parentName) parentName = currentParent;
    if (!email) email = currentEmail;
    if (currentParent && parentName && currentParent !== parentName) {
      throw new Error("Jméno rodiče se mezi řádky objednávky liší. Odesílání je zablokováno.");
    }
    if (currentEmail && email && currentEmail.toLowerCase() !== email.toLowerCase()) {
      throw new Error("E-mail se mezi řádky objednávky liší. Odesílání je zablokováno.");
    }
    if (String(row[DN_COLUMNS.ALBUM_SENT - 1] || "").trim().toUpperCase() === "ANO") alreadySent = true;

    var rowAlbumUrl = String(row[DN_COLUMNS.ALBUM_URL - 1] || "").trim();
    try {
      var rich = sheet.getRange(rowNumber, DN_COLUMNS.ALBUM_URL).getRichTextValue();
      if (rich && rich.getLinkUrl()) rowAlbumUrl = String(rich.getLinkUrl()).trim();
    } catch (ignore) {}

    var rowItems;
    try {
      rowItems = getStoredOrderItems(row, "");
    } catch (error) {
      throw new Error("Řádek " + rowNumber + " objednávky " + orderNumber + ": " + safeErrorText(error));
    }
    if (!rowItems.length) throw new Error("V řádku " + rowNumber + " nebyly nalezeny položky.");

    if (rowItems.length === 1) {
      if (rowAlbumUrl) rowItems[0].albumUrl = rowAlbumUrl;
    } else if (rowAlbumUrl && !rowItems[0].albumUrl) {
      // T stores one URL per row, so it can safely fill only the first item.
      rowItems[0].albumUrl = rowAlbumUrl;
    }

    groups.push({ rowNumber: rowNumber, items: rowItems });
  });

  if (!groups.length) throw new Error("Objednávka číslo " + orderNumber + " nebyla v tabulce nalezena.");
  if (!parentName) throw new Error("V objednávce chybí jméno rodiče.");
  if (!email) throw new Error("V objednávce chybí e-mail.");
  email = validateEmail(email);

  return {
    sheet: sheet,
    orderNumber: orderNumber,
    parentName: parentName,
    email: email,
    groups: groups,
    alreadySent: alreadySent
  };
}

/**
 * Multi-row-safe album sender. It writes each URL back to the physical row
 * that owns the corresponding item and marks all matching rows sent only
 * after MailApp.sendEmail succeeds.
 */
function handleAdminAlbumMailSend_(data) {
  var requestId = "";
  var logRow = 0;
  try {
    requestId = validateRequestId(data.request_id);
  } catch (error) {
    return jsonResponse({ status: "ERROR", message: error.message });
  }

  setRequestStatus("DN_ADMIN_ALBUM_MAIL", requestId, {
    state: "PROCESSING", ok: false, message: "E-mail se připravuje."
  });

  try {
    enforceAdminAttemptLimit();
    verifyAlbumAdminPassword(data.password);
    var orderNumber = String(data.order_number || "").trim();
    if (!/^\d{1,10}$/.test(orderNumber)) throw new Error("Neplatné číslo objednávky.");

    var order = adminAlbumGetOrderMultiRow_(orderNumber);
    var items = [];
    order.groups.forEach(function (group) {
      group.items.forEach(function (item) { items.push(item); });
    });
    var albumInputs = parseAdminAlbumUrls(data.albums_json, items.length);
    var cursor = 0;
    order.groups.forEach(function (group) {
      group.items = group.items.map(function (item) {
        return {
          type: item.type,
          category: item.category,
          dancers: item.dancers.slice(),
          price: PRICE_PER_ITEM,
          albumUrl: albumInputs[cursor++]
        };
      });
    });
    items = [];
    order.groups.forEach(function (group) {
      group.items.forEach(function (item) { items.push(item); });
    });

    var totalPrice = items.length * PRICE_PER_ITEM;
    var firstAlbumUrl = items[0].albumUrl;

    // Persist URL + item details per physical row before sending, as the
    // existing sender does. The sent flag remains unchanged until success.
    order.groups.forEach(function (group) {
      var groupJson = JSON.stringify(group.items);
      order.sheet.getRange(group.rowNumber, DN_COLUMNS.ALBUM_URL).setValue(safeSheetText(group.items[0].albumUrl));
      order.sheet.getRange(group.rowNumber, DN_COLUMNS.ITEM_COUNT).setValue(group.items.length);
      order.sheet.getRange(group.rowNumber, DN_COLUMNS.ITEMS_JSON).setValue(safeSheetText(groupJson));
      order.sheet.getRange(group.rowNumber, DN_COLUMNS.TOTAL_PRICE).setValue(group.items.length * PRICE_PER_ITEM);
    });
    SpreadsheetApp.flush();

    var logSheet = getAlbumMailLogSheet();
    logSheet.appendRow([
      new Date(),
      safeSheetText(order.email),
      safeSheetText(items.map(function (item) { return item.albumUrl; }).join("\n")),
      safeSheetText(order.orderNumber),
      totalPrice,
      "PŘIPRAVUJE SE",
      requestId
    ]);
    logRow = logSheet.getLastRow();
    SpreadsheetApp.flush();

    var spd = buildPaymentSpd(order.orderNumber, totalPrice);
    var qrBlob = generatePaymentQrBlob(spd);
    var subject = "Objednávka číslo " + order.orderNumber + " – fotografie Dance Nation";
    var plainBody = buildAlbumMailPlainBody(order.orderNumber, items, totalPrice);
    var htmlBody = buildAlbumMailHtmlBody(order.orderNumber, items, totalPrice);

    MailApp.sendEmail({
      to: order.email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      inlineImages: { paymentQr: qrBlob },
      replyTo: MUJ_EMAIL,
      name: "ŠAPI Foto"
    });

    order.groups.forEach(function (group) {
      order.sheet.getRange(group.rowNumber, DN_COLUMNS.ALBUM_SENT).setValue("ANO");
    });
    SpreadsheetApp.flush();
    if (logRow) logSheet.getRange(logRow, 6).setValue("ODESLÁNO");

    var result = {
      state: "DONE", ok: true, email: order.email,
      vs: order.orderNumber, orderNumber: orderNumber,
      totalPrice: totalPrice, itemCount: items.length,
      message: "E-mail byl odeslán a stav odeslání byl zapsán u všech řádků objednávky."
    };
    setRequestStatus("DN_ADMIN_ALBUM_MAIL", requestId, result);
    return jsonResponse({ status: "OK", message: result.message });
  } catch (error) {
    var message = error && error.message ? error.message : "E-mail se nepodařilo odeslat.";
    try {
      if (logRow) getAlbumMailLogSheet().getRange(logRow, 6).setValue("CHYBA: " + safeErrorText(error));
    } catch (ignore) {}
    setRequestStatus("DN_ADMIN_ALBUM_MAIL", requestId, {
      state: "DONE", ok: false, message: message
    });
    console.error("ALBUM MAIL MULTI-ROW CHYBA: " + (error.stack || error));
    return jsonResponse({ status: "ERROR", message: message });
  }
}

function getAdminAlbumMailStatus_(params) {
  try {
    var requestId = validateRequestId(params.requestId || params.request_id);
    var status = getRequestStatus("DN_ADMIN_ALBUM_MAIL", requestId) || { state: "UNKNOWN" };
    return jsonpResponse({ status: "OK", requestStatus: status }, params.callback);
  } catch (error) {
    return jsonpResponse({ status: "ERROR", message: safeErrorText(error) }, params.callback);
  }
}

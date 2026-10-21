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
            name: String((item && (item.name || item.title || item.category)) || ""),
            category: String((item && item.category) || ""),
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
  var text = String(value == null ? "" : value).trim().replace(/\s/g, "").replace(",", ".");
  var number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

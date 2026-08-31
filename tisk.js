document.addEventListener('DOMContentLoaded', function () {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzP5ID3j0Tmesovdu057cae961VL0AC8Y585kBUqX4g-JDpX9rs-DmOVR3Jix3W6HA/exec';
  const PAYMENT_IBAN = 'CZ9203000000000332726377';

  const prices = {
    '10x15 lesk': 10,
    '10x15 polomat': 10,
    '13x18 lesk': 15,
    '13x18 polomat': 15,
    'A4 lesk': 45,
    'A4 polomat': 45
  };

  const form = document.getElementById('orderForm');
  const tbody = document.querySelector('#orderTable tbody');
  const summaryDiv = document.getElementById('summaryByFormat');
  const totalPriceEl = document.getElementById('totalPrice');
  const submitBtn = document.getElementById('submitBtn');
  const errorBox = document.getElementById('printError');
  const confirmation = document.getElementById('confirmation');
  let submitting = false;

  function makeRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'prt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 18);
  }

  function makePaymentVs() {
    // 9místný číselný VS. Při dostupném Web Crypto má velmi nízkou
    // pravděpodobnost kolize; backend jej ještě kontroluje proti tabulce.
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return String(100000000 + (values[0] % 900000000));
    }
    return String(Math.floor(100000000 + Math.random() * 900000000));
  }

  function jsonp(action, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const callbackName = 'printCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let callbackCalled = false;
      let settled = false;

      const timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Server neodpověděl včas.'));
      }, timeoutMs || 15000);

      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callbackName]; } catch (ignore) { window[callbackName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function (payload) {
        if (settled) return;
        callbackCalled = true;
        settled = true;
        cleanup();
        resolve(payload);
      };

      const query = new URLSearchParams(Object.assign({}, params || {}, {
        action: action,
        callback: callbackName,
        _: Date.now().toString()
      }));
      script.src = APPS_SCRIPT_URL + '?' + query.toString();
      script.async = true;
      script.onerror = function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Nepodařilo se spojit se serverem.'));
      };
      script.onload = function () {
        if (!callbackCalled && !settled) {
          settled = true;
          cleanup();
          reject(new Error('Server vrátil neočekávanou odpověď.'));
        }
      };
      document.body.appendChild(script);
    });
  }

  async function pollOrderStatus(requestId, maxMs) {
    const start = Date.now();
    let lastError = null;

    while (Date.now() - start < (maxMs || 60000)) {
      try {
        const response = await jsonp('getStatus', { requestId: requestId }, 15000);
        if (response && response.status === 'OK' && response.requestStatus && response.requestStatus.state === 'DONE') {
          return response.requestStatus;
        }
        if (response && response.status === 'ERROR') {
          lastError = new Error(response.message || 'Server odmítl ověření objednávky.');
        }
      } catch (error) {
        lastError = error;
      }

      await new Promise(function (resolve) { window.setTimeout(resolve, 1200); });
    }

    throw lastError || new Error('Výsledek objednávky se nepodařilo včas ověřit.');
  }

  function showError(message, uncertain) {
    errorBox.textContent = uncertain
      ? message + ' Neodesílejte objednávku okamžitě znovu. Nejprve zkontrolujte e-mail; pokud potvrzení nepřijde, kontaktujte ŠAPI Foto.'
      : message;
    errorBox.className = 'form-status error';
    errorBox.style.display = 'block';
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    errorBox.style.display = 'none';
    errorBox.textContent = '';
  }

  function addRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="num" required maxlength="80" aria-label="Číslo fotografie"></td>
      <td><select class="format" aria-label="Formát fotografie">${Object.keys(prices).map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('')}</select></td>
      <td><select class="count" aria-label="Počet kusů">${Array.from({ length: 10 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('')}</select></td>
      <td><button type="button" class="small remove-item" aria-label="Odstranit položku">✕</button></td>`;

    tr.querySelector('.remove-item').addEventListener('click', function () {
      tr.remove();
      if (!tbody.querySelector('tr')) addRow();
      calculate();
    });
    tr.querySelectorAll('input,select').forEach(function (el) {
      el.addEventListener('input', calculate);
      el.addEventListener('change', calculate);
    });
    tbody.appendChild(tr);
    calculate();
  }

  function collectItems() {
    return Array.from(tbody.querySelectorAll('tr')).map(function (row) {
      return {
        photoNumber: row.querySelector('.num').value.trim(),
        format: row.querySelector('.format').value,
        quantity: Number(row.querySelector('.count').value)
      };
    });
  }

  function calculate() {
    let total = 0;
    const summary = {};
    collectItems().forEach(function (item) {
      const line = prices[item.format] * item.quantity;
      total += line;
      if (!summary[item.format]) summary[item.format] = { count: 0, price: 0 };
      summary[item.format].count += item.quantity;
      summary[item.format].price += line;
    });
    summaryDiv.innerHTML = Object.keys(summary).map(function (format) {
      return format + ' – ' + summary[format].count + ' ks (' + summary[format].price + ' Kč)';
    }).join('<br>');
    totalPriceEl.textContent = String(total);
  }

  function toNetlifyBackupParams(formData) {
    const params = new URLSearchParams();
    formData.forEach(function (value, key) {
      if (typeof value === 'string') params.append(key, value);
    });
    // Netlify ukládá kompletní záložní kopii včetně klientem vytvořeného
    // VS, souhrnu a částky. Backend cenu i položky nezávisle přepočítá.
    params.set('server_status', 'PENDING');
    params.set('client_mail_sent', 'NEOVĚŘENO');
    return params;
  }

  function showQr(total, vs) {
    const qrCode = document.getElementById('qrCode');
    const qrFallback = document.getElementById('qrFallback');
    qrCode.innerHTML = '';
    qrFallback.textContent = '';

    if (typeof window.QRCode !== 'function') {
      qrFallback.textContent = 'QR kód se nepodařilo načíst. Použijte prosím platební údaje uvedené výše.';
      return;
    }

    try {
      new window.QRCode(qrCode, {
        text: 'SPD*1.0*ACC:' + PAYMENT_IBAN + '*AM:' + total + '*CC:CZK*X-VS:' + vs,
        width: 280,
        height: 280
      });
    } catch (error) {
      console.error('QR:', error);
      qrFallback.textContent = 'QR kód se nepodařilo vytvořit. Použijte prosím platební údaje uvedené výše.';
    }
  }

  document.getElementById('addItemBtn').addEventListener('click', addRow);
  addRow();

  document.getElementById('showHelp').addEventListener('click', function (event) {
    event.preventDefault();
    const help = document.getElementById('helpImage');
    const open = help.style.display !== 'none';
    help.style.display = open ? 'none' : 'block';
    this.setAttribute('aria-expanded', open ? 'false' : 'true');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;
    hideError();
    if (!form.reportValidity()) return;

    const items = collectItems();
    if (!items.length || items.some(function (item) { return !item.photoNumber; })) {
      showError('Vyplňte číslo fotografie u všech položek.', false);
      return;
    }

    submitting = true;
    submitBtn.disabled = true;

    const requestId = makeRequestId();
    const vs = makePaymentVs();
    let total = 0;
    let summaryText = '';

    items.forEach(function (item, index) {
      total += prices[item.format] * item.quantity;
      summaryText += (index + 1) + '. ' + item.photoNumber + ' / ' + item.format + ' / ' + item.quantity + ' ks\n';
    });

    document.getElementById('request_id').value = requestId;
    document.getElementById('items_json').value = JSON.stringify(items);
    document.getElementById('order_number').value = vs;
    document.getElementById('total_price').value = String(total);
    document.getElementById('order_summary').value = summaryText;

    const formData = new FormData(form);

    // 1) Apps Script – fire-and-forget. Server položky a cenu sám ověří.
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: formData,
      keepalive: true
    }).catch(function (error) {
      console.error('Apps Script POST:', error);
    });

    // 2) Netlify – kompletní nezávislá záloha objednávky včetně VS.
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toNetlifyBackupParams(formData).toString(),
      keepalive: true
    }).catch(function (error) {
      console.error('Netlify backup:', error);
    });

    // 3) Potvrzení + QR – OKAMŽITĚ.
    document.getElementById('confOrderNum').textContent = vs;
    document.getElementById('confSummary').textContent = summaryText;
    document.getElementById('confVS').textContent = vs;
    document.getElementById('confAmount').textContent = String(total);
    document.getElementById('confEmailStatus').textContent = 'Potvrzení objednávky obdržíte také e-mailem.';

    showQr(total, vs);
    form.style.display = 'none';
    confirmation.style.display = 'block';
    confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 4) Tiché ověření na pozadí. Timeout se zákazníkovi nikdy nezobrazuje.
    pollOrderStatus(requestId, 60000).then(function (status) {
      if (!status || !status.accepted) {
        document.getElementById('confEmailStatus').textContent =
          'Objednávku se nepodařilo automaticky potvrdit na serveru. Pokud vám nepřijde potvrzovací e-mail, kontaktujte prosím ŠAPI Foto před platbou.';
        return;
      }

      // Backend má použít stejný VS. Kdyby nastala extrémně nepravděpodobná
      // kolize a číslo se lišilo, aktualizujeme platební údaje i QR.
      const confirmedVs = status.orderNumber || vs;
      const confirmedTotal = Number(status.total) || total;
      if (confirmedVs !== vs || confirmedTotal !== total) {
        document.getElementById('confOrderNum').textContent = confirmedVs;
        document.getElementById('confVS').textContent = confirmedVs;
        document.getElementById('confAmount').textContent = String(confirmedTotal);
        showQr(confirmedTotal, confirmedVs);
      }

      document.getElementById('confEmailStatus').textContent = status.clientMailSent
        ? 'Potvrzení objednávky bylo odesláno na váš e-mail.'
        : 'Objednávka byla přijata. Pokud potvrzovací e-mail nepřijde, není nutné objednávku posílat znovu.';
    }).catch(function (error) {
      console.warn('Ověření stavu objednávky tisku:', error);
    });
  });
});

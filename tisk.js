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

  function jsonp(action, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const callbackName = 'printCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = window.setTimeout(function () {
        cleanup();
        reject(new Error('Server neodpověděl včas.'));
      }, timeoutMs || 8000);

      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callbackName]; } catch (ignore) { window[callbackName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function (payload) {
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
        cleanup();
        reject(new Error('Nepodařilo se spojit se serverem.'));
      };
      document.body.appendChild(script);
    });
  }

  async function pollOrderStatus(requestId, maxMs) {
    const start = Date.now();
    while (Date.now() - start < (maxMs || 30000)) {
      const response = await jsonp('getStatus', { requestId: requestId }, 7000);
      if (response && response.status === 'OK' && response.requestStatus && response.requestStatus.state === 'DONE') {
        return response.requestStatus;
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 650); });
    }
    throw new Error('Výsledek objednávky se nepodařilo včas ověřit.');
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
    // VS a cena vznikají až na serveru. Netlify ukládá pouze vstupní
    // PENDING zálohu a neslouží jako důkaz přijetí objednávky.
    params.set('order_number', '');
    params.set('total_price', '');
    params.set('order_summary', '');
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

  form.addEventListener('submit', async function (event) {
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
    submitBtn.textContent = 'Ověřuji objednávku…';

    try {
      const requestId = makeRequestId();
      document.getElementById('request_id').value = requestId;
      document.getElementById('items_json').value = JSON.stringify(items);

      const formData = new FormData(form);

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: formData,
        keepalive: true
      }).catch(function (error) { console.error('Apps Script POST:', error); });

      // Netlify dostane vstupní zálohu okamžitě, ale platební údaje se
      // zobrazí až po potvrzení skutečně uložené objednávky Apps Scriptem.
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toNetlifyBackupParams(formData).toString(),
        keepalive: true
      }).catch(function (error) { console.error('Netlify backup:', error); });

      const status = await pollOrderStatus(requestId, 30000);
      if (!status.accepted) throw new Error(status.message || 'Objednávka byla serverem odmítnuta.');

      document.getElementById('order_number').value = status.orderNumber || '';
      document.getElementById('total_price').value = String(status.total || '');
      document.getElementById('order_summary').value = status.summary || '';

      document.getElementById('confOrderNum').textContent = status.orderNumber || '—';
      document.getElementById('confSummary').textContent = status.summary || '';
      document.getElementById('confVS').textContent = status.orderNumber || '—';
      document.getElementById('confAmount').textContent = String(status.total || '');
      document.getElementById('confEmailStatus').textContent = status.clientMailSent
        ? 'Potvrzení objednávky bylo odesláno na váš e-mail.'
        : 'Objednávka je bezpečně uložená, ale potvrzovací e-mail se nepodařilo odeslat. Poznamenejte si číslo objednávky / VS.';

      showQr(status.total, status.orderNumber);
      form.style.display = 'none';
      confirmation.style.display = 'block';
      confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
      console.error(error);
      const uncertain = /včas ověřit|neodpověděl|spojit se serverem/i.test(error.message || '');
      showError(error.message || 'Objednávku se nepodařilo dokončit.', uncertain);
      if (!uncertain) {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Odeslat objednávku';
      }
    }
  });
});

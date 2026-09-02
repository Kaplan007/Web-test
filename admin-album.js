(function () {
  'use strict';

  const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbysHFdWmBpfyKeNXBBCsYsWTRVsv5cLXiCeEqnc9lLYfdGYGIH8qwjQmYKbjVYjHL82Vw/exec';

  const form = document.getElementById('albumMailForm');
  const passwordInput = document.getElementById('adminPassword');
  const orderInput = document.getElementById('orderNumber');
  const loadBtn = document.getElementById('loadBtn');
  const sendBtn = document.getElementById('sendBtn');
  const statusBox = document.getElementById('adminStatus');
  const clientData = document.getElementById('clientData');
  const parentName = document.getElementById('parentName');
  const customerEmail = document.getElementById('customerEmail');
  const albumUrl = document.getElementById('albumUrl');
  const alreadySentWarning = document.getElementById('alreadySentWarning');

  let loadedOrderNumber = '';

  function createRequestId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return prefix + '-' + window.crypto.randomUUID();
    }
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  function showStatus(type, message) {
    statusBox.className = 'admin-status ' + type;
    statusBox.textContent = message;
  }

  function clearStatus() {
    statusBox.className = 'admin-status';
    statusBox.textContent = '';
  }

  function clearLoadedOrder() {
    loadedOrderNumber = '';
    parentName.value = '';
    customerEmail.value = '';
    albumUrl.value = '';
    clientData.classList.remove('visible');
    alreadySentWarning.classList.remove('visible');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Odeslat zákazníkovi';
  }

  function validateOrderNumber() {
    const value = orderInput.value.trim();
    if (!/^\d{1,10}$/.test(value)) {
      showStatus('error', 'Číslo objednávky musí obsahovat 1 až 10 číslic.');
      orderInput.focus();
      return null;
    }
    return value;
  }

  function jsonp(action, requestId, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const callbackName = '__albumCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = window.setTimeout(function () {
        cleanup();
        reject(new Error('timeout'));
      }, timeoutMs || 7000);

      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callbackName]; } catch (ignore) { window[callbackName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function (data) {
        cleanup();
        resolve(data);
      };

      const query = new URLSearchParams({
        action: action,
        requestId: requestId,
        callback: callbackName,
        _: String(Date.now())
      });

      script.onerror = function () {
        cleanup();
        reject(new Error('network'));
      };

      script.src = APPS_SCRIPT_URL + '?' + query.toString();
      document.head.appendChild(script);
    });
  }

  async function waitForResult(statusAction, requestId) {
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline) {
      try {
        const response = await jsonp(statusAction, requestId, 6000);
        if (response && response.status === 'OK' && response.requestStatus) {
          const state = response.requestStatus;
          if (state.state === 'DONE') return state;
        }
      } catch (ignore) {
        // Jednotlivý timeout není důvod ukončit kontrolu.
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 650); });
    }

    return null;
  }

  function postAction(data) {
    return fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: data.toString()
    }).catch(function () {});
  }

  loadBtn.addEventListener('click', async function () {
    clearStatus();
    clearLoadedOrder();

    if (!passwordInput.value) {
      showStatus('error', 'Zadejte administrační heslo.');
      passwordInput.focus();
      return;
    }

    const orderNumber = validateOrderNumber();
    if (!orderNumber) return;

    const requestId = createRequestId('album-load');
    const data = new URLSearchParams();
    data.set('action', 'loadAlbumOrder');
    data.set('request_id', requestId);
    data.set('password', passwordInput.value);
    data.set('order_number', orderNumber);

    loadBtn.disabled = true;
    loadBtn.textContent = 'Načítám…';
    showStatus('info', 'Načítám objednávku z Google Sheets…');

    try {
      postAction(data);
      const result = await waitForResult('getAlbumLookupStatus', requestId);

      if (!result) {
        showStatus('error', 'Objednávku se nepodařilo ověřit. Zkontrolujte připojení a zkuste Načíst znovu.');
        return;
      }

      if (!result.ok) {
        showStatus('error', result.message || 'Objednávku se nepodařilo načíst.');
        return;
      }

      loadedOrderNumber = String(result.orderNumber || '');
      parentName.value = result.parentName || '';
      customerEmail.value = result.email || '';
      albumUrl.value = result.albumUrl || '';
      clientData.classList.add('visible');
      sendBtn.disabled = false;

      if (result.alreadySent) {
        alreadySentWarning.classList.add('visible');
        sendBtn.textContent = 'Odeslat znovu zákazníkovi';
        showStatus('info', 'Objednávka č. ' + loadedOrderNumber + ' byla načtena. Podle sloupce U už byla dříve odeslána.');
      } else {
        alreadySentWarning.classList.remove('visible');
        sendBtn.textContent = 'Odeslat zákazníkovi';
        showStatus('success', 'Objednávka č. ' + loadedOrderNumber + ' byla úspěšně načtena.');
      }
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Načíst';
    }
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const orderNumber = validateOrderNumber();
    if (!orderNumber) return;

    if (!loadedOrderNumber || loadedOrderNumber !== orderNumber) {
      clearLoadedOrder();
      showStatus('error', 'Nejprve načtěte aktuální číslo objednávky tlačítkem Načíst.');
      return;
    }

    const requestId = createRequestId('album-send');
    const data = new URLSearchParams();
    data.set('action', 'sendAlbumMail');
    data.set('request_id', requestId);
    data.set('password', passwordInput.value);
    data.set('order_number', orderNumber);

    loadBtn.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Odesílám…';
    showStatus('info', 'Odesílám e-mail zákazníkovi…');

    try {
      postAction(data);
      const result = await waitForResult('getAlbumMailStatus', requestId);

      if (!result) {
        showStatus(
          'error',
          'Stav odeslání se nepodařilo ověřit. Neodesílejte zprávu okamžitě znovu – nejprve zkontrolujte e-mail a sloupec U v Google Sheets.'
        );
        return;
      }

      if (result.ok) {
        alreadySentWarning.classList.add('visible');
        sendBtn.textContent = 'Odeslat znovu zákazníkovi';
        showStatus(
          'success',
          'E-mail byl úspěšně odeslán na ' + result.email + '. Ve sloupci U bylo zapsáno ANO.'
        );
      } else {
        showStatus('error', result.message || 'E-mail se nepodařilo odeslat.');
      }
    } finally {
      loadBtn.disabled = false;
      sendBtn.disabled = !loadedOrderNumber;
      if (loadedOrderNumber && alreadySentWarning.classList.contains('visible')) {
        sendBtn.textContent = 'Odeslat znovu zákazníkovi';
      } else if (loadedOrderNumber) {
        sendBtn.textContent = 'Odeslat zákazníkovi';
      }
    }
  });

  orderInput.addEventListener('input', function () {
    if (loadedOrderNumber && orderInput.value.trim() !== loadedOrderNumber) {
      clearLoadedOrder();
      clearStatus();
    }
  });

  passwordInput.addEventListener('input', function () {
    if (loadedOrderNumber) {
      clearLoadedOrder();
      clearStatus();
    }
  });
})();

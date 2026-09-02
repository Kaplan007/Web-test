(function () {
  'use strict';

  const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbysHFdWmBpfyKeNXBBCsYsWTRVsv5cLXiCeEqnc9lLYfdGYGIH8qwjQmYKbjVYjHL82Vw/exec';

  const form = document.getElementById('albumMailForm');
  const sendBtn = document.getElementById('sendBtn');
  const statusBox = document.getElementById('adminStatus');

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'album-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  function showStatus(type, message) {
    statusBox.className = 'admin-status ' + type;
    statusBox.textContent = message;
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

  async function waitForResult(requestId) {
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline) {
      try {
        const response = await jsonp('getAlbumMailStatus', requestId, 6000);
        if (response && response.status === 'OK' && response.requestStatus) {
          const state = response.requestStatus;
          if (state.state === 'DONE') return state;
        }
      } catch (ignore) {
        // jednotlivý timeout není důvod ukončit kontrolu
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 650); });
    }

    return null;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const requestId = createRequestId();
    const data = new URLSearchParams();
    data.set('action', 'sendAlbumMail');
    data.set('request_id', requestId);
    data.set('password', document.getElementById('adminPassword').value);
    data.set('email', document.getElementById('customerEmail').value.trim());
    data.set('album_url', document.getElementById('albumUrl').value.trim());
    data.set('vs', document.getElementById('variableSymbol').value.trim());

    sendBtn.disabled = true;
    sendBtn.textContent = 'Odesílám…';
    showStatus('info', 'Odesílám e-mail zákazníkovi…');

    try {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: data.toString()
      }).catch(function () {});

      const result = await waitForResult(requestId);

      if (!result) {
        showStatus(
          'error',
          'Stav odeslání se nepodařilo ověřit. Neodesílejte zprávu okamžitě znovu – nejprve zkontrolujte list „Odeslaná alba“ v Google Sheets.'
        );
        return;
      }

      if (result.ok) {
        showStatus(
          'success',
          'E-mail byl úspěšně odeslán na ' + result.email +
          '. VS: ' + result.vs + '.'
        );
        document.getElementById('customerEmail').value = '';
        document.getElementById('albumUrl').value = '';
        document.getElementById('variableSymbol').value = '';
        document.getElementById('customerEmail').focus();
      } else {
        showStatus('error', result.message || 'E-mail se nepodařilo odeslat.');
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Odeslat zákazníkovi';
    }
  });
})();

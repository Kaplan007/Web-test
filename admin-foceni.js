document.addEventListener('DOMContentLoaded', function () {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysHFdWmBpfyKeNXBBCsYsWTRVsv5cLXiCeEqnc9lLYfdGYGIH8qwjQmYKbjVYjHL82Vw/exec';

  const passwordEl = document.getElementById('password');
  const nameEl = document.getElementById('competitionName');
  const dateEl = document.getElementById('competitionDate');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const messageEl = document.getElementById('message');

  function makeRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'adm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 18);
  }

  function setMessage(text, ok) {
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    messageEl.style.borderColor = ok ? '#6a9b6a' : '#c66';
    messageEl.style.background = ok ? '#f0fff0' : '#fff0f0';
    messageEl.setAttribute('role', ok ? 'status' : 'alert');
  }

  function checkedCategories() {
    return Array.from(document.querySelectorAll('#categories input[type="checkbox"]:checked')).map(function (el) {
      return el.value;
    });
  }

  function validateCzechDate(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    if (!match) return { ok: false, message: 'Termín musí být ve formátu D. M. RRRR, například 3. 10. 2026.' };

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const test = new Date(year, month - 1, day, 12, 0, 0);
    if (test.getFullYear() !== year || test.getMonth() !== month - 1 || test.getDate() !== day) {
      return { ok: false, message: 'Zadané datum soutěže není platné.' };
    }

    const close = new Date(year, month - 1, day - 1, 12, 0, 0);
    if (close.getTime() <= Date.now()) {
      return { ok: false, message: 'Automatická uzávěrka pro toto datum již proběhla. Zadejte budoucí termín soutěže.' };
    }
    return { ok: true };
  }

  function jsonp(action, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const callbackName = 'adminCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
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

  function applyConfig(config) {
    document.getElementById('currentStatus').textContent = config.orderingAvailable
      ? 'OBJEDNÁVKY JSOU SPUŠTĚNÉ'
      : (config.automaticClosed ? 'OBJEDNÁVKY BYLY AUTOMATICKY UKONČENÉ' : 'OBJEDNÁVKY JSOU ZASTAVENÉ');

    document.getElementById('currentCompetition').textContent = config.competitionDisplay || '';
    document.getElementById('currentDeadline').textContent = config.orderDeadlineText
      ? 'Automatická uzávěrka: ' + config.orderDeadlineText
      : '';

    if (config.competitionName) nameEl.value = config.competitionName;
    if (config.competitionDate) dateEl.value = config.competitionDate;

    const active = new Set(config.activeCategories || []);
    document.querySelectorAll('#categories input[type="checkbox"]').forEach(function (el) {
      el.checked = active.has(el.value);
    });
  }

  async function loadConfig() {
    const config = await jsonp('getConfig', {}, 8000);
    if (!config || config.status !== 'OK') throw new Error('Nepodařilo se načíst aktuální konfiguraci.');
    applyConfig(config);
    return config;
  }

  async function pollAdminStatus(requestId, maxMs) {
    const start = Date.now();
    while (Date.now() - start < (maxMs || 20000)) {
      const response = await jsonp('getAdminStatus', { requestId: requestId }, 7000);
      if (response && response.status === 'OK' && response.requestStatus && response.requestStatus.state === 'DONE') {
        return response.requestStatus;
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 600); });
    }
    throw new Error('Výsledek změny se nepodařilo ověřit včas.');
  }

  async function postAdmin(command) {
    const password = passwordEl.value.trim();
    if (!password) {
      setMessage('Zadejte administrační heslo.', false);
      return;
    }

    const data = new URLSearchParams();
    const requestId = makeRequestId();
    data.set('action', 'adminSave');
    data.set('command', command);
    data.set('password', password);
    data.set('request_id', requestId);

    if (command === 'start') {
      const competitionName = nameEl.value.trim();
      const competitionDate = dateEl.value.trim();
      const categories = checkedCategories();

      if (!competitionName) {
        setMessage('Zadejte název soutěže.', false);
        return;
      }
      const dateValidation = validateCzechDate(competitionDate);
      if (!dateValidation.ok) {
        setMessage(dateValidation.message, false);
        return;
      }
      if (!categories.length) {
        setMessage('Vyberte alespoň jednu kategorii.', false);
        return;
      }

      data.set('competitionName', competitionName);
      data.set('competitionDate', competitionDate);
      data.set('activeCategories', JSON.stringify(categories));
    }

    startBtn.disabled = true;
    stopBtn.disabled = true;
    setMessage(command === 'start' ? 'Spouštím objednávky…' : 'Zastavuji objednávky…', true);

    try {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString(),
        keepalive: true
      }).catch(function (error) { console.error('Admin POST:', error); });

      const result = await pollAdminStatus(requestId, 20000);
      if (!result.ok) throw new Error(result.message || 'Změna nebyla uložena.');

      await loadConfig();
      setMessage(result.message || (command === 'start' ? 'Objednávky byly spuštěny.' : 'Objednávky byly zastaveny.'), true);
    } catch (error) {
      console.error(error);
      setMessage(error.message || 'Požadavek se nepodařilo dokončit.', false);
    } finally {
      startBtn.disabled = false;
      stopBtn.disabled = false;
    }
  }

  startBtn.addEventListener('click', function () { postAdmin('start'); });
  stopBtn.addEventListener('click', function () { postAdmin('stop'); });

  loadConfig().catch(function (error) {
    console.error(error);
    setMessage(error.message || 'Nepodařilo se načíst aktuální nastavení.', false);
  });
});

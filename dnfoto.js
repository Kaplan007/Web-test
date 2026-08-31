document.addEventListener('DOMContentLoaded', function () {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysHFdWmBpfyKeNXBBCsYsWTRVsv5cLXiCeEqnc9lLYfdGYGIH8qwjQmYKbjVYjHL82Vw/exec';

  const form = document.getElementById('orderForm');
  const submitBtn = document.getElementById('submitBtn');
  const confirmation = document.getElementById('confirmation');
  const errorMessage = document.getElementById('errorMessage');
  const loadingConfig = document.getElementById('loadingConfig');
  const ordersClosed = document.getElementById('ordersClosed');
  const configError = document.getElementById('configError');
  const inactiveCategoriesBox = document.getElementById('inactiveCategories');
  const competitionDisplay = document.getElementById('competitionDisplay');
  const competitionHidden = document.getElementById('tanecni_soutez');
  const orderDeadlineInfo = document.getElementById('orderDeadlineInfo');
  const orderDeadlineText = document.getElementById('orderDeadlineText');
  const categorySelect = document.getElementById('kategorie');
  const soloFields = document.getElementById('soloFields');
  const duoFields = document.getElementById('duoFields');
  const soloInput = document.getElementById('tanecnice_solo');
  const duo1Input = document.getElementById('tanecnice_duo_1');
  const duo2Input = document.getElementById('tanecnice_duo_2');

  let latestConfig = null;
  let submitting = false;

  function makeRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 18);
  }

  function jsonp(action, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const callbackName = 'sapi_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let callbackCalled = false;
      let settled = false;

      const timeout = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Server neodpověděl včas.'));
      }, timeoutMs || 15000);

      function cleanup() {
        window.clearTimeout(timeout);
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
    const started = Date.now();
    let lastError = null;

    while (Date.now() - started < (maxMs || 60000)) {
      try {
        const response = await jsonp('getStatus', { requestId: requestId }, 15000);
        if (response && response.status === 'OK' && response.requestStatus) {
          const status = response.requestStatus;
          if (status.state === 'DONE') return status;
        } else if (response && response.status === 'ERROR') {
          lastError = new Error(response.message || 'Server odmítl ověření objednávky.');
        }
      } catch (error) {
        // Jednotlivý timeout nebo krátký výpadek Apps Scriptu není důvod
        // ukončit celý proces. Stav zkusíme znovu až do celkového limitu.
        lastError = error;
      }

      await new Promise(function (resolve) { window.setTimeout(resolve, 1200); });
    }

    throw lastError || new Error('Výsledek objednávky se nepodařilo včas ověřit.');
  }

  function showError(message, uncertain) {
    errorMessage.textContent = uncertain
      ? message + ' Neodesílejte objednávku okamžitě znovu. Nejprve zkontrolujte e-mail; pokud potvrzení nepřijde, kontaktujte ŠAPI Foto.'
      : message;
    errorMessage.style.display = 'block';
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
  }

  function updateDancerFields() {
    const category = categorySelect.value || '';
    const isSolo = category.indexOf('Sólo ') === 0;
    const isDuo = category.indexOf('Duo ') === 0;

    soloFields.style.display = isSolo ? 'block' : 'none';
    duoFields.style.display = isDuo ? 'block' : 'none';
    soloInput.required = isSolo;
    duo1Input.required = isDuo;
    duo2Input.required = isDuo;

    if (!isSolo) soloInput.value = '';
    if (!isDuo) {
      duo1Input.value = '';
      duo2Input.value = '';
    }
  }

  function renderConfig(config) {
    latestConfig = config;
    loadingConfig.style.display = 'none';
    configError.style.display = 'none';

    competitionDisplay.textContent = config.competitionDisplay || '—';
    competitionHidden.value = config.competitionDisplay || '';

    if (!config.orderingAvailable) {
      form.style.display = 'none';
      inactiveCategoriesBox.style.display = 'none';
      orderDeadlineInfo.style.display = 'none';
      ordersClosed.style.display = 'block';

      if (config.automaticClosed) {
        ordersClosed.innerHTML = '<strong>Objednávání focení pro tuto soutěž bylo ukončeno.</strong><br>' +
          (config.orderDeadlineText ? 'Objednávky byly přijímány do ' + escapeHtml(config.orderDeadlineText) + '.' : '');
      } else {
        ordersClosed.innerHTML = '<strong>Možnost objednání bude spuštěna po zveřejnění harmonogramu následující soutěže.</strong>';
      }
      return;
    }

    ordersClosed.style.display = 'none';
    form.style.display = 'block';

    categorySelect.innerHTML = '<option value="" selected disabled>Vyberte kategorii</option>';
    (config.activeCategories || []).forEach(function (category) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });

    const inactive = config.inactiveCategories || [];
    if (inactive.length) {
      inactiveCategoriesBox.innerHTML = '<strong>Nepřijímám objednávky pro:</strong>' + inactive.map(function (category) {
        return '<span class="inactive-category">' + escapeHtml(category) + '</span>';
      }).join('');
      inactiveCategoriesBox.style.display = 'block';
    } else {
      inactiveCategoriesBox.style.display = 'none';
    }

    if (config.orderDeadlineText) {
      orderDeadlineText.textContent = config.orderDeadlineText;
      orderDeadlineInfo.style.display = 'block';
    } else {
      orderDeadlineInfo.style.display = 'none';
    }

    updateDancerFields();
  }

  async function loadPublicConfig(silent) {
    if (!silent) loadingConfig.style.display = 'block';
    try {
      const config = await jsonp('getConfig', {}, 8000);
      if (!config || config.status !== 'OK') throw new Error('Neplatná konfigurace.');
      renderConfig(config);
      return config;
    } catch (error) {
      console.error(error);
      if (!silent) {
        loadingConfig.style.display = 'none';
        form.style.display = 'none';
        configError.style.display = 'block';
      }
      throw error;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function netlifyBackupParams(formData) {
    const params = new URLSearchParams();
    formData.forEach(function (value, key) {
      if (typeof value === 'string') params.append(key, value);
    });
    // Netlify je nezávislá záloha vstupních dat. PENDING nikdy neznamená,
    // že Apps Script objednávku skutečně přijal.
    params.set('server_order_number', '');
    params.set('server_status', 'PENDING');
    params.set('client_mail_sent', 'NEOVĚŘENO');
    return params;
  }

  categorySelect.addEventListener('change', updateDancerFields);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;
    hideError();

    if (!form.reportValidity()) return;

    // Formulář je veřejně zobrazen pouze při aktivní konfiguraci.
    // Při odeslání už znovu nečekáme na síťový dotaz – klient dostane
    // potvrzení okamžitě. Backend si aktuální stav i uzávěrku ověří sám.
    if (latestConfig && !latestConfig.orderingAvailable) {
      renderConfig(latestConfig);
      showError('Objednávání již není dostupné.', false);
      return;
    }

    submitting = true;
    submitBtn.disabled = true;

    const requestId = makeRequestId();
    document.getElementById('request_id').value = requestId;
    const formData = new FormData(form);

    const category = formData.get('kategorie') || '';
    const type = category.indexOf('Sólo ') === 0 ? 'Sólo' : 'Duo';
    const dancers = type === 'Sólo'
      ? (formData.get('tanecnice_solo') || '')
      : (formData.get('tanecnice_duo_1') || '') + ' + ' + (formData.get('tanecnice_duo_2') || '');

    // 1) Apps Script – fire-and-forget. Nečekáme na odpověď.
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: formData,
      keepalive: true
    }).catch(function (error) {
      console.error('Apps Script POST:', error);
    });

    // 2) Netlify Forms – nezávislá záloha stejných vstupních dat.
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: netlifyBackupParams(formData).toString(),
      keepalive: true
    }).catch(function (error) {
      console.error('Netlify backup:', error);
    });

    // 3) Potvrzení uživateli – OKAMŽITĚ, bez čekání na server.
    document.getElementById('confCompetition').textContent = formData.get('tanecni_soutez') || '';
    document.getElementById('confType').textContent = type;
    document.getElementById('confDancers').textContent = dancers;
    document.getElementById('confCategory').textContent = category;
    document.getElementById('confEmailStatus').textContent = 'Potvrzení objednávky obdržíte také e-mailem.';
    document.getElementById('confOrderLine').style.display = 'none';

    form.style.display = 'none';
    confirmation.style.display = 'block';
    confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 4) Stav ověříme pouze tiše na pozadí. Na nic se nečeká a timeout
    // se zákazníkovi nezobrazuje. Pokud server odpoví, doplníme číslo
    // objednávky a skutečný stav e-mailu.
    pollOrderStatus(requestId, 60000).then(function (status) {
      if (!status || !status.accepted) {
        document.getElementById('confEmailStatus').textContent =
          'Objednávku se nepodařilo automaticky potvrdit na serveru. Pokud vám nepřijde potvrzovací e-mail, kontaktujte prosím ŠAPI Foto.';
        return;
      }

      if (status.orderNumber) {
        document.getElementById('confOrderNum').textContent = status.orderNumber;
        document.getElementById('confOrderLine').style.display = 'block';
      }

      document.getElementById('confEmailStatus').textContent = status.clientMailSent
        ? 'Potvrzení objednávky bylo odesláno na váš e-mail.'
        : 'Objednávka byla přijata. Pokud potvrzovací e-mail nepřijde, není nutné objednávku posílat znovu.';
    }).catch(function (error) {
      // Síťové ověření je pouze doplňkové. Timeout nesmí kazit UX.
      console.warn('Ověření stavu DN objednávky:', error);
    });
  });

  loadPublicConfig(false).catch(function () {});
  
});

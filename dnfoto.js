document.addEventListener('DOMContentLoaded', function () {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysHFdWmBpfyKeNXBBCsYsWTRVsv5cLXiCeEqnc9lLYfdGYGIH8qwjQmYKbjVYjHL82Vw/exec';
  const PRICE_PER_ITEM = 250;
  const MAX_ITEMS = 20;

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
  const itemsContainer = document.getElementById('itemsContainer');
  const addItemBtn = document.getElementById('addItemBtn');
  const totalPriceEl = document.getElementById('totalPrice');
  const itemCountEl = document.getElementById('itemCount');
  const categoryTemplate = document.getElementById('categoryTemplate');

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

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildCategoryOptions(select) {
    select.innerHTML = '<option value="" selected disabled>Vyberte kategorii</option>';
    (latestConfig && latestConfig.activeCategories || []).forEach(function (category) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
  }

  function addItem() {
    if (!latestConfig) return;
    const currentRows = itemsContainer.querySelectorAll('.order-item');
    if (currentRows.length >= MAX_ITEMS) {
      showError('V jedné objednávce lze objednat maximálně ' + MAX_ITEMS + ' položek.', false);
      return;
    }

    const item = document.createElement('div');
    item.className = 'order-item';
    item.innerHTML =
      '<div class="order-item-head">' +
        '<strong>Položka <span class="item-number"></span></strong>' +
        '<button type="button" class="remove-item" aria-label="Odstranit položku">Odstranit</button>' +
      '</div>' +
      '<label>Kategorie:</label>' +
      '<select class="item-category" required></select>' +
      '<div class="item-solo-fields" style="display:none;">' +
        '<label>Jméno tanečnice / tanečníka:</label>' +
        '<input class="item-solo" maxlength="100" type="text">' +
      '</div>' +
      '<div class="item-duo-fields" style="display:none;">' +
        '<label>Jména tanečnic / tanečníků:</label>' +
        '<input class="item-duo-1" maxlength="100" placeholder="Jméno tanečnice / tanečníka" type="text">' +
        '<input class="item-duo-2" maxlength="100" placeholder="Jméno tanečnice / tanečníka" style="margin-top:10px;" type="text">' +
      '</div>' +
      '<div class="item-price"><span>250 Kč</span></div>';

    const select = item.querySelector('.item-category');
    const soloFields = item.querySelector('.item-solo-fields');
    const duoFields = item.querySelector('.item-duo-fields');
    const soloInput = item.querySelector('.item-solo');
    const duo1Input = item.querySelector('.item-duo-1');
    const duo2Input = item.querySelector('.item-duo-2');
    const removeBtn = item.querySelector('.remove-item');

    buildCategoryOptions(select);

    function updateItemFields() {
      const category = select.value || '';
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
      recalculate();
    }

    select.addEventListener('change', updateItemFields);
    [soloInput, duo1Input, duo2Input].forEach(function (input) {
      input.addEventListener('input', recalculate);
    });
    removeBtn.addEventListener('click', function () {
      item.remove();
      renumberItems();
      if (!itemsContainer.querySelector('.order-item')) addItem();
      recalculate();
    });

   itemsContainer.appendChild(item);
renumberItems();
updateItemFields();
recalculate();

if (itemsContainer.querySelectorAll('.order-item').length > 1) {
  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

  function renumberItems() {
    Array.from(itemsContainer.querySelectorAll('.order-item')).forEach(function (item, index) {
      item.querySelector('.item-number').textContent = String(index + 1);
      const removeBtn = item.querySelector('.remove-item');
      removeBtn.disabled = itemsContainer.querySelectorAll('.order-item').length <= 1;
    });
  }

  function collectItems() {
    return Array.from(itemsContainer.querySelectorAll('.order-item')).map(function (item) {
      const category = item.querySelector('.item-category').value || '';
      const isSolo = category.indexOf('Sólo ') === 0;
      return {
        category: category,
        type: isSolo ? 'Sólo' : 'Duo',
        dancers: isSolo
          ? [item.querySelector('.item-solo').value.trim()]
          : [
              item.querySelector('.item-duo-1').value.trim(),
              item.querySelector('.item-duo-2').value.trim()
            ]
      };
    });
  }

  function recalculate() {
    const count = itemsContainer.querySelectorAll('.order-item').length;
    itemCountEl.textContent = String(count);
    totalPriceEl.textContent = String(count * PRICE_PER_ITEM);
    renumberItems();
  }

  function syncHiddenOrderFields(items, total) {
    document.getElementById('items_json').value = JSON.stringify(items);
    document.getElementById('item_count').value = String(items.length);
    document.getElementById('total_price').value = String(total);

    const first = items[0];
    document.getElementById('kategorie').value = first.category;
    document.getElementById('tanecnice_solo').value = first.type === 'Sólo' ? first.dancers[0] : '';
    document.getElementById('tanecnice_duo_1').value = first.type === 'Duo' ? first.dancers[0] : '';
    document.getElementById('tanecnice_duo_2').value = first.type === 'Duo' ? first.dancers[1] : '';
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

    itemsContainer.innerHTML = '';
    addItem();
    recalculate();
  }

  async function loadPublicConfig() {
    loadingConfig.style.display = 'block';
    try {
      const config = await jsonp('getConfig', {}, 8000);
      if (!config || config.status !== 'OK') throw new Error('Neplatná konfigurace.');
      renderConfig(config);
      return config;
    } catch (error) {
      console.error(error);
      loadingConfig.style.display = 'none';
      form.style.display = 'none';
      configError.style.display = 'block';
      throw error;
    }
  }

  function netlifyBackupParams(formData) {
    const params = new URLSearchParams();
    formData.forEach(function (value, key) {
      if (typeof value === 'string') params.append(key, value);
    });
    params.set('server_order_number', '');
    params.set('server_status', 'PENDING');
    params.set('client_mail_sent', 'NEOVĚŘENO');
    return params;
  }

  addItemBtn.addEventListener('click', function () {
    addItem();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;
    hideError();

    if (!form.reportValidity()) return;

    if (latestConfig && !latestConfig.orderingAvailable) {
      renderConfig(latestConfig);
      showError('Objednávání již není dostupné.', false);
      return;
    }

    const items = collectItems();
    if (!items.length) {
      showError('Přidejte alespoň jednu položku objednávky.', false);
      return;
    }

    const invalid = items.find(function (item) {
      if (!item.category) return true;
      if (item.type === 'Sólo') return !item.dancers[0];
      return !item.dancers[0] || !item.dancers[1];
    });
    if (invalid) {
      showError('Vyplňte kategorii a všechna požadovaná jména u každé položky.', false);
      return;
    }

    const total = items.length * PRICE_PER_ITEM;
    syncHiddenOrderFields(items, total);

    submitting = true;
    submitBtn.disabled = true;

    const requestId = makeRequestId();
    document.getElementById('request_id').value = requestId;
    document.getElementById('cena').value = String(total) + ' Kč';
    const formData = new FormData(form);

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: formData,
      keepalive: true
    }).catch(function (error) {
      console.error('Apps Script POST:', error);
    });

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: netlifyBackupParams(formData).toString(),
      keepalive: true
    }).catch(function (error) {
      console.error('Netlify backup:', error);
    });

    document.getElementById('confCompetition').textContent = formData.get('tanecni_soutez') || '';
    document.getElementById('confSummary').textContent = items.map(function (item, index) {
      return (index + 1) + '. ' + item.category + ' – ' + item.dancers.join(' + ');
    }).join('\n');
    document.getElementById('confPrice').textContent = String(total) + ' Kč';
    document.getElementById('confEmailStatus').textContent = 'Potvrzení objednávky obdržíte také e-mailem.';
    document.getElementById('confOrderLine').style.display = 'none';

    form.style.display = 'none';
    confirmation.style.display = 'block';
    confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

      if (status.total) {
        document.getElementById('confPrice').textContent = String(status.total) + ' Kč';
      }

      document.getElementById('confEmailStatus').textContent = status.clientMailSent
        ? 'Potvrzení objednávky bylo odesláno na váš e-mail.'
        : 'Objednávka byla přijata. Pokud potvrzovací e-mail nepřijde, není nutné objednávku posílat znovu.';
    }).catch(function (error) {
      console.warn('Ověření stavu DN objednávky:', error);
    });
  });

  loadPublicConfig().catch(function () {});
});

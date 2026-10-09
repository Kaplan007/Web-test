(function () {
  'use strict';

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysHFdWmBpfyKeNXBBCsYsWTRVsv5cLXiCeEqnc9lLYfdGYGIH8qwjQmYKbjVYjHL82Vw/exec';

  const passwordInput = document.getElementById('adminPassword');
  const competitionSelect = document.getElementById('competitionSelect');
  const loadCompetitionsBtn = document.getElementById('loadCompetitionsBtn');
  const loadDebtsBtn = document.getElementById('loadDebtsBtn');
  const statusBox = document.getElementById('remindersStatus');
  const debtsSection = document.getElementById('debtsSection');
  const debtsBody = document.getElementById('debtsBody');
  const selectAll = document.getElementById('selectAll');
  const sendBtn = document.getElementById('sendRemindersBtn');
  const sendHelp = document.getElementById('sendHelp');

  let currentOrders = [];
  let busy = false;

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'reminders-' + window.crypto.randomUUID();
    }
    return 'reminders-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 24);
  }

  function showStatus(type, message) {
    statusBox.className = 'reminders-status ' + type;
    statusBox.textContent = message;
    statusBox.style.display = 'block';
  }

  function clearStatus() {
    statusBox.className = 'reminders-status';
    statusBox.textContent = '';
    statusBox.style.display = 'none';
  }

  function setBusy(value, label) {
    busy = value;
    loadCompetitionsBtn.disabled = value;
    loadDebtsBtn.disabled = value || !competitionSelect.value;
    sendBtn.disabled = value || !getSelectedOrders().length;
    loadCompetitionsBtn.textContent = value && label === 'competitions' ? 'Načítám…' : 'Načíst soutěže';
    loadDebtsBtn.textContent = value && label === 'debts' ? 'Načítám…' : 'Výpis pohledávek';
    sendBtn.textContent = value && label === 'send' ? 'Odesílám upomínky…' : 'Poslat upomínku vybraným';
  }

  function formatMoney(value) {
    const number = Number(value) || 0;
    return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(number) + ' Kč';
  }

  function jsonp(action, requestId, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const callbackName = '__remindersCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let settled = false;
      let callbackCalled = false;

      const timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Server neodpověděl včas.'));
      }, timeoutMs || 10000);

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

      const query = new URLSearchParams({
        action: action,
        requestId: requestId,
        callback: callbackName,
        _: String(Date.now())
      });
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
      document.head.appendChild(script);
    });
  }

  async function waitForResult(requestId, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 90000);
    let lastError = null;

    while (Date.now() < deadline) {
      try {
        const response = await jsonp('getRemindersStatus', requestId, 10000);
        if (response && response.status === 'OK' && response.requestStatus) {
          const state = response.requestStatus;
          if (state.state === 'DONE') return state;
          if (state.state === 'ERROR') throw new Error(state.message || 'Server požadavek odmítl.');
        } else if (response && response.status === 'ERROR') {
          throw new Error(response.message || 'Server požadavek odmítl.');
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 900); });
    }

    throw lastError || new Error('Nepodařilo se včas ověřit výsledek. Zkontroluj stav před opakováním odeslání.');
  }

  async function runServerAction(action, parameters, timeoutMs) {
    const password = passwordInput.value.trim();
    if (!password) {
      passwordInput.focus();
      throw new Error('Zadej administrační heslo.');
    }

    const requestId = createRequestId();
    const data = new URLSearchParams();
    Object.keys(parameters || {}).forEach(function (key) {
      const value = parameters[key];
      data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
    data.set('action', action);
    data.set('request_id', requestId);
    data.set('password', password);

    // Apps Script se ověřuje přes následné čtení stavu, protože cross-origin POST
    // z webu používá no-cors stejně jako stávající administrační nástroje.
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: data,
        keepalive: true
      });
    } catch (error) {
      console.warn('Požadavek do Apps Scriptu:', error);
    }

    return waitForResult(requestId, timeoutMs);
  }

  function clearDebts() {
    currentOrders = [];
    debtsBody.textContent = '';
    debtsSection.style.display = 'none';
    selectAll.checked = false;
    selectAll.indeterminate = false;
    document.getElementById('debtCount').textContent = '0';
    document.getElementById('debtTotal').textContent = formatMoney(0);
    document.getElementById('selectedCount').textContent = '0';
    document.getElementById('selectedTotal').textContent = formatMoney(0);
    sendHelp.textContent = 'Nejprve načtěte pohledávky.';
    sendBtn.disabled = true;
  }

  function getSelectedOrders() {
    return Array.from(debtsBody.querySelectorAll('input[data-order-number]:checked'))
      .filter(function (input) { return !input.disabled; })
      .map(function (input) { return input.dataset.orderNumber; });
  }

  function refreshSummary() {
    const selectedNumbers = new Set(getSelectedOrders());
    const eligibleInputs = Array.from(debtsBody.querySelectorAll('input[data-order-number]'))
      .filter(function (input) { return !input.disabled; });
    const selected = currentOrders.filter(function (order) {
      return selectedNumbers.has(String(order.orderNumber));
    });
    const sumAll = currentOrders.reduce(function (sum, order) { return sum + (Number(order.debt) || 0); }, 0);
    const selectedSum = selected.reduce(function (sum, order) { return sum + (Number(order.debt) || 0); }, 0);

    document.getElementById('debtCount').textContent = String(currentOrders.length);
    document.getElementById('debtTotal').textContent = formatMoney(sumAll);
    document.getElementById('selectedCount').textContent = String(selected.length);
    document.getElementById('selectedTotal').textContent = formatMoney(selectedSum);
    selectAll.checked = eligibleInputs.length > 0 && eligibleInputs.every(function (input) { return input.checked; });
    selectAll.indeterminate = eligibleInputs.some(function (input) { return input.checked; }) && !selectAll.checked;
    sendBtn.disabled = busy || selected.length === 0;
    sendHelp.textContent = selected.length
      ? 'Vybráno ' + selected.length + ' objednávek k odeslání.'
      : 'Není vybrána žádná způsobilá objednávka.';
  }

  function addCell(row, value, className) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value == null ? '' : String(value);
    row.appendChild(cell);
    return cell;
  }

  function renderDebts(orders) {
    clearDebts();
    currentOrders = Array.isArray(orders) ? orders : [];

    currentOrders.forEach(function (order) {
      const row = document.createElement('tr');
      if (!order.canSend) row.className = 'not-sendable';

      const checkCell = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.orderNumber = String(order.orderNumber || '');
      checkbox.setAttribute('aria-label', 'Vybrat objednávku ' + String(order.orderNumber || ''));
      checkbox.checked = Boolean(order.canSend);
      checkbox.disabled = !order.canSend;
      checkbox.addEventListener('change', refreshSummary);
      checkCell.appendChild(checkbox);
      row.appendChild(checkCell);

      addCell(row, order.orderNumber || '—');

      const nameCell = addCell(row, order.parentName || '—');
      if (order.itemsSummary) {
        const details = document.createElement('span');
        details.className = 'order-detail';
        details.textContent = order.itemsSummary;
        nameCell.appendChild(details);
      }

      addCell(row, formatMoney(order.debt), 'amount');
      addCell(row, order.email || '—', 'email');
      addCell(row, order.reason || (order.canSend ? 'Připraveno k upomínce' : 'Nelze odeslat'));
      debtsBody.appendChild(row);
    });

    debtsSection.style.display = 'block';
    selectAll.disabled = !currentOrders.some(function (order) { return order.canSend; });
    refreshSummary();

    if (!currentOrders.length) {
      showStatus('success', 'Pro vybranou soutěž nebyly nalezeny žádné neuhrazené objednávky.');
    }
  }

  loadCompetitionsBtn.addEventListener('click', async function () {
    clearStatus();
    clearDebts();
    competitionSelect.disabled = true;
    loadDebtsBtn.disabled = true;
    setBusy(true, 'competitions');
    showStatus('info', 'Načítám seznam soutěží z Google Sheets…');

    try {
      const result = await runServerAction('remindersLoad', {}, 45000);
      if (!result.ok) throw new Error(result.message || 'Soutěže se nepodařilo načíst.');

      const previous = competitionSelect.value;
      competitionSelect.textContent = '';
      const competitions = Array.isArray(result.competitions) ? result.competitions : [];
      if (!competitions.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'V tabulce nejsou žádné soutěže';
        competitionSelect.appendChild(option);
      } else {
        competitions.forEach(function (competition) {
          const option = document.createElement('option');
          option.value = competition;
          option.textContent = competition;
          competitionSelect.appendChild(option);
        });
        if (competitions.indexOf(previous) !== -1) competitionSelect.value = previous;
      }

      competitionSelect.disabled = !competitions.length;
      loadDebtsBtn.disabled = !competitions.length;
      showStatus('success', 'Načteno soutěží: ' + competitions.length + '. Vyber soutěž a klikni na „Výpis pohledávek“.');
    } catch (error) {
      showStatus('error', error.message || 'Soutěže se nepodařilo načíst.');
    } finally {
      setBusy(false);
      competitionSelect.disabled = !competitionSelect.value;
      loadDebtsBtn.disabled = !competitionSelect.value;
    }
  });

  loadDebtsBtn.addEventListener('click', async function () {
    clearStatus();
    clearDebts();
    const competition = competitionSelect.value;
    if (!competition) {
      showStatus('error', 'Nejprve vyber soutěž.');
      return;
    }

    setBusy(true, 'debts');
    showStatus('info', 'Načítám pohledávky a kontroluji zaplacené částky…');

    try {
      const result = await runServerAction('remindersLoad', { competition: competition }, 90000);
      if (!result.ok) throw new Error(result.message || 'Pohledávky se nepodařilo načíst.');
      renderDebts(result.orders || []);
      const eligible = (result.orders || []).filter(function (order) { return order.canSend; }).length;
      showStatus('success', 'Soutěž: ' + competition + '\nPohledávek: ' + (result.orders || []).length + '\nPřipraveno k odeslání: ' + eligible + '.');
    } catch (error) {
      showStatus('error', error.message || 'Pohledávky se nepodařilo načíst.');
    } finally {
      setBusy(false);
      refreshSummary();
    }
  });

  competitionSelect.addEventListener('change', function () {
    clearDebts();
    clearStatus();
    loadDebtsBtn.disabled = busy || !competitionSelect.value;
  });

  passwordInput.addEventListener('input', function () {
    clearDebts();
    clearStatus();
    competitionSelect.textContent = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Po změně hesla načtěte soutěže znovu';
    competitionSelect.appendChild(option);
    competitionSelect.disabled = true;
    loadDebtsBtn.disabled = true;
  });

  selectAll.addEventListener('change', function () {
    debtsBody.querySelectorAll('input[data-order-number]').forEach(function (input) {
      if (!input.disabled) input.checked = selectAll.checked;
    });
    refreshSummary();
  });

  sendBtn.addEventListener('click', async function () {
    clearStatus();
    const selectedOrders = getSelectedOrders();
    if (!selectedOrders.length) {
      showStatus('error', 'Vyber alespoň jednu objednávku.');
      return;
    }

    const selected = currentOrders.filter(function (order) {
      return selectedOrders.indexOf(String(order.orderNumber)) !== -1;
    });
    const selectedTotal = selected.reduce(function (sum, order) { return sum + (Number(order.debt) || 0); }, 0);
    const confirmed = window.confirm(
      'Odeslat upomínku ' + selected.length + ' klientům?\n' +
      'Celková částka: ' + formatMoney(selectedTotal) + '\n\n' +
      'Server ještě před odesláním znovu ověří úhrady a odeslání fotografií.'
    );
    if (!confirmed) return;

    setBusy(true, 'send');
    showStatus('info', 'Odesílám vybrané upomínky. Tato operace může chvíli trvat. Neobnovuj stránku.');
    try {
      const result = await runServerAction('remindersSend', {
        competition: competitionSelect.value,
        selected_orders_json: JSON.stringify(selectedOrders)
      }, 360000);

      if (!result.ok) throw new Error(result.message || 'Odesílání se nepodařilo dokončit.');

      const results = Array.isArray(result.results) ? result.results : [];
      debtsBody.querySelectorAll('input[data-order-number]').forEach(function (input) {
        if (selectedOrders.indexOf(input.dataset.orderNumber) !== -1) input.checked = false;
      });
      const lines = [
        'Výsledek odeslání:',
        'Úspěšně odesláno: ' + (result.sentCount || 0),
        'Přeskočeno: ' + (result.skippedCount || 0),
        'Chyby: ' + (result.errorCount || 0)
      ];
      results.forEach(function (item) {
        lines.push('Objednávka ' + item.orderNumber + ' (' + (item.email || 'bez e-mailu') + '): ' + (item.message || item.state || 'zpracováno'));
      });
      showStatus(result.errorCount > 0 ? 'error' : 'success', lines.join('\n'));
    } catch (error) {
      showStatus('error', (error.message || 'Odeslání se nepodařilo ověřit.') + '\nPokud není jasné, zda e-maily odešly, zkontroluj list „Odeslané upomínky“ před dalším pokusem.');
    } finally {
      setBusy(false);
      refreshSummary();
    }
  });

  clearDebts();
})();
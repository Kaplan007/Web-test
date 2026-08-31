document.addEventListener('DOMContentLoaded', function () {
  const PAYMENT_IBAN = 'CZ9203000000000332726377';
  const vsInput = document.getElementById('vs');
  const amountInput = document.getElementById('amount');
  const generateBtn = document.getElementById('generateBtn');
  const qrResult = document.getElementById('qrResult');
  const qrCode = document.getElementById('qrCode');
  const error = document.getElementById('error');
  const qrFallback = document.getElementById('qrFallback');

  vsInput.addEventListener('input', function () {
    vsInput.value = vsInput.value.replace(/\D/g, '').slice(0, 4);
  });

  function showError(message) {
    error.textContent = message;
    error.style.display = 'block';
    error.setAttribute('role', 'alert');
  }

  generateBtn.addEventListener('click', function () {
    const vs = vsInput.value.trim();
    const amount = amountInput.value.trim();

    error.style.display = 'none';
    error.textContent = '';
    qrFallback.textContent = '';

    if (!/^\d{4}$/.test(vs)) {
      showError('Zadejte přesně 4místný variabilní symbol.');
      qrResult.style.display = 'none';
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 1000000) {
      showError('Zadejte platnou částku.');
      qrResult.style.display = 'none';
      return;
    }

    const amountFormatted = numericAmount.toFixed(2);
    const spd = 'SPD*1.0*ACC:' + PAYMENT_IBAN + '*AM:' + amountFormatted + '*CC:CZK*X-VS:' + vs;

    document.getElementById('resultVS').textContent = vs;
    document.getElementById('resultAmount').textContent = numericAmount.toLocaleString('cs-CZ');
    qrCode.innerHTML = '';

    if (typeof window.QRCode === 'function') {
      try {
        new window.QRCode(qrCode, { text: spd, width: 280, height: 280 });
      } catch (qrError) {
        console.error(qrError);
        qrFallback.textContent = 'QR kód se nepodařilo vytvořit. Platební údaje výše jsou stále platné.';
      }
    } else {
      qrFallback.textContent = 'QR knihovna se nepodařila načíst. Platební údaje výše jsou stále platné.';
    }

    qrResult.style.display = 'block';
  });
});

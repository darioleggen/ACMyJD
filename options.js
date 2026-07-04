/**
 * Logica della pagina Opzioni.
 * Legge/salva l'URL base di JDownloader in chrome.storage.sync e permette
 * di verificare la connessione tramite l'endpoint CNL2 /jdcheck.js.
 */

import { getJdConfig, REQUEST_TIMEOUT_MS } from './config.js';

const elBaseUrl = document.getElementById('base-url');
const elSave    = document.getElementById('btn-save');
const elTest    = document.getElementById('btn-test');
const elStatus  = document.getElementById('status');

// ── Caricamento valore corrente ───────────────────────────────────────────────

async function init() {
  const config = await getJdConfig();
  elBaseUrl.value = config.baseUrl;
}

init();

// ── Validazione input ─────────────────────────────────────────────────────────

/**
 * Legge e valida il campo URL.
 * @returns {string|null}  URL normalizzato (senza slash finale), o null se non valido
 */
function readForm() {
  const raw = elBaseUrl.value.trim().replace(/\/+$/, '');

  if (!raw) {
    showStatus('Inserisci l\'URL di JDownloader.', false);
    return null;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    showStatus('URL non valido. Esempio: http://192.168.1.15:9666', false);
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    showStatus('L\'URL deve iniziare con http:// o https://', false);
    return null;
  }

  return raw;
}

// ── Salvataggio ───────────────────────────────────────────────────────────────

elSave.addEventListener('click', async () => {
  const baseUrl = readForm();
  if (!baseUrl) return;

  await chrome.storage.sync.set({ baseUrl });
  // Rimuove le chiavi del vecchio formato host/porta per completare la migrazione
  await chrome.storage.sync.remove(['host', 'port']);

  showStatus('Impostazioni salvate ✓', true);
});

// ── Prova connessione ─────────────────────────────────────────────────────────

elTest.addEventListener('click', async () => {
  const baseUrl = readForm();
  if (!baseUrl) return;

  showStatus('Connessione in corso…', true);

  try {
    // /jdcheck.js è l'endpoint di ping CNL2: risponde con un piccolo JS
    // contenente la stringa "jdownloader" se JD è attivo
    const res = await fetch(`${baseUrl}/jdcheck.js`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();

    if (res.ok && /jdownloader/i.test(text)) {
      showStatus('JDownloader raggiungibile ✓', true);
    } else {
      showStatus(`Il server risponde ma non sembra JDownloader (HTTP ${res.status}).`, false);
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      showStatus('Timeout: nessuna risposta dal server.', false);
    } else {
      showStatus('Connessione fallita: host irraggiungibile o porta chiusa.', false);
    }
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * @param {string}  message
 * @param {boolean} ok  true = verde, false = rosso
 */
function showStatus(message, ok) {
  elStatus.textContent = message;
  elStatus.className   = ok ? 'ok' : 'err';
}

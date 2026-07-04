/**
 * Logica della pagina Opzioni.
 * Legge/salva host e porta in chrome.storage.sync e permette di verificare
 * la connessione a JDownloader tramite l'endpoint CNL2 /jdcheck.js.
 */

import { DEFAULT_CONFIG, REQUEST_TIMEOUT_MS } from './config.js';

const elHost   = document.getElementById('host');
const elPort   = document.getElementById('port');
const elSave   = document.getElementById('btn-save');
const elTest   = document.getElementById('btn-test');
const elStatus = document.getElementById('status');

// ── Caricamento valori correnti ───────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  elHost.value = stored.host;
  elPort.value = stored.port;
}

init();

// ── Validazione input ─────────────────────────────────────────────────────────

/**
 * Legge e valida i campi del form.
 * @returns {{host: string, port: number}|null}  null se non validi
 */
function readForm() {
  const host = elHost.value.trim();
  const port = parseInt(elPort.value, 10);

  if (!host) {
    showStatus('Inserisci un indirizzo IP o hostname.', false);
    return null;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showStatus('Porta non valida (1–65535).', false);
    return null;
  }
  return { host, port };
}

// ── Salvataggio ───────────────────────────────────────────────────────────────

elSave.addEventListener('click', async () => {
  const values = readForm();
  if (!values) return;

  await chrome.storage.sync.set(values);
  showStatus('Impostazioni salvate ✓', true);
});

// ── Prova connessione ─────────────────────────────────────────────────────────

elTest.addEventListener('click', async () => {
  const values = readForm();
  if (!values) return;

  showStatus('Connessione in corso…', true);

  try {
    // /jdcheck.js è l'endpoint di ping CNL2: risponde con un piccolo JS
    // contenente la stringa "jdownloader" se JD è attivo
    const res = await fetch(`http://${values.host}:${values.port}/jdcheck.js`, {
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

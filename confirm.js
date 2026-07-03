/**
 * Logica del popup di conferma/esito.
 * Legge i link pendenti da session storage, mostra la UI e gestisce l'invio.
 */

import { sendPlainLinks } from './jdApi.js';

// ── Riferimenti DOM ──────────────────────────────────────────────────────────
const elSubtitle      = document.getElementById('subtitle');
const elLinkContainer = document.getElementById('link-container');
const elPackageName   = document.getElementById('package-name');
const elBtnCancel     = document.getElementById('btn-cancel');
const elBtnSend       = document.getElementById('btn-send');
const elOverlay       = document.getElementById('status-overlay');
const elIconWrap      = document.getElementById('status-icon-wrap');
const elMessage       = document.getElementById('status-message');
const elSub           = document.getElementById('status-sub');
const elOverActions   = document.getElementById('overlay-actions');

// ── Dati caricati dallo storage ──────────────────────────────────────────────
let pendingLinks = [];

// ── Inizializzazione ─────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.session.get(['pendingLinks']);

  // Pulisce subito i dati dalla sessione dopo averli letti
  await chrome.storage.session.remove(['pendingLinks']);

  pendingLinks = data.pendingLinks ?? [];

  renderLinkList();
}

init();

// ── Rendering UI ─────────────────────────────────────────────────────────────

function renderLinkList() {
  if (pendingLinks.length === 0) {
    // Nessun link trovato: mostra errore e disabilita il tasto Invia
    elSubtitle.textContent = 'Nessun link trovato.';
    elLinkContainer.innerHTML =
      `<div class="error-box">
         Non è stato trovato nessun URL nel testo selezionato.<br>
         Assicurati di selezionare testo che contenga almeno un link HTTP/HTTPS.
       </div>`;
    elBtnSend.disabled = true;
    return;
  }

  const n = pendingLinks.length;
  elSubtitle.textContent = `${n} link ${n === 1 ? 'trovato' : 'trovati'}:`;

  const items = pendingLinks
    .map(url => `<div class="link-item">${escapeHtml(url)}</div>`)
    .join('');
  elLinkContainer.innerHTML = `<div class="link-list">${items}</div>`;
}

// ── Gestione pulsanti ────────────────────────────────────────────────────────

elBtnCancel.addEventListener('click', () => window.close());

elBtnSend.addEventListener('click', async () => {
  if (pendingLinks.length === 0) return;

  const packageName = elPackageName.value.trim();

  setOverlay('sending');

  try {
    await sendPlainLinks(pendingLinks, packageName);

    const n = pendingLinks.length;
    setOverlay('success',
      '✓',
      'Link inviati con successo!',
      `${n} link ${n === 1 ? 'aggiunto' : 'aggiunti'} alla coda di JDownloader.`
    );

    // Chiusura automatica dopo 2,5 secondi
    setTimeout(() => window.close(), 2500);

  } catch (err) {
    const reason = friendlyError(err);
    setOverlay('error', '✕', 'Invio fallito', reason);

    // Pulsanti nell'overlay di errore: Riprova e Chiudi
    elOverActions.innerHTML = '';

    const btnRetry = document.createElement('button');
    btnRetry.className   = 'btn-send';
    btnRetry.textContent = 'Riprova';
    btnRetry.addEventListener('click', () => {
      // Torna alla vista principale e ripristina i pulsanti
      document.body.classList.remove('overlay-active');
      elOverActions.innerHTML = '';
    });

    const btnClose = document.createElement('button');
    btnClose.className   = 'btn-cancel';
    btnClose.textContent = 'Chiudi';
    btnClose.addEventListener('click', () => window.close());

    elOverActions.append(btnClose, btnRetry);
  }
});

// ── Helper: overlay stato ────────────────────────────────────────────────────

/**
 * Mostra l'overlay con lo stato richiesto.
 *
 * @param {'sending'|'success'|'error'} type
 * @param {string} [icon]    - Carattere o testo icona (non usato in 'sending')
 * @param {string} [message] - Titolo principale
 * @param {string} [sub]     - Dettaglio sotto il titolo
 */
function setOverlay(type, icon = '', message = '', sub = '') {
  // Rimuove classi di stile precedenti
  elOverlay.className = '';

  if (type === 'sending') {
    elIconWrap.innerHTML = '<div class="spinner"></div>';
    elMessage.textContent = 'Invio in corso…';
    elSub.textContent     = '';
  } else {
    elIconWrap.textContent = icon;
    elMessage.textContent  = message;
    elSub.textContent      = sub;
    elOverlay.classList.add(type === 'success' ? 'overlay-success' : 'overlay-error');
  }

  document.body.classList.add('overlay-active');
}

// ── Helper: messaggio errore leggibile ───────────────────────────────────────

function friendlyError(err) {
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    return 'Timeout: JDownloader non ha risposto entro il tempo limite.\nVerifica che il container Docker sia avviato.';
  }
  if (err.name === 'TypeError') {
    // fetch() lancia TypeError per errori di rete (host irraggiungibile, rifiuto connessione)
    return `JDownloader non è raggiungibile all'indirizzo configurato.\nVerifica che il container sia avviato e che la porta 9666 sia aperta.`;
  }
  return err.message ?? 'Errore sconosciuto.';
}

// ── Helper: escape HTML ──────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

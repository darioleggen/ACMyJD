/**
 * Logica del popup di conferma/esito.
 * Supporta due modalità distinte, determinate dai dati in session storage:
 *   - 'links'   (Fase 1): link URL plain → chiama sendPlainLinks()
 *   - 'crypted' (Fase 2): container CNL2 crittografati → chiama sendCryptedLinks()
 */

import { sendPlainLinks, sendCryptedLinks } from './jdApi.js';

// ── Riferimenti DOM ──────────────────────────────────────────────────────────
const elSubtitle      = document.getElementById('subtitle');
const elLinkContainer = document.getElementById('link-container');
const elPackageField  = document.getElementById('package-field');
const elPackageName   = document.getElementById('package-name');
const elBtnCancel     = document.getElementById('btn-cancel');
const elBtnSend       = document.getElementById('btn-send');
const elOverlay       = document.getElementById('status-overlay');
const elIconWrap      = document.getElementById('status-icon-wrap');
const elMessage       = document.getElementById('status-message');
const elSub           = document.getElementById('status-sub');
const elOverActions   = document.getElementById('overlay-actions');

// ── Stato ────────────────────────────────────────────────────────────────────

/** @type {'links'|'crypted'} */
let mode = 'links';

/** @type {string[]} */
let pendingLinks = [];

/** @type {{crypted:string, jk:string, passwords:string}[]} */
let pendingCryptedBlocks = [];

// ── Inizializzazione ─────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.session.get([
    'pendingLinks', 'pendingCryptedBlocks', 'pendingPackageName',
  ]);

  await chrome.storage.session.remove([
    'pendingLinks', 'pendingCryptedBlocks', 'pendingPackageName',
  ]);

  // La presenza di 'pendingCryptedBlocks' (anche vuoto) indica la modalità Fase 2
  if (data.pendingCryptedBlocks !== undefined) {
    mode = 'crypted';
    pendingCryptedBlocks = data.pendingCryptedBlocks ?? [];
    renderCryptedList();
  } else {
    mode = 'links';
    pendingLinks = data.pendingLinks ?? [];

    // Pre-compila il nome pacchetto se il background lo ha estratto dalla pagina
    if (data.pendingPackageName) {
      elPackageName.value = data.pendingPackageName;
    }

    renderLinkList();
  }
}

init();

// ── Rendering — Fase 1 (link plain) ─────────────────────────────────────────

function renderLinkList() {
  if (pendingLinks.length === 0) {
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

// ── Rendering — Fase 2 (container crittografati) ──────────────────────────────

function renderCryptedList() {
  // Il campo "pacchetto" non è rilevante per /flash/addcrypted2
  elPackageField.style.display = 'none';

  if (pendingCryptedBlocks.length === 0) {
    elSubtitle.textContent = 'Nessun container trovato.';
    elLinkContainer.innerHTML =
      `<div class="error-box">
         Nessun container crittografato rilevato in questa pagina.<br>
         La pagina non sembra contenere blocchi CNL2 (input <code>crypted</code>/<code>jk</code>) nel DOM.
       </div>`;
    elBtnSend.disabled = true;
    return;
  }

  if (pendingCryptedBlocks.length === 1) {
    elSubtitle.textContent = '1 container crittografato trovato:';
    elLinkContainer.innerHTML =
      `<div class="crypted-info">
         È stato rilevato <strong>1 container crittografato</strong> (formato CNL2) nella pagina.<br>
         Vuoi inviarlo a JDownloader?
       </div>`;
    return;
  }

  // Più blocchi: lista con checkbox (tutti selezionati di default)
  const n = pendingCryptedBlocks.length;
  elSubtitle.textContent = `${n} container trovati — seleziona quali inviare:`;

  const items = pendingCryptedBlocks.map((_, i) =>
    `<label class="crypted-item">
       <input type="checkbox" class="crypted-check" data-index="${i}" checked>
       <span>Opzione ${i + 1}</span>
     </label>`
  ).join('');
  elLinkContainer.innerHTML = `<div class="crypted-list">${items}</div>`;

  // Disabilita "Invia" se l'utente deseleziona tutto
  elLinkContainer.addEventListener('change', () => {
    const anyChecked = elLinkContainer.querySelector('.crypted-check:checked') !== null;
    elBtnSend.disabled = !anyChecked;
  });
}

// ── Gestione pulsanti ────────────────────────────────────────────────────────

elBtnCancel.addEventListener('click', () => window.close());

elBtnSend.addEventListener('click', async () => {
  if (mode === 'crypted') {
    await handleCryptedSend();
  } else {
    await handlePlainSend();
  }
});

// ── Handler invio — Fase 1 ───────────────────────────────────────────────────

async function handlePlainSend() {
  if (pendingLinks.length === 0) return;

  const packageName = elPackageName.value.trim();
  setOverlay('sending');

  try {
    await sendPlainLinks(pendingLinks, packageName);

    const n = pendingLinks.length;
    setOverlay('success', '✓', 'Link inviati con successo!',
      `${n} link ${n === 1 ? 'aggiunto' : 'aggiunti'} alla coda di JDownloader.`
    );
    setTimeout(() => window.close(), 2500);

  } catch (err) {
    showErrorOverlay(err);
  }
}

// ── Handler invio — Fase 2 ───────────────────────────────────────────────────

async function handleCryptedSend() {
  let selectedBlocks;

  if (pendingCryptedBlocks.length === 1) {
    selectedBlocks = [pendingCryptedBlocks[0]];
  } else {
    const checks = document.querySelectorAll('.crypted-check:checked');
    selectedBlocks = Array.from(checks).map(cb =>
      pendingCryptedBlocks[parseInt(cb.dataset.index, 10)]
    );
  }

  if (selectedBlocks.length === 0) return;

  setOverlay('sending');

  try {
    await sendCryptedLinks(selectedBlocks);

    const n = selectedBlocks.length;
    setOverlay('success', '✓', 'Container inviati!',
      `${n} container ${n === 1 ? 'inviato' : 'inviati'} alla coda di JDownloader.`
    );
    setTimeout(() => window.close(), 2500);

  } catch (err) {
    showErrorOverlay(err);
  }
}

// ── Helper: overlay stato ────────────────────────────────────────────────────

/**
 * @param {'sending'|'success'|'error'} type
 * @param {string} [icon]
 * @param {string} [message]
 * @param {string} [sub]
 */
function setOverlay(type, icon = '', message = '', sub = '') {
  elOverlay.className = '';

  if (type === 'sending') {
    elIconWrap.innerHTML   = '<div class="spinner"></div>';
    elMessage.textContent  = 'Invio in corso…';
    elSub.textContent      = '';
  } else {
    elIconWrap.textContent = icon;
    elMessage.textContent  = message;
    elSub.textContent      = sub;
    elOverlay.classList.add(type === 'success' ? 'overlay-success' : 'overlay-error');
  }

  document.body.classList.add('overlay-active');
}

// ── Helper: overlay errore con pulsanti Riprova/Chiudi ───────────────────────

function showErrorOverlay(err) {
  setOverlay('error', '✕', 'Invio fallito', friendlyError(err));

  elOverActions.innerHTML = '';

  const btnRetry = document.createElement('button');
  btnRetry.className   = 'btn-send';
  btnRetry.textContent = 'Riprova';
  btnRetry.addEventListener('click', () => {
    document.body.classList.remove('overlay-active');
    elOverActions.innerHTML = '';
  });

  const btnClose = document.createElement('button');
  btnClose.className   = 'btn-cancel';
  btnClose.textContent = 'Chiudi';
  btnClose.addEventListener('click', () => window.close());

  elOverActions.append(btnClose, btnRetry);
}

// ── Helper: messaggio errore leggibile ───────────────────────────────────────

function friendlyError(err) {
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    return 'Timeout: JDownloader non ha risposto entro il tempo limite.\nVerifica che il container Docker sia avviato.';
  }
  if (err.name === 'TypeError') {
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

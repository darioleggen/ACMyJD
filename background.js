/**
 * Service worker principale (MV3).
 * Gestisce le voci del menu contestuale e apre il popup di conferma.
 */

import { extractLinks } from './linkUtils.js';

// Dimensioni della finestra popup di conferma
const POPUP_W = 490;
const POPUP_H = 430;

// --- Inizializzazione menu contestuale ---

chrome.runtime.onInstalled.addListener(() => {
  // Voce attiva quando si fa tasto destro direttamente su un link
  chrome.contextMenus.create({
    id: 'jd-send-link',
    title: 'Invia a JDownloader',
    contexts: ['link'],
  });

  // Voce attiva quando c'è del testo selezionato
  chrome.contextMenus.create({
    id: 'jd-send-selection',
    title: 'Invia link selezionati a JDownloader',
    contexts: ['selection'],
  });
});

// --- Gestione click ---

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let links = [];

  if (info.menuItemId === 'jd-send-link' && info.linkUrl) {
    links = [info.linkUrl];
  } else if (info.menuItemId === 'jd-send-selection' && info.selectionText) {
    links = extractLinks(info.selectionText);
  }

  await openConfirmPopup(links);
});

// --- Apertura popup di conferma ---

/**
 * Salva i dati pendenti in session storage (dati volatili, spariscono alla chiusura
 * del browser) e apre la finestra popup di conferma.
 *
 * @param {string[]} links - URL da confermare
 */
async function openConfirmPopup(links) {
  // chrome.storage.session: dati accessibili a tutte le pagine dell'estensione,
  // cancellati automaticamente alla chiusura del browser
  await chrome.storage.session.set({ pendingLinks: links });

  chrome.windows.create({
    url: chrome.runtime.getURL('confirm.html'),
    type: 'popup',
    width: POPUP_W,
    height: POPUP_H,
    focused: true,
  });
}

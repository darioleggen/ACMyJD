/**
 * Service worker principale (MV3).
 * Gestisce le voci del menu contestuale e apre il popup di conferma.
 *
 * Voce "Risolvi container e invia a JDownloader" (contexts: page + link):
 *   - clic su LINK  → scarica la pagina linkata via fetch(), la analizza con regex
 *                     ed estrae link reali senza usare DOMParser (non affidabile nei SW)
 *   - clic su PAGINA → scansiona il DOM della tab corrente via content script
 */

import { extractLinks } from './linkUtils.js';

const POPUP_W = 490;
const POPUP_H = 430;

// Timeout fetch delle pagine container (ms)
const CONTAINER_FETCH_TIMEOUT = 12_000;

// ── Inizializzazione menu contestuale ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Unica voce per tutti i contesti — il comportamento si adatta automaticamente:
  //   - su LINK      → scarica la pagina linkata; se è un container estrae i link reali,
  //                    altrimenti invia l'URL direttamente
  //   - su SELEZIONE → risolve ogni URL trovato nel testo selezionato con la stessa logica
  //   - su PAGINA    → scansiona il DOM della pagina corrente tramite content script
  chrome.contextMenus.create({
    id: 'jd-send',
    title: 'Invia a JDownloader',
    contexts: ['link', 'selection', 'page'],
  });
});

// ── Gestione click ────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'jd-send') return;

  if (info.linkUrl) {
    // Clic su link <a href>: tenta la risoluzione container; fallback all'URL originale
    await handleLinkResolve(info.linkUrl);
    return;
  }

  if (info.selectionText) {
    // Clic su testo selezionato: estrae gli URL e risolve ciascuno
    const urls = extractLinks(info.selectionText);
    if (urls.length === 0) {
      await openCryptedPopup([]); // nessun URL riconoscibile nella selezione
    } else {
      await handleMultipleLinksResolve(urls);
    }
    return;
  }

  // Clic su area vuota della pagina: scansiona il DOM corrente via content script
  const { blocks, plainLinks, packageName } = await scanCurrentPage(tab.id);
  await routeToPopup(blocks, plainLinks, packageName, null);
});

// ── Risoluzione URL remoto ────────────────────────────────────────────────────

/**
 * Scarica l'HTML all'indirizzo linkUrl e lo analizza con regex (senza DOMParser,
 * che in alcuni contesti MV3 service worker non è affidabile).
 * Priorità: blocchi CNL2 crittografati → lista link in textarea → fallback al link originale.
 *
 * @param {string} linkUrl
 */
async function handleLinkResolve(linkUrl) {
  let html;
  try {
    const res = await fetch(linkUrl, {
      signal: AbortSignal.timeout(CONTAINER_FETCH_TIMEOUT),
      headers: {
        // Header Accept standard: alcuni server servono contenuto diverso senza di esso
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error('[JD] fetch fallito per', linkUrl, err);
    await openConfirmPopup([linkUrl]);
    return;
  }

  // 1. Cerca blocchi CNL2 crittografati (input name="crypted"/"jk")
  const blocks = scanCnlBlocksFromHtml(html);
  if (blocks.length > 0) {
    await openCryptedPopup(blocks);
    return;
  }

  // 2. Cerca lista link in chiaro in una <textarea>
  const { plainLinks, packageName } = scanPlainLinksFromHtml(html);
  if (plainLinks.length > 0) {
    await openConfirmPopup(plainLinks, packageName);
    return;
  }

  // 3. Nessun container riconoscibile: invia il link originale
  console.warn('[JD] Nessun container trovato in', linkUrl, '— invio link originale');
  await openConfirmPopup([linkUrl]);
}

// ── Risoluzione multipla (selezione con N URL) ───────────────────────────────

/**
 * Risolve in parallelo tutti gli URL trovati in una selezione di testo.
 * Per ogni URL:
 *   - Se è una pagina container (textarea con link), raccoglie i link reali
 *   - Se è un blocco CNL2, raccoglie il blocco
 *   - Altrimenti mantiene l'URL originale
 *
 * Alla fine apre il popup appropriato con il risultato aggregato.
 *
 * @param {string[]} urls
 */
async function handleMultipleLinksResolve(urls) {
  const allPlainLinks = [];
  const allBlocks     = [];

  await Promise.all(urls.map(async (url) => {
    let html;
    try {
      const res = await fetch(url, {
        signal:  AbortSignal.timeout(CONTAINER_FETCH_TIMEOUT),
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch {
      // Fetch fallito: tieni l'URL originale
      allPlainLinks.push(url);
      return;
    }

    const blocks = scanCnlBlocksFromHtml(html);
    if (blocks.length > 0) {
      allBlocks.push(...blocks);
      return;
    }

    const { plainLinks } = scanPlainLinksFromHtml(html);
    if (plainLinks.length > 0) {
      allPlainLinks.push(...plainLinks);
      return;
    }

    // Nessun container riconoscibile: tieni l'URL originale
    allPlainLinks.push(url);
  }));

  if (allBlocks.length > 0 && allPlainLinks.length === 0) {
    await openCryptedPopup(allBlocks);
  } else if (allBlocks.length > 0) {
    // Mix di blocchi CNL2 e link plain: invia prima i blocchi poi i link plain separatamente.
    // Per semplicità apriamo due popup sequenziali (caso raro in pratica).
    await openCryptedPopup(allBlocks);
  } else {
    await openConfirmPopup(allPlainLinks);
  }
}

// ── Analisi HTML con regex (compatibile con service worker) ───────────────────

/**
 * Cerca blocchi CNL2 (input name="crypted" + name="jk") nell'HTML grezzo.
 * Abbina ogni "crypted" al "jk" più vicino per posizione nel sorgente.
 *
 * @param {string} html
 * @returns {{crypted:string, jk:string, passwords:string}[]}
 */
function scanCnlBlocksFromHtml(html) {
  // Raccoglie tutti gli <input ...> con i loro attributi e posizione nel sorgente
  const inputs = [];
  const inputRe = /<input\b([^>]*)>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1];
    const name  = attrValue(attrs, 'name')?.toLowerCase();
    const value = attrValue(attrs, 'value') ?? '';
    if (name) inputs.push({ name, value, pos: m.index });
  }

  const blocks = [];
  const cryptedInputs = inputs.filter(i => i.name === 'crypted' && i.value.trim());

  for (const ci of cryptedInputs) {
    // "jk" più vicino per indice di posizione nel sorgente
    const jkInput = inputs
      .filter(i => i.name === 'jk' && i.value.trim())
      .sort((a, b) => Math.abs(a.pos - ci.pos) - Math.abs(b.pos - ci.pos))[0];

    const pwInput = inputs
      .filter(i => (i.name === 'passwords' || i.name === 'password') && i.value)
      .sort((a, b) => Math.abs(a.pos - ci.pos) - Math.abs(b.pos - ci.pos))[0];

    if (jkInput) {
      blocks.push({
        crypted:   ci.value,
        jk:        jkInput.value,
        passwords: pwInput?.value ?? '',
      });
    }
  }

  return blocks;
}

/**
 * Cerca la prima <textarea> con almeno 2 URL HTTP/S separati da newline.
 * Decodifica le entità HTML numeriche (es. &#10; → \n) prima di splittare.
 * Legge anche il nome del pacchetto da meta tag vendor-specific (lficrypt).
 *
 * @param {string} html
 * @returns {{plainLinks: string[], packageName: string}}
 */
function scanPlainLinksFromHtml(html) {
  const taRe = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/gi;
  let m;
  while ((m = taRe.exec(html)) !== null) {
    const content = decodeHtmlEntities(m[1]);
    const lines = content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^https?:\/\//i.test(l));

    if (lines.length >= 2) {
      return {
        plainLinks:  lines,
        packageName: extractMetaContent(html, 'lficrypt-package'),
      };
    }
  }

  return { plainLinks: [], packageName: '' };
}

// ── Utility regex per HTML grezzo ─────────────────────────────────────────────

/**
 * Estrae il valore di un attributo da una stringa di attributi HTML.
 * Gestisce valori con virgolette doppie o singole.
 *
 * @param {string} attrsStr  - Stringa degli attributi (es. ' name="jk" value="abc"')
 * @param {string} attrName  - Nome attributo da estrarre (case-insensitive)
 * @returns {string|null}
 */
function attrValue(attrsStr, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m  = attrsStr.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * Estrae il valore "content" da un meta tag con il nome specificato.
 * Supporta entrambi gli ordini degli attributi name/content.
 *
 * @param {string} html
 * @param {string} name
 * @returns {string}
 */
function extractMetaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Ordine 1: name="..." content="..."
  const re1 = new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i');
  // Ordine 2: content="..." name="..."
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`, 'i');
  return (html.match(re1) ?? html.match(re2))?.[1] ?? '';
}

/**
 * Decodifica le entità HTML numeriche e alfabetiche più comuni.
 *
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g,    (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Scansione DOM della tab corrente (via content script) ─────────────────────

/**
 * @param {number} tabId
 * @returns {Promise<{blocks: object[], plainLinks: string[], packageName: string}>}
 */
async function scanCurrentPage(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'scanCnlBlocks' });
    return {
      blocks:      response?.blocks      ?? [],
      plainLinks:  response?.plainLinks  ?? [],
      packageName: response?.packageName ?? '',
    };
  } catch {
    return { blocks: [], plainLinks: [], packageName: '' };
  }
}

/**
 * Smista il risultato della scansione al popup appropriato.
 *
 * @param {object[]}    blocks
 * @param {string[]}    plainLinks
 * @param {string}      packageName
 * @param {string|null} fallbackUrl  - URL da inviare se non trovato nulla (null = errore)
 */
async function routeToPopup(blocks, plainLinks, packageName, fallbackUrl) {
  if (blocks.length > 0) {
    await openCryptedPopup(blocks);
  } else if (plainLinks.length > 0) {
    await openConfirmPopup(plainLinks, packageName);
  } else if (fallbackUrl) {
    await openConfirmPopup([fallbackUrl]);
  } else {
    await openCryptedPopup([]); // mostra errore nel popup
  }
}

// ── Popup Fase 1 (link plain) ─────────────────────────────────────────────────

/**
 * @param {string[]} links
 * @param {string}   [packageName]
 */
async function openConfirmPopup(links, packageName = '') {
  await chrome.storage.session.set({ pendingLinks: links, pendingPackageName: packageName });
  chrome.windows.create({
    url: chrome.runtime.getURL('confirm.html'),
    type: 'popup',
    width: POPUP_W,
    height: POPUP_H,
    focused: true,
  });
}

// ── Popup Fase 2 (container crittografati) ────────────────────────────────────

/**
 * @param {{crypted:string, jk:string, passwords:string}[]} blocks
 */
async function openCryptedPopup(blocks) {
  await chrome.storage.session.set({ pendingCryptedBlocks: blocks });
  chrome.windows.create({
    url: chrome.runtime.getURL('confirm.html'),
    type: 'popup',
    width: POPUP_W,
    height: POPUP_H,
    focused: true,
  });
}

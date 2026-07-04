/**
 * Service worker principale (MV3).
 * Unica voce di menu "Invia a JDownloader" per tutti i contesti:
 *   - LINK      → fetch silenzioso della pagina; se è un container estrae i link reali
 *   - SELECTION → risolve ogni URL nel testo selezionato con la stessa logica
 *   - PAGE      → scansiona il DOM della tab corrente via content script
 *
 * I link estratti vengono raggruppati per hostname: se ci sono più hoster il
 * popup mostra una checkbox per hoster così l'utente può scegliere quali inviare.
 */

import { extractLinks } from './linkUtils.js';

const POPUP_W = 490;
const POPUP_H = 430;
const CONTAINER_FETCH_TIMEOUT = 12_000;

// ── Menu contestuale ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
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
    await handleLinkResolve(info.linkUrl);
    return;
  }

  if (info.selectionText) {
    const urls = extractLinks(info.selectionText);
    if (urls.length === 0) {
      await openCryptedPopup([]); // nessun URL riconoscibile nella selezione
    } else {
      await handleMultipleLinksResolve(urls);
    }
    return;
  }

  // Clic su area vuota: scansiona il DOM della tab corrente
  const { blocks, plainLinks, packageName } = await scanCurrentPage(tab.id);
  await routeToPopup(blocks, plainLinks, packageName);
});

// ── Risoluzione URL singolo ───────────────────────────────────────────────────

/**
 * Scarica la pagina all'indirizzo linkUrl e la analizza.
 * Priorità: blocchi CNL2 → link raggruppati per hoster → URL originale (fallback).
 *
 * @param {string} linkUrl
 */
async function handleLinkResolve(linkUrl) {
  let html;
  try {
    const res = await fetch(linkUrl, {
      signal:  AbortSignal.timeout(CONTAINER_FETCH_TIMEOUT),
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error('[JD] fetch fallito per', linkUrl, err);
    await openConfirmPopup([linkUrl]);
    return;
  }

  const blocks = scanCnlBlocksFromHtml(html);
  if (blocks.length > 0) {
    await openCryptedPopup(blocks);
    return;
  }

  const { linkGroups, packageName } = scanPlainLinksFromHtml(html);
  if (linkGroups.length > 0) {
    await routeGroupsToPopup(linkGroups, packageName);
    return;
  }

  // Nessun container riconoscibile: invia il link originale
  console.warn('[JD] Nessun container in', linkUrl, '— invio link originale');
  await openConfirmPopup([linkUrl]);
}

// ── Risoluzione URL multipli (contesto selezione) ─────────────────────────────

/**
 * Risolve in parallelo tutti gli URL e aggrega i risultati per hostname.
 * I link di ogni hoster vengono cumulati se lo stesso hostname appare in
 * più pagine container distinte.
 *
 * @param {string[]} urls
 */
async function handleMultipleLinksResolve(urls) {
  /** @type {Map<string, string[]>} hostname → links */
  const hostnameMap = new Map();
  const allBlocks   = [];

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
      // Fetch fallito: tratta l'URL originale come link diretto
      addUrlToMap(hostnameMap, url);
      return;
    }

    const blocks = scanCnlBlocksFromHtml(html);
    if (blocks.length > 0) {
      allBlocks.push(...blocks);
      return;
    }

    const { linkGroups } = scanPlainLinksFromHtml(html);
    if (linkGroups.length > 0) {
      for (const { hostname, links } of linkGroups) {
        if (!hostnameMap.has(hostname)) hostnameMap.set(hostname, []);
        hostnameMap.get(hostname).push(...links);
      }
      return;
    }

    // Nessun container: tieni il link originale
    addUrlToMap(hostnameMap, url);
  }));

  if (allBlocks.length > 0) {
    await openCryptedPopup(allBlocks);
    return;
  }

  const linkGroups = Array.from(hostnameMap, ([hostname, links]) => ({ hostname, links }));
  await routeGroupsToPopup(linkGroups, '');
}

/** @param {Map<string,string[]>} map @param {string} url */
function addUrlToMap(map, url) {
  try {
    const hostname = new URL(url).hostname;
    if (!map.has(hostname)) map.set(hostname, []);
    map.get(hostname).push(url);
  } catch {}
}

// ── Routing link raggruppati ──────────────────────────────────────────────────

/**
 * Con un solo hoster usa il popup Fase 1 (lista piatta, nessuna scelta da fare).
 * Con più hoster apre il popup di selezione per hoster.
 *
 * @param {{hostname:string, links:string[]}[]} linkGroups
 * @param {string} packageName
 */
async function routeGroupsToPopup(linkGroups, packageName) {
  if (linkGroups.length === 0) {
    await openCryptedPopup([]);
  } else if (linkGroups.length === 1) {
    await openConfirmPopup(linkGroups[0].links, packageName);
  } else {
    await openGroupedPopup(linkGroups, packageName);
  }
}

// ── Scansione DOM tab corrente (contesto pagina) ──────────────────────────────

/**
 * @param {number} tabId
 * @returns {Promise<{blocks:object[], plainLinks:string[], packageName:string}>}
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
 * Smista il risultato della scansione DOM al popup appropriato.
 *
 * @param {object[]} blocks
 * @param {string[]} plainLinks
 * @param {string}   packageName
 */
async function routeToPopup(blocks, plainLinks, packageName) {
  if (blocks.length > 0) {
    await openCryptedPopup(blocks);
    return;
  }
  if (plainLinks.length > 0) {
    const linkGroups = groupByHostname(plainLinks);
    await routeGroupsToPopup(linkGroups, packageName);
    return;
  }
  await openCryptedPopup([]); // nessun contenuto trovato → popup di errore
}

// ── Analisi HTML con regex ────────────────────────────────────────────────────

/**
 * Cerca blocchi CNL2 crittografati (input name="crypted"/"jk") nell'HTML grezzo.
 *
 * @param {string} html
 * @returns {{crypted:string, jk:string, passwords:string}[]}
 */
function scanCnlBlocksFromHtml(html) {
  const inputs   = [];
  const inputRe  = /<input\b([^>]*)>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1];
    const name  = attrValue(attrs, 'name')?.toLowerCase();
    const value = attrValue(attrs, 'value') ?? '';
    if (name) inputs.push({ name, value, pos: m.index });
  }

  const blocks = [];
  for (const ci of inputs.filter(i => i.name === 'crypted' && i.value.trim())) {
    const nearest = (name) => inputs
      .filter(i => i.name === name && i.value.trim())
      .sort((a, b) => Math.abs(a.pos - ci.pos) - Math.abs(b.pos - ci.pos))[0];

    const jkEl = nearest('jk');
    const pwEl = nearest('passwords') ?? nearest('password');

    if (jkEl) {
      blocks.push({ crypted: ci.value, jk: jkEl.value, passwords: pwEl?.value ?? '' });
    }
  }
  return blocks;
}

/**
 * Cerca la prima <textarea> con ≥2 URL HTTP/S separati da newline
 * e restituisce i link raggruppati per hostname.
 *
 * @param {string} html
 * @returns {{linkGroups:{hostname:string,links:string[]}[], packageName:string}}
 */
function scanPlainLinksFromHtml(html) {
  const taRe = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/gi;
  let m;
  while ((m = taRe.exec(html)) !== null) {
    const content = decodeHtmlEntities(m[1]);
    const lines   = content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^https?:\/\//i.test(l));

    if (lines.length >= 2) {
      return {
        linkGroups:  groupByHostname(lines),
        packageName: extractMetaContent(html, 'lficrypt-package') || extractPageTitle(html),
      };
    }
  }
  return { linkGroups: [], packageName: '' };
}

// ── Raggruppamento per hostname ───────────────────────────────────────────────

/**
 * Raggruppa un array di URL per hostname, preservando l'ordine di primo incontro.
 *
 * @param {string[]} urls
 * @returns {{hostname:string, links:string[]}[]}
 */
function groupByHostname(urls) {
  const map = new Map();
  for (const url of urls) {
    try {
      const h = new URL(url).hostname;
      if (!map.has(h)) map.set(h, []);
      map.get(h).push(url);
    } catch {}
  }
  return Array.from(map, ([hostname, links]) => ({ hostname, links }));
}

// ── Utility regex per HTML grezzo ─────────────────────────────────────────────

function attrValue(attrsStr, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m  = attrsStr.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

function extractMetaContent(html, name) {
  // Analizza ogni <meta> tag individualmente per gestire qualsiasi ordine di attributi
  const tagRe = /<meta\b[^>]*>/gi;
  const nameRe = new RegExp(`\\bname=["']${name}["']`, 'i');
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    if (nameRe.test(m[0])) {
      const content = m[0].match(/\bcontent=["']([^"']*)["']/i);
      if (content) return content[1];
    }
  }
  return '';
}

/**
 * Estrae il nome del pacchetto dal tag <title> come fallback.
 * "House Party | LFiCrypt" → "House Party"
 * Rimuove qualsiasi suffisso dopo " | ", " - ", " – " o " — ".
 *
 * @param {string} html
 * @returns {string}
 */
function extractPageTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s*[|–—]\s*.*$/, '').trim();
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g,         (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Popup openers ─────────────────────────────────────────────────────────────

async function openConfirmPopup(links, packageName = '') {
  await chrome.storage.session.set({ pendingLinks: links, pendingPackageName: packageName });
  chrome.windows.create({
    url: chrome.runtime.getURL('confirm.html'),
    type: 'popup', width: POPUP_W, height: POPUP_H, focused: true,
  });
}

async function openCryptedPopup(blocks) {
  await chrome.storage.session.set({ pendingCryptedBlocks: blocks });
  chrome.windows.create({
    url: chrome.runtime.getURL('confirm.html'),
    type: 'popup', width: POPUP_W, height: POPUP_H, focused: true,
  });
}

/**
 * Apre il popup di selezione per hoster.
 *
 * @param {{hostname:string, links:string[]}[]} linkGroups
 * @param {string} packageName
 */
async function openGroupedPopup(linkGroups, packageName = '') {
  await chrome.storage.session.set({ pendingLinkGroups: linkGroups, pendingPackageName: packageName });
  chrome.windows.create({
    url: chrome.runtime.getURL('confirm.html'),
    type: 'popup', width: POPUP_W, height: POPUP_H, focused: true,
  });
}

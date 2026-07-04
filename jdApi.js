/**
 * Modulo di comunicazione con JDownloader via interfaccia CNL2 (ClickNLoad2).
 * Espone due funzioni:
 *   - sendPlainLinks()   — link URL normali → GET /flash/add
 *   - sendCryptedLinks() — container cifrati → POST /flash/addcrypted2
 *
 * L'indirizzo di JDownloader viene letto da chrome.storage.sync a ogni chiamata,
 * così le modifiche fatte nella pagina Opzioni hanno effetto immediato.
 */

import { getJdConfig, REQUEST_TIMEOUT_MS, CNL2_SOURCE } from './config.js';

/**
 * Invia uno o più URL a JDownloader tramite l'endpoint CNL2 plain (/flash/add).
 *
 * @param {string[]} urls        - Array di URL da aggiungere alla coda
 * @param {string}  packageName  - Nome del pacchetto JD (stringa vuota = JD sceglie)
 * @returns {Promise<void>}
 */
export async function sendPlainLinks(urls, packageName = '') {
  if (urls.length === 0) {
    throw new Error('Nessun URL da inviare.');
  }

  const config = await getJdConfig();

  // CNL2 vuole gli URL separati da CRLF come valore del parametro "urls"
  const encodedUrls    = encodeURIComponent(urls.join('\r\n'));
  const encodedPackage = encodeURIComponent(packageName);
  const encodedSource  = encodeURIComponent(CNL2_SOURCE);

  const endpoint =
    `${config.baseUrl}/flash/add` +
    `?urls=${encodedUrls}` +
    `&package=${encodedPackage}` +
    `&source=${encodedSource}`;

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Il server ha risposto con HTTP ${response.status} ${response.statusText}`);
  }
}

/**
 * Invia uno o più blocchi CNL2 crittografati a JDownloader via POST /flash/addcrypted2.
 * Ogni blocco viene spedito in una richiesta separata.
 *
 * @param {{crypted: string, jk: string, passwords?: string}[]} blocks
 * @returns {Promise<void>}
 */
export async function sendCryptedLinks(blocks) {
  if (blocks.length === 0) {
    throw new Error('Nessun container da inviare.');
  }

  const config   = await getJdConfig();
  const endpoint = `${config.baseUrl}/flash/addcrypted2`;

  for (const block of blocks) {
    const body = new URLSearchParams({
      crypted: block.crypted,
      jk:      block.jk,
      source:  CNL2_SOURCE,
    });

    if (block.passwords) {
      body.set('passwords', block.passwords);
    }

    const response = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
      signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Il server ha risposto con HTTP ${response.status} ${response.statusText}`);
    }
  }
}

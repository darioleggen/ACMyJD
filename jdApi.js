/**
 * Modulo di comunicazione con JDownloader via interfaccia CNL2 (ClickNLoad2).
 * Espone due funzioni:
 *   - sendPlainLinks()   — link URL normali → GET /flash/add
 *   - sendCryptedLinks() — container cifrati → POST /flash/addcrypted2
 */

import { JD_CONFIG } from './config.js';

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

  // CNL2 vuole gli URL separati da CRLF come valore del parametro "urls"
  const encodedUrls    = encodeURIComponent(urls.join('\r\n'));
  const encodedPackage = encodeURIComponent(packageName);
  const encodedSource  = encodeURIComponent(JD_CONFIG.cnl2Source);

  const endpoint =
    `${JD_CONFIG.baseUrl}/flash/add` +
    `?urls=${encodedUrls}` +
    `&package=${encodedPackage}` +
    `&source=${encodedSource}`;

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(JD_CONFIG.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Il server ha risposto con HTTP ${response.status} ${response.statusText}`);
  }
}

/**
 * Invia uno o più blocchi CNL2 crittografati a JDownloader via POST /flash/addcrypted2.
 * Ogni blocco viene spedito in una richiesta separata (JD gestisce un blocco per volta).
 *
 * Il parametro "source" è impostato al valore fisso JD_CONFIG.cnl2Source per evitare
 * il popup di conferma "External request from X" di JDownloader.
 *
 * @param {{crypted: string, jk: string, passwords?: string}[]} blocks
 * @returns {Promise<void>}
 */
export async function sendCryptedLinks(blocks) {
  if (blocks.length === 0) {
    throw new Error('Nessun container da inviare.');
  }

  const endpoint = `${JD_CONFIG.baseUrl}/flash/addcrypted2`;

  for (const block of blocks) {
    const body = new URLSearchParams({
      crypted: block.crypted,
      jk:      block.jk,
      source:  JD_CONFIG.cnl2Source,
    });

    // Il campo passwords è opzionale; lo aggiungiamo solo se presente
    if (block.passwords) {
      body.set('passwords', block.passwords);
    }

    const response = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
      signal:  AbortSignal.timeout(JD_CONFIG.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Il server ha risposto con HTTP ${response.status} ${response.statusText}`);
    }
  }
}

/**
 * Modulo di comunicazione con JDownloader via interfaccia CNL2 (ClickNLoad2).
 *
 * Fase 2: aggiungere qui sendCryptedLinks(jk, crypted, passwords)
 * che chiama POST /flash/addcrypted2 con i parametri cifrati degli hoster.
 */

import { JD_CONFIG } from './config.js';

/**
 * Invia uno o più URL a JDownloader tramite l'endpoint CNL2 plain (/flash/add).
 * La richiesta è un GET con i parametri nella query string.
 *
 * @param {string[]} urls        - Array di URL da aggiungere alla coda
 * @param {string}  packageName  - Nome del pacchetto JD (stringa vuota = JD sceglie)
 * @returns {Promise<void>}      - Risolve se JD accetta; rigetta con Error in caso di problemi
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

  // AbortSignal.timeout() disponibile da Chrome 103+
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(JD_CONFIG.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Il server ha risposto con HTTP ${response.status} ${response.statusText}`);
  }
}

/**
 * Configurazione dell'istanza JDownloader.
 * L'URL base è salvato in chrome.storage.sync (modificabile dalla pagina Opzioni)
 * con fallback al default qui sotto. Supporta sia indirizzi locali
 * (http://192.168.1.15:9666) sia remoti via tunnel (https://jd-cnl.example.xyz).
 */

/** URL base predefinito usato al primo avvio o se lo storage è vuoto */
export const DEFAULT_BASE_URL = 'http://192.168.1.15:9666';

/** Timeout massimo per le richieste HTTP verso JDownloader (ms) */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Identificativo fisso inviato come parametro "source" in ogni richiesta CNL2.
 *  Valore costante anziché URL della pagina corrente: evita il popup di conferma
 *  "External request from X" che JDownloader mostra per ogni dominio non whitelisted. */
export const CNL2_SOURCE = 'jd-local-extension';

/**
 * Legge la configurazione corrente da chrome.storage.sync.
 * Migra automaticamente il vecchio formato host+porta (versioni precedenti
 * dell'estensione) al nuovo campo baseUrl.
 *
 * @returns {Promise<{baseUrl: string}>}
 */
export async function getJdConfig() {
  const stored = await chrome.storage.sync.get(['baseUrl', 'host', 'port']);

  let baseUrl = stored.baseUrl;

  // Migrazione dal vecchio formato host/porta
  if (!baseUrl && stored.host) {
    baseUrl = `http://${stored.host}:${stored.port ?? 9666}`;
  }

  if (!baseUrl) {
    baseUrl = DEFAULT_BASE_URL;
  }

  // Normalizza: rimuove eventuali slash finali
  return { baseUrl: baseUrl.replace(/\/+$/, '') };
}

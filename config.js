/**
 * Configurazione dell'istanza JDownloader.
 * I valori host/porta sono salvati in chrome.storage.sync (modificabili dalla
 * pagina Opzioni dell'estensione) con fallback ai default qui sotto.
 */

/** Valori predefiniti usati al primo avvio o se lo storage è vuoto */
export const DEFAULT_CONFIG = {
  host: '192.168.1.15',
  port: 9666,
};

/** Timeout massimo per le richieste HTTP verso JDownloader (ms) */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Identificativo fisso inviato come parametro "source" in ogni richiesta CNL2.
 *  Valore costante anziché URL della pagina corrente: evita il popup di conferma
 *  "External request from X" che JDownloader mostra per ogni dominio non whitelisted. */
export const CNL2_SOURCE = 'jd-local-extension';

/**
 * Legge la configurazione corrente da chrome.storage.sync.
 * Restituisce sempre un oggetto completo: i campi mancanti usano i default.
 *
 * @returns {Promise<{host: string, port: number, baseUrl: string}>}
 */
export async function getJdConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return {
    host:    stored.host,
    port:    stored.port,
    baseUrl: `http://${stored.host}:${stored.port}`,
  };
}

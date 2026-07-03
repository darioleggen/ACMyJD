/**
 * Configurazione dell'istanza JDownloader.
 * Modifica solo questo file per cambiare IP, porta o altri parametri di connessione.
 * Fase 2: questo sarà il punto di aggancio per una futura pagina Opzioni (chrome.storage.sync).
 */
export const JD_CONFIG = {
  host: '192.168.1.15',
  port: 9666,

  /** URL base calcolato da host e porta */
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },

  /** Timeout massimo per le richieste HTTP verso JDownloader (ms) */
  requestTimeoutMs: 10_000,

  /** Identificativo fisso inviato come parametro "source" in ogni richiesta CNL2.
   *  Valore costante anziché URL della pagina corrente: evita il popup di conferma
   *  "External request from X" che JDownloader mostra per ogni dominio non whitelisted. */
  cnl2Source: 'jd-local-extension',
};

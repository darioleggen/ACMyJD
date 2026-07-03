/**
 * Utilità per l'estrazione di link da testo grezzo.
 *
 * Fase 2: aggiungere qui il rilevamento di link CNL crittografati
 * (parametri jk/crypted/passwords nei form JS degli hoster).
 */

// Cattura URL HTTP/HTTPS; esclude caratteri che normalmente non fanno parte di un URL
const URL_REGEX = /https?:\/\/[^\s"'<>[\](){}|\\^`\x00-\x1F]+/gi;

// Punteggiatura finale che spesso "contamina" un URL estrapolato da testo naturale
const TRAILING_PUNCT = /[.,;:!?)>\]]+$/;

/**
 * Estrae tutti gli URL presenti in una stringa di testo.
 * Rimuove duplicati preservando l'ordine di apparizione.
 *
 * @param {string} text - Testo grezzo (es. selezione browser)
 * @returns {string[]} Array di URL univoci e ripuliti
 */
export function extractLinks(text) {
  const matches = text.match(URL_REGEX) ?? [];
  const cleaned = matches.map(url => url.replace(TRAILING_PUNCT, ''));
  // Rimuove duplicati mantenendo il primo incontro
  return [...new Set(cleaned)];
}

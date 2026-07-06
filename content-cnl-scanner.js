/**
 * Content script iniettato on-demand nella tab attiva (chrome.scripting.executeScript,
 * permesso "activeTab") solo quando l'utente clicca la voce di menu sul contesto
 * "page" — non è più registrato in modo permanente su tutte le pagine.
 * Risponde al messaggio 'scanCnlBlocks' con tre campi:
 *   - blocks      {crypted,jk,passwords}[]  blocchi CNL2 crittografati
 *   - plainLinks  string[]                  URL plain trovati in <textarea>
 *   - packageName string                    nome pacchetto da meta tag (es. lficrypt)
 *
 * Il background script usa questa risposta per decidere quale popup aprire.
 */
(function () {
  'use strict';

  // ── CNL2 crittografati ────────────────────────────────────────────────────

  /**
   * Cerca tutti i blocchi CNL2 nel DOM (input name="crypted" + name="jk").
   * @returns {{ crypted: string, jk: string, passwords: string }[]}
   */
  function scanCnlBlocks() {
    const blocks = [];

    const cryptedInputs = Array.from(document.querySelectorAll('input'))
      .filter(el => el.getAttribute('name')?.toLowerCase() === 'crypted' && el.value.trim());

    for (const cryptedEl of cryptedInputs) {
      const jkEl       = findSibling(cryptedEl, 'jk');
      const passwordEl = findSibling(cryptedEl, 'passwords') || findSibling(cryptedEl, 'password');

      if (jkEl && jkEl.value.trim()) {
        blocks.push({
          crypted:   cryptedEl.value,
          jk:        jkEl.value,
          passwords: passwordEl ? passwordEl.value : '',
        });
      }
    }

    return blocks;
  }

  /**
   * Trova un input con il nome indicato nel contesto padre più vicino
   * all'elemento di riferimento: <form> > parentElement > unico in pagina.
   *
   * @param {HTMLInputElement} refEl
   * @param {string}           name
   * @returns {HTMLInputElement|null}
   */
  function findSibling(refEl, name) {
    const nl = name.toLowerCase();

    const form = refEl.closest('form');
    if (form) {
      const found = Array.from(form.querySelectorAll('input'))
        .find(el => el.getAttribute('name')?.toLowerCase() === nl);
      if (found) return found;
    }

    const parent = refEl.parentElement;
    if (parent) {
      const found = Array.from(parent.querySelectorAll('input'))
        .find(el => el.getAttribute('name')?.toLowerCase() === nl);
      if (found) return found;
    }

    const all = Array.from(document.querySelectorAll('input'))
      .filter(el => el.getAttribute('name')?.toLowerCase() === nl);
    return all.length === 1 ? all[0] : null;
  }

  // ── Link plain in <textarea> ──────────────────────────────────────────────

  /**
   * Cerca la prima <textarea> che contenga almeno 2 URL HTTP/HTTPS separati
   * da newline. Pattern usato da siti come lficrypt.org per esporre la lista
   * link pronta per il copia-incolla o l'invio a JDownloader.
   *
   * Soglia minima di 2 URL per evitare falsi positivi su textarea generiche.
   *
   * @returns {string[]}  Array di URL (vuoto se non trovata)
   */
  function scanPlainLinkTextarea() {
    const textareas = Array.from(document.querySelectorAll('textarea'));

    for (const ta of textareas) {
      const lines = ta.value
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => /^https?:\/\//i.test(l));

      if (lines.length >= 2) {
        return lines;
      }
    }

    return [];
  }

  // ── Nome pacchetto da meta tag ────────────────────────────────────────────

  /**
   * Legge il nome del pacchetto da meta tag vendor-specific.
   * Attualmente supporta il tag usato da lficrypt.org.
   *
   * @returns {string}
   */
  function getPagePackageName() {
    const meta = document.querySelector('meta[name="lficrypt-package"]');
    return meta ? meta.getAttribute('content') ?? '' : '';
  }

  // ── Listener messaggi ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'scanCnlBlocks') {
      sendResponse({
        blocks:      scanCnlBlocks(),
        plainLinks:  scanPlainLinkTextarea(),
        packageName: getPagePackageName(),
      });
    }
    return false;
  });

})();

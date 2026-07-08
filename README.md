# JD Link Sender

Estensione Chrome/Brave/Firefox (Manifest V3) che invia link e container crittografati a
**JDownloader 2** tramite la sua interfaccia HTTP **ClickNLoad2 (CNL2)**. È un sostituto minimale di
MyJDownloader: niente account cloud, niente servizi di terze parti — l'estensione parla direttamente
con l'endpoint `/flash/*` della tua istanza JDownloader (locale o esposta via tunnel).

## Funzionalità

- Un'unica voce nel menu contestuale ("**Invia a JDownloader**"), disponibile in tre contesti:
  - click destro su un **link**
  - click destro su una **selezione di testo** contenente uno o più URL
  - click destro su **spazio vuoto** della pagina (scansiona l'intera pagina)
- Riconoscimento automatico di due formati di container, in ordine di priorità:
  1. **Blocchi CNL2 crittografati** (`crypted` + `jk` + eventuale `passwords`)
  2. **Liste di link semplici** in una `<textarea>` (es. pagine tipo lficrypt.org)
- Se non trova nessun container, invia semplicemente l'URL grezzo.
- Popup di conferma prima dell'invio, con selezione per singolo hoster quando ne vengono
  rilevati più di uno.
- Nome del pacchetto dedotto automaticamente dal meta tag della pagina o dal titolo.
- Pagina Opzioni per configurare l'URL base di JDownloader (locale o remoto) e testare la
  connessione (`/jdcheck.js`).

## Requisiti

- **JDownloader 2** con l'interfaccia **ClickNLoad2** attiva (Impostazioni → Trasferimento →
  ClickNLoad, porta di default `9666`), raggiungibile dal browser:
  - in rete locale (es. `http://192.168.1.15:9666`), oppure
  - da remoto tramite un tunnel/reverse proxy (es. Cloudflare Tunnel) su un dominio proprio.
- Chrome, Brave (o altro browser basato su Chromium), oppure Firefox 115+.

## Installazione

Non esiste un bundler, ma i due browser richiedono manifest leggermente diversi (vedi
[Sviluppo](#sviluppo)), quindi si carica da una cartella "pacchettizzata" con lo script di build.

```powershell
pwsh ./scripts/package.ps1
```

Questo crea `dist/chrome/` e `dist/firefox/` (più i rispettivi `.zip`).

**Chrome/Brave:**
1. Apri `chrome://extensions`.
2. Attiva la **Modalità sviluppatore** (in alto a destra).
3. Clicca **Carica estensione non pacchettizzata** e seleziona `dist/chrome`.

**Firefox:**
1. Apri `about:debugging#/runtime/this-firefox`.
2. Clicca **Carica componente aggiuntivo temporaneo** e seleziona `dist/firefox/manifest.json`.
3. Firefox rimuove i componenti temporanei al riavvio del browser: va ricaricato ad ogni sessione
   (per un'installazione persistente serve pubblicarla, vedi [Pubblicazione](#pubblicazione)).

## Configurazione

1. Apri la pagina **Opzioni** dell'estensione (dai dettagli dell'estensione o dal menu
   dell'icona).
2. Inserisci l'URL base della tua istanza JDownloader, es. `http://192.168.1.15:9666` oppure
   `https://jd-cnl.miodominio.xyz`.
3. Premi **Prova connessione** per verificare che l'endpoint `/jdcheck.js` risponda.
4. Salva.

## Utilizzo

1. Naviga su una pagina con link da scaricare (diretti o dietro un container crittografato).
2. Click destro su un link, su del testo selezionato contenente URL, oppure su un'area vuota
   della pagina.
3. Seleziona **Invia a JDownloader** dal menu contestuale.
4. Conferma nel popup che si apre (con eventuale scelta degli hoster) — i link vengono inviati
   a JDownloader tramite CNL2.

## Sviluppo

Nessun bundler, nessun `package.json`: moduli ES nativi caricati direttamente dalla piattaforma
dell'estensione. Dopo modifiche a `background.js`, `config.js` o `jdApi.js` occorre ricaricare
l'estensione (su Chrome dal pulsante reload in `chrome://extensions`, i service worker non fanno
hot-reload; su Firefox rimuovendo e ricaricando il componente temporaneo). Dopo modifiche a
`content-cnl-scanner.js` occorre anche ricaricare le tab già aperte.

Non ci sono test automatici: la verifica va fatta manualmente esercitando i tre contesti del
menu contestuale (link, selezione, pagina) e la pagina Opzioni — su entrambi i browser prima di
una release.

Il codice (JS/HTML/icone) è identico per i due browser: cambia solo il manifest, perché Firefox
usa uno *script* di background non persistente (`background.scripts`) invece del *service worker*
di Chrome, e richiede un ID esplicito per l'estensione:

| | `manifest.json` (Chrome) | `manifest.firefox.json` (Firefox) |
|---|---|---|
| Background | `service_worker` | `scripts` (array) + `type: module` |
| ID estensione | non richiesto | `browser_specific_settings.gecko.id` |
| Versione minima | — | Firefox 115+ (richiesto da `storage.session`) |

Quando si rilascia una nuova versione, aggiornare `version` in **entrambi** i file manifest —
nulla lo fa automaticamente.

`scripts/package.ps1` genera `dist/chrome/` e `dist/firefox/` copiando i file condivisi e il
manifest giusto in ciascuna, poi produce gli zip pronti per l'upload sugli store.

## Struttura del progetto

| File | Ruolo |
|---|---|
| `background.js` | Service worker: menu contestuale, scansione/risoluzione dei container, routing verso i popup |
| `content-cnl-scanner.js` | Content script: scansiona il DOM vivo della pagina per il contesto "page" |
| `linkUtils.js` | Estrazione di URL da testo libero (contesto "selection") |
| `jdApi.js` | Client HTTP per gli endpoint CNL2 di JDownloader (`/flash/add`, `/flash/addcrypted2`, `/jdcheck.js`) |
| `config.js` | Lettura/migrazione della configurazione (`chrome.storage.sync`) |
| `confirm.html` / `confirm.js` | Popup di conferma invio (lista link, container o selezione per hoster) |
| `options.html` / `options.js` | Pagina Opzioni per configurare l'URL di JDownloader |

## Permessi richiesti

- `contextMenus` — per la voce di menu "Invia a JDownloader"
- `notifications` — per notificare l'esito dell'invio
- `storage` — per salvare la configurazione e lo stato temporaneo tra background e popup
- `<all_urls>` (host permissions) — per poter recuperare e scansionare qualsiasi pagina/link
  scelto dall'utente

## Pubblicazione

Build via `pwsh ./scripts/package.ps1`, poi carica `dist/jd-link-sender-chrome-vX.Y.zip` e
`dist/jd-link-sender-firefox-vX.Y.zip` sui rispettivi store.

**Chrome Web Store** (una tantum $5 di registrazione developer):
1. https://chromewebstore.google.com/devconsole → "Nuovo elemento".
2. Carica lo zip `chrome`, compila scheda (descrizione, screenshot, categoria, privacy policy se
   richiesta per via di `<all_urls>`/`notifications`).
3. Invia per revisione. Le estensioni con `host_permissions: <all_urls>` a volte richiedono una
   giustificazione d'uso nel form — spiega che serve a leggere la pagina/il link scelto dall'utente
   per riconoscere i container CNL2, non per raccogliere dati.
4. Dopo approvazione, ogni nuova versione richiede un nuovo upload dello zip con `version`
   incrementata in `manifest.json` + repackaging.

**Firefox Add-ons (AMO)**:
1. https://addons.mozilla.org/developers/ (serve un account Firefox, gratuito).
2. "Invia un nuovo componente aggiuntivo" → carica lo zip `firefox`.
3. Scegli "listato" (pubblico su AMO, revisionato da Mozilla) oppure "self-distributed" (solo firma,
   distribuzione fuori da AMO) a seconda di dove vuoi che gli utenti la installino.
4. Mozilla firma automaticamente lo zip dopo la validazione; per il listato c'è revisione manuale
   (di solito giorni, non ore).
5. Ricontrolla `browser_specific_settings.gecko.id` in `manifest.firefox.json` prima del primo
   invio: `jd-link-sender@darioleggen.github.io` è solo un placeholder nel formato richiesto
   (stringa tipo email, non deve risolvere a nulla) — puoi tenerlo o cambiarlo, ma una volta
   pubblicato non va più modificato (è la chiave con cui AMO riconosce gli aggiornamenti).

**Repository GitHub** (`darioleggen/ACMyJD`, già collegato come `origin`):
1. Committa le modifiche e taggale in modo che corrispondano alla versione degli store, es.
   `git tag v1.1 && git push origin v1.1`.
2. Crea una Release su GitHub (`gh release create v1.1 dist/jd-link-sender-chrome-v1.1.zip
   dist/jd-link-sender-firefox-v1.1.zip --notes "..."`) così gli zip restano scaricabili anche per
   chi non passa dagli store (utile per install "unpacked"/temporanee).
3. Da qui in poi ogni release futura ripete: bump versione in entrambi i manifest → package →
   upload store → tag + release GitHub.

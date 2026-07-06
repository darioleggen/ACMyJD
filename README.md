# JD Link Sender

Estensione Chrome/Brave (Manifest V3) che invia link e container crittografati a **JDownloader 2**
tramite la sua interfaccia HTTP **ClickNLoad2 (CNL2)**. È un sostituto minimale di MyJDownloader:
niente account cloud, niente servizi di terze parti — l'estensione parla direttamente con
l'endpoint `/flash/*` della tua istanza JDownloader (locale o esposta via tunnel).

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
- Chrome o Brave (o altro browser basato su Chromium) con supporto Manifest V3.

## Installazione

Non esiste build né store: si carica come estensione "unpacked".

1. Apri `chrome://extensions`.
2. Attiva la **Modalità sviluppatore** (in alto a destra).
3. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella del progetto.

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
Chrome extension. Dopo modifiche a `background.js`, `config.js` o `jdApi.js` occorre ricaricare
l'estensione da `chrome://extensions` (i service worker non fanno hot-reload). Dopo modifiche a
`content-cnl-scanner.js` occorre anche ricaricare le tab già aperte.

Non ci sono test automatici: la verifica va fatta manualmente esercitando i tre contesti del
menu contestuale (link, selezione, pagina) e la pagina Opzioni.

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

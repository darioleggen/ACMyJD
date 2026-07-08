# Informativa sulla privacy — JD Link Sender

Ultimo aggiornamento: 2026-07-08

JD Link Sender è un'estensione per browser che invia link e container crittografati a un'istanza
di JDownloader 2 (interfaccia ClickNLoad2) scelta e configurata dall'utente.

## Dati trattati

- **Contenuto delle pagine web**: quando l'utente clicca esplicitamente sulla voce di menu
  contestuale "Invia a JDownloader" (su un link, una selezione di testo o un'area della pagina),
  l'estensione legge il contenuto HTML/DOM di quella pagina o link per individuare blocchi CNL2
  crittografati o liste di link. Questa lettura avviene solo su azione esplicita dell'utente, mai
  in background o su pagine non selezionate.
- **Configurazione JDownloader**: l'URL dell'istanza JDownloader inserito dall'utente nella pagina
  Opzioni viene salvato nello storage sincronizzato del browser (`chrome.storage.sync`), legato al
  proprio account/profilo browser, per essere riutilizzato tra le sessioni.
- **Stato temporaneo del popup**: i link/container da confermare vengono passati dallo script di
  background al popup di conferma tramite lo storage di sessione del browser
  (`chrome.storage.session`), e cancellati subito dopo la lettura.

## Dove vanno i dati

I link e i container estratti vengono inviati **esclusivamente** all'istanza JDownloader indicata
dall'utente stesso nella pagina Opzioni (in rete locale o remota, ad es. tramite un tunnel di
proprietà dell'utente). Nessun dato viene inviato agli sviluppatori dell'estensione o a server di
terze parti.

## Condivisione dei dati

Non vendiamo, non trasferiamo e non condividiamo alcun dato utente con terze parti. Non
utilizziamo i dati per finalità pubblicitarie, di profilazione, di valutazione del credito o di
prestito.

## Contatti

Per domande su questa informativa, apri una issue su
https://github.com/darioleggen/ACMyJD/issues

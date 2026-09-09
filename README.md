# Jellyboxd

Userscript per verificare direttamente dalla pagina di un film su Letterboxd se il titolo è presente nella propria libreria Jellyfin.

[Installa Jellyboxd](https://raw.githubusercontent.com/ttiaMa/jellyboxd-userscript/main/src/jellyboxd.user.js)

## Stato attuale

- compatibile con l'autenticazione moderna di Jellyfin 12 tramite `Authorization: MediaBrowser Token="…"`;
- mostra subito un indicatore giallo durante la verifica;
- distingue una risposta valida “non presente” da un errore di rete o autenticazione;
- riprova automaticamente le richieste temporaneamente fallite;
- permette un nuovo tentativo manuale e riparte quando la connessione torna disponibile;
- conserva URL e API key nello storage locale di Violentmonkey/Tampermonkey, separati dal sorgente aggiornabile.

## Installazione

1. Installa un gestore userscript, per esempio Violentmonkey o Tampermonkey.
2. Apri il link **Installa Jellyboxd** qui sopra e conferma l'installazione nel gestore.
3. Apri una pagina film di Letterboxd.
4. Premi **Configura** nel widget oppure usa il menu del gestore userscript → **Configura Jellyfin…**.
5. Inserisci l'URL completo del server e una API key creata dal pannello di amministrazione Jellyfin.

Esempio di URL: `https://jellyfin.example.com` oppure `http://192.168.1.100:8096`.

## Configurazione e sicurezza

La API key non è scritta nel file `.user.js` e quindi non finisce nei commit o negli aggiornamenti distribuiti da GitHub. Viene salvata dal gestore userscript nel suo storage locale. Questo separa il segreto dal codice aggiornabile, ma non equivale a cifrarlo: l'estensione e lo userscript installato possono leggerlo.

Il metadato `@connect *` è necessario perché l'indirizzo Jellyfin viene scelto dall'utente e può essere un dominio o un IP locale. Il gestore userscript può chiedere il consenso al primo collegamento. Lo script invia al solo server configurato il titolo e l'anno del film visualizzato.

Una API key resta comunque un segreto: non va condivisa, inserita in screenshot o committata. In caso di dubbio, revocala da Jellyfin e creane una nuova.

## Comportamento delle verifiche

Il widget usa questi stati:

- **giallo**: configurazione richiesta, richiesta in corso o nuovo tentativo programmato;
- **blu**: film presente;
- **grigio**: Jellyfin ha risposto correttamente ma non è stata trovata una corrispondenza per titolo e anno;
- **rosso**: errore di rete, risposta non valida oppure credenziali rifiutate.

Gli errori temporanei (timeout, HTTP 408, 429 e 5xx) vengono ritentati fino a tre volte. HTTP 401 e 403 portano direttamente alla riconfigurazione delle credenziali.

## Sviluppo

Non ci sono dipendenze runtime o di build. È sufficiente Node.js per il controllo sintattico:

```powershell
npm test
```

File installabile: `src/jellyboxd.user.js`.

## Aggiornamenti da GitHub

I metadati `@downloadURL` e `@updateURL` puntano al file raw del branch `main`. URL e API key continuano a vivere nello storage del gestore e non vengono sovrascritti dagli aggiornamenti.

## Idee per i prossimi step

- visualizzare risoluzione, codec, HDR e altre informazioni delle sorgenti media;
- migliorare il matching con identificativi TMDB/IMDb quando disponibili;
- definire la grafica definitiva del widget;
- aggiungere test automatici del matching e delle transizioni di stato.

## Licenza

Non è stata ancora assegnata una licenza open source al progetto.

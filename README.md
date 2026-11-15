# MyWineApp

App web (installabile sul telefono) per gestire la propria cantina di vini e registrare le degustazioni.
Pensata per l'uso in cantina, dove spesso non c'è segnale: le bottiglie si inseriscono anche **senza rete**.

Interfaccia in italiano, inglese, spagnolo, tedesco e francese.

## Cosa fa

**Cantina**
- più cantine, ognuna con luoghi (una casa, un magazzino) e posizioni (A1, B4…);
- scheda del vino con foto di fronte e retro dell'etichetta, quantità per posizione, spostamenti tra posizioni;
- **lettura automatica dell'etichetta** dalle foto (modelli di visione con catena di provider gratuiti): propone i dati, tu controlli e confermi;
- prezzo di mercato cercato online (ricerca web + dati strutturati dei negozi);
- riepilogo con grafici (per tipologia, luogo, annata) che portano all'elenco già filtrato;
- **disegno della cantina in 3D**: il locale (in metri), gli scaffali sulle pareti (fino a 5 per parete), i piani divisi in parti; ogni parte mostra quante bottiglie contiene e si può toccare per vedere quali.

**Degustazioni** (anche di vini che non hai in cantina)
- mappa 3D della dinamica di bocca (come cambiano nel tempo tattile, gusto, aromi, equilibrio);
- spazio 3D dei profumi: persistenza, ampiezza e intensità, con punti selezionabili, commenti a voce e racconto scritto;
- dettatura a voce che compila la scheda (trascrizione + estrazione con modelli di testo).

**Senza campo**
- le bottiglie nuove vanno in una coda sul telefono (IndexedDB) e partono da sole quando c'è segnale;
- pagina «Inserimento rapido» che non dipende dal server: cantine e posizioni sono copiate sul telefono;
- service worker con limiti di attesa: mai schermata bianca o congelata.

**Accesso**
- niente password: codice o link per email, solo per gli indirizzi autorizzati e per le persone invitate in una cantina.

## Tecnologie

Next.js (App Router) · React · TypeScript · Tailwind · Supabase (Postgres con RLS, Auth, Storage) · Vercel (con cron giornaliero) · Plotly per le viste 3D della degustazione.
I provider di intelligenza artificiale e di ricerca sono sostituibili (vedi `.env.example`): Groq, Gemini, OpenRouter, Tavily, Exa.

## Come metterla in funzione

1. **Supabase**: crea un progetto; in *SQL Editor* esegui nell'ordine i file di `supabase/migrations/` (`0001_schema.sql`, `0002_inviti.sql`, `0003_locale.sql`).
2. **Variabili d'ambiente**: copia `.env.example` in `.env.local` e compila i valori (chiavi Supabase, email autorizzate, almeno una chiave per la lettura delle etichette, `CRON_SECRET`, e account Gmail con «password per le app» per spedire i codici di accesso).
3. **Avvio**:
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```
4. **Pubblicazione** su Vercel: importa il repository, imposta le stesse variabili d'ambiente; `vercel.json` programma il lavoro notturno (retry delle etichette, prezzi).

Le chiavi non vanno mai nel repository: `.env.local` è ignorato da git.

## Note per chi sviluppa

- Next.js 16: alcune convenzioni sono cambiate (`proxy.ts` al posto di `middleware.ts`, tipi `PageProps`). La documentazione della versione installata è in `node_modules/next/dist/docs/`.
- I testi dell'interfaccia stanno nel codice in italiano e fanno da chiave per le traduzioni (`lib/i18n/`). Regole di scrittura: `lib/i18n/ISTRUZIONI-MARCATURA.md`. Dopo aver aggiunto testi: `node scripts/i18n-estrai.mjs` dice cosa manca in ogni lingua.
- `node scripts/prova-sw.mjs` collauda la logica del service worker in un ambiente simulato.
- Le traduzioni sono state scritte con l'aiuto di un modello e non sono state riviste da madrelingua.

## Licenza

Il codice è visibile ma **l'uso richiede il permesso dell'autore**: leggerlo e studiarlo è libero, ogni altro uso va chiesto prima. Testo completo, con le istruzioni per la richiesta, in [LICENSE](LICENSE).

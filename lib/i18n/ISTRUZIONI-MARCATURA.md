# Come marcare i testi per la traduzione (MyWineApp)

L'app è scritta in italiano. Ogni testo che l'utente vede deve passare da `t(...)`: il testo italiano resta nel
codice e fa da chiave; i dizionari delle altre lingue (en, es, de, fr) vengono compilati dopo, da uno script che
legge le chiavi. Leggi prima `lib/i18n/lingue.ts`, `lib/i18n/server.ts`, `lib/i18n/client.tsx`.

## Come ottenere `t`

- **Componente server / pagina / route / azione server** (file senza `"use client"`):
  `import { traduzione } from "@/lib/i18n/server";` e dentro la funzione `const { t, locale } = await traduzione();`
  (prendi `locale` e `lingua` solo se servono).
- **Componente client** (`"use client"`): `import { useT } from "@/lib/i18n/client";` e `const t = useT();`
  in cima al componente (è un hook: mai dentro condizioni o funzioni annidate). Se servono anche lingua o
  locale: `const { t, locale } = useLingua();`.
- **Sotto-componenti e funzioni di aiuto nello stesso file**: un sotto-componente client chiama `useT()` a sua
  volta; una funzione normale riceve `t` come parametro (`t: Traduttore` da `@/lib/i18n/lingue`).
- **File in `lib/`** che producono messaggi per l'utente: non chiamano `t`. Marcano il testo con
  `daTradurre("…")` (da `@/lib/i18n/lingue`) e chi lo mostra fa `t(messaggio)`.

## Regole ferree (lo script di estrazione dipende da queste)

1. Il primo argomento di `t(` e di `daTradurre(` è SEMPRE una stringa scritta per esteso tra **virgolette
   doppie**: `t("Salva")`. Mai apici singoli, mai backtick, mai concatenazioni, mai un'espressione.
   Unica eccezione ammessa: `t(variabile)` quando la variabile contiene un testo già marcato con
   `daTradurre("…")` (elenchi di costanti, mappe di messaggi d'errore) o un nome di vocabolario (vedi sotto).
2. Valori variabili: segnaposto tra graffe e secondo argomento. `t("{n} bottiglie", { n: totale })`.
   Mai spezzare una frase in pezzi concatenati: la frase intera, con i segnaposto, è una chiave sola
   (l'ordine delle parole cambia da lingua a lingua).
3. Singolare/plurale: due chiavi intere, scelte con una condizione:
   `n === 1 ? t("{n} bottiglia", { n }) : t("{n} bottiglie", { n })`.
4. Testo con dentro un elemento JSX (un `<strong>`, un `<Link>`): se possibile riscrivi in modo che ogni pezzo
   sia una frase o un'etichetta di senso compiuto, ognuna con il suo `t("…")`. Non lasciare mezze frasi.
5. Apostrofi ed entità: dentro `t("…")` scrivi i caratteri veri (`'`, `«`, `…`), non `&apos;` né `&quot;`.
   Se il testo contiene virgolette doppie, scrivile con la barra: `\"`.
6. Mappe di messaggi (`const MESSAGGI: Record<string,string> = { nome: "Manca il nome." }`): marca i valori con
   `daTradurre("Manca il nome.")` e traduci dove si mostra: `t(MESSAGGI[codice])`.
7. Non cambiare nient'altro: né logica, né nomi di campi dei moduli (`name="…"`), né valori salvati nel
   database, né codici d'errore negli indirizzi, né classi CSS, né commenti. Niente riformattazioni.

## Che cosa si traduce e che cosa no

Si traduce: titoli, etichette, pulsanti, segnaposto (`placeholder`), `aria-label`, `title`, `alt`, messaggi
d'errore e di stato, testi d'aiuto, testi nelle `confirm()`/`alert()`, testi dei grafici (titoli degli assi,
tooltip), messaggi JSON delle route che finiscono a schermo (campo `messaggio`), testo delle email.

NON si traduce: i dati (nomi dei vini, produttori, note, commenti, codici delle posizioni, nomi di cantine e
luoghi), i `console.error/warn`, i commenti, i prompt per i modelli di intelligenza artificiale, le stringhe
tecniche (id, nomi di colonne, percorsi), il marchio «MyWineApp».

## Vocabolario già marcato (si traduce dove si mostra)

Questi elenchi hanno già i nomi marcati; a schermo vanno mostrati con `t(...)`:
- `TIPOLOGIE` (lib/vini.ts): i valori restano italiani nel database e negli `value=` dei moduli; il testo
  mostrato è `t(tipologia)`. Idem quando si mostra la tipologia di un vino letta dal database.
- `GRUPPI`, `SENSAZIONI`, `FASI`, `ANDAMENTI` (lib/degustazione.ts): `t(g.nome)`, `t(f.nome)`…
- `ASSI`, categorie e voci della ruota degli aromi (lib/spazio.ts): `t(c.nome)`, `t(voce)`.
  Attenzione: ciò che si SALVA resta il nome italiano (`aggiungi(v, categoria)` riceve la voce italiana);
  si traduce solo il testo mostrato.
- Il nome di un punto dello spazio (`p.nome`) si mostra con `t(p.nome)`: se è un aroma della ruota viene
  tradotto, se è scritto a mano resta com'è.
- `nomeCurva(id, t)` e `racconto(punti, parte, t)` accettano ora `t` come ultimo argomento: passalo sempre.
- `PARETI` (lib/locale.ts): `t(p.nome)`.

## Date e numeri

`toLocaleDateString("it-IT", …)` e simili diventano `toLocaleDateString(locale, …)` con `locale` preso da
`traduzione()` o `useLingua()`. I `localeCompare(…, "it")` usati per ordinare restano come sono.

## Alla fine

Esegui dalla cartella del progetto `npx tsc --noEmit` e correggi gli errori nei TUOI file. Non eseguire build,
non avviare server, non toccare file fuori dal tuo elenco (se serve una modifica altrove, segnalala nel
resoconto). Nel resoconto: elenco dei file toccati, i punti in cui hai dovuto riscrivere una frase per la
regola 4, e qualunque testo visibile che hai lasciato non tradotto, con il motivo.

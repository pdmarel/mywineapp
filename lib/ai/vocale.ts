import "server-only";
import { ANDAMENTI, FASI, GRUPPI, SENSAZIONI, validaDinamica, type Dinamica } from "@/lib/degustazione";
import { daTradurre, type Lingua } from "@/lib/i18n/lingue";

// Dal vocale alla degustazione, in due passi con provider gratuiti:
//   1. trascrizione dell'audio (Groq, Whisper);
//   2. dalla trascrizione alle curve delle sensazioni (Groq, modello di testo), in JSON.
// Il risultato è una PROPOSTA: riempie il modulo, e il degustatore la controlla prima di salvare.
// Ogni curva porta le parole da cui è stata ricavata («citazione») e dice se l'andamento è stato
// detto davvero («dichiarato») o dedotto da un giudizio complessivo («stimato»).
//
// Verificato il 14/11/2026 con una chiave personale e un audio di prova (voce sintetica italiana):
// modelli whisper-large-v3-turbo, qwen/qwen3.8-27b e openai/gpt-oss-120b. I nomi si cambiano da variabile d'ambiente.

const GROQ = "https://api.groq.com/openai/v1";
const MODELLO_AUDIO = process.env.GROQ_MODELLO_AUDIO || "whisper-large-v3-turbo";
// Più modelli separati da virgola: si prova il primo e, se non risponde (quota al minuto, errore), il successivo.
// Sull'audio di prova qwen ha seguito meglio il parlato; gpt-oss è la riserva.
const MODELLI_TESTO = (process.env.GROQ_MODELLO_TESTO || "qwen/qwen3.8-27b,openai/gpt-oss-120b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export type EsitoVocale =
  | { ok: true; trascrizione: string; dinamica: Dinamica; descrittori: string[]; note: string; punteggio: number | null }
  | { ok: false; codice: "configurazione" | "trascrizione" | "vuoto" | "quota" | "estrazione"; messaggio: string; trascrizione?: string };

/** Aiuta il riconoscitore con i termini del mestiere e il nome del vino, che altrimenti storpia. */
function suggerimento(vino: string): string {
  return (
    `Degustazione di un sommelier. Vino: ${vino}. Termini: attacco, centro bocca, finale, persistenza, retrolfatto, ` +
    `${SENSAZIONI.map((s) => s.nome.toLowerCase()).join(", ")}, tannino, sapido, fresco, terziari, PAI.`
  ).slice(0, 800);
}

export async function trascrivi(audio: Blob, nomeFile: string, vino: string, lingua: Lingua = "it"): Promise<{ ok: true; testo: string } | { ok: false; stato: number; dettaglio: string }> {
  const corpo = new FormData();
  corpo.append("file", audio, nomeFile);
  corpo.append("model", MODELLO_AUDIO);
  corpo.append("language", lingua);
  corpo.append("prompt", suggerimento(vino));
  corpo.append("response_format", "json");
  corpo.append("temperature", "0");
  try {
    const r = await fetch(`${GROQ}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: corpo,
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return { ok: false, stato: r.status, dettaglio: (await r.text()).slice(0, 200) };
    const json = (await r.json()) as { text?: string };
    return { ok: true, testo: (json.text ?? "").trim() };
  } catch (e) {
    return { ok: false, stato: 0, dettaglio: e instanceof Error ? e.message : String(e) };
  }
}

function prompt(vino: string, trascrizione: string): string {
  const elenco = GRUPPI.map(
    (g) => `- ${g.nome}: ${SENSAZIONI.filter((s) => s.gruppo === g.id).map((s) => `${s.id} (${s.nome})`).join(", ")}`,
  ).join("\n");
  return `Sei un sommelier. Qui sotto c'è la trascrizione di una degustazione dettata a voce del vino: ${vino}.
Ricava come si muovono le sensazioni IN BOCCA nel tempo. Rispondi SOLO con un oggetto JSON, senza altro testo:
{
  "curve": [ { "id": "<codice della sensazione>", "valori": [attacco, centro, finale, persistenza], "coda": <secondi>, "origine": "dichiarato" | "stimato", "citazione": "<parole esatte del degustatore>" } ],
  "descrittori": ["<gli aromi SPECIFICI che ha nominato, con le sue parole: es. 'ciliegia sotto spirito', 'liquirizia'. Mai i nomi delle famiglie>"],
  "punteggio": <numero o null>,
  "note": "<ciò che ha detto e non entra nei campi sopra: esame visivo, olfattivo, giudizi, abbinamenti. Stringa vuota se non c'è altro>"
}

Sensazioni ammesse. In "id" scrivi il CODICE in minuscolo che precede la parentesi (es. "sapidita", "calore"), non il nome:
${elenco}

Le quattro fasi: ${FASI.map((f) => f.nome.toLowerCase()).join(" (ingresso in bocca), ").replace("attacco (ingresso in bocca)", "attacco (ingresso in bocca)")} (dopo la deglutizione).
"valori": intensità da 0 a 5 in ciascuna delle quattro fasi, a passi di 0,5.
"coda": per quanti secondi la sensazione resta dopo la persistenza (0-30). Breve ≈ 3, media ≈ 6, lunga ≈ 12, lunghissima ≈ 20.

Regole:
- "origine": "dichiarato" solo se il degustatore ha parlato dell'ANDAMENTO di quella sensazione o di una fase precisa ("entra morbido", "a centro bocca esce l'acidità", "chiude sapido e lungo"). Per le fasi di cui non ha parlato scegli i valori più coerenti con ciò che ha detto.
- Se ha dato solo un giudizio complessivo ("tannino importante", "vino fresco") distribuiscilo sulle fasi nel modo più plausibile e metti "stimato".
- Una sensazione di cui non ha parlato affatto NON va inserita. Non inventare.
- Ogni aroma che nomina in bocca o al retrolfatto DEVE produrre la curva della sua famiglia (oltre a comparire tra i descrittori): se dice "ciliegia" c'è una curva "fruttato", se dice "liquirizia" una curva "speziato". Se dice quando si sente ("all'inizio", "poi", "nel finale", "dura moltissimo") l'origine è "dichiarato", altrimenti "stimato".
- "grande struttura", "di corpo", "pieno", "esile" riguardano la sensazione "corpo".
- Le famiglie: frutta → fruttato, fiori → floreale, erbe e peperone → vegetale, spezie e liquirizia → speziato, caffè cacao vaniglia legno → tostato, pietra focaia e salmastro → minerale, tabacco cuoio goudron e note evolute → terziario.
- "citazione": un solo pezzo di frase copiato alla lettera dalla trascrizione, senza puntini e senza unire pezzi lontani.
- La trascrizione può contenere errori del riconoscimento vocale su nomi propri e termini tecnici: interpretali.
- Andamenti tipici, per orientarti: ${ANDAMENTI.map((a) => `${a.nome.toLowerCase()} [${a.forma.join(", ")}]`).join("; ")} (relativi all'intensità massima).

TRASCRIZIONE:
"""${trascrizione}"""`;
}

export async function daVocale(audio: Blob, nomeFile: string, vino: string, lingua: Lingua = "it"): Promise<EsitoVocale> {
  if (!process.env.GROQ_API_KEY) {
    return { ok: false, codice: "configurazione", messaggio: daTradurre("Il servizio per il vocale non è configurato.") };
  }
  const t = await trascrivi(audio, nomeFile, vino, lingua);
  if (!t.ok) {
    console.error("Trascrizione fallita:", t.stato, t.dettaglio);
    return t.stato === 429
      ? { ok: false, codice: "quota", messaggio: daTradurre("Il servizio gratuito di trascrizione è saturo: riprova tra un minuto.") }
      : { ok: false, codice: "trascrizione", messaggio: daTradurre("Non sono riuscito a trascrivere il vocale. Riprova.") };
  }
  if (t.testo.length < 15) {
    return { ok: false, codice: "vuoto", messaggio: daTradurre("Nel vocale non ho sentito una degustazione. Riprova parlando vicino al telefono.") };
  }

  let risposta: Response | null = null;
  for (const modello of MODELLI_TESTO) {
    try {
      risposta = await fetch(`${GROQ}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modello,
          temperature: 0,
          max_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt(vino, t.testo) }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (risposta.ok) break;
      console.error(`Estrazione dal vocale, ${modello}:`, risposta.status);
    } catch (e) {
      console.error(`Estrazione dal vocale, ${modello}:`, e instanceof Error ? e.message : e);
    }
  }
  if (!risposta) {
    return { ok: false, codice: "estrazione", messaggio: daTradurre("Ho trascritto il vocale ma non sono riuscito a leggerlo. Puoi compilare a mano."), trascrizione: t.testo };
  }
  if (!risposta.ok) {
    console.error("Estrazione dal vocale:", risposta.status, (await risposta.text()).slice(0, 200));
    return {
      ok: false,
      codice: risposta.status === 429 ? "quota" : "estrazione",
      messaggio: daTradurre("Ho trascritto il vocale ma il servizio che lo interpreta non ha risposto. Riprova tra un minuto o compila a mano."),
      trascrizione: t.testo,
    };
  }

  let grezzo: Record<string, unknown> = {};
  try {
    const json = (await risposta.json()) as { choices?: { message?: { content?: string } }[] };
    const testo = (json.choices?.[0]?.message?.content ?? "").replace(/```(?:json)?/gi, "");
    grezzo = JSON.parse(testo.slice(testo.indexOf("{"), testo.lastIndexOf("}") + 1));
  } catch {
    return { ok: false, codice: "estrazione", messaggio: daTradurre("Ho trascritto il vocale ma non sono riuscito a interpretarlo. Puoi compilare a mano."), trascrizione: t.testo };
  }

  // Una citazione vale solo se è davvero nella trascrizione: altrimenti il modello se l'è inventata e si toglie.
  const dinamica = validaDinamica(grezzo);
  const pulita = (s: string) => s.toLowerCase().replace(/[^a-zà-ù0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
  const trascrizionePulita = pulita(t.testo);
  for (const c of dinamica.curve) {
    if (c.citazione && !trascrizionePulita.includes(pulita(c.citazione))) delete c.citazione;
  }

  const punteggio = Number(grezzo.punteggio);
  return {
    ok: true,
    trascrizione: t.testo,
    dinamica,
    descrittori: Array.isArray(grezzo.descrittori)
      ? grezzo.descrittori.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim().slice(0, 60)).slice(0, 30)
      : [],
    // I modelli a volte riempiono il campo con una frase vuota ("Nessuna nota aggiuntiva…"): non è un appunto.
    note:
      typeof grezzo.note === "string" && !/^\s*(nessun|niente|n\/?a\b|non ci sono)/i.test(grezzo.note)
        ? grezzo.note.trim().slice(0, 2000)
        : "",
    punteggio: Number.isFinite(punteggio) && punteggio > 0 && punteggio <= 100 ? punteggio : null,
  };
}

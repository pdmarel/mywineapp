import "server-only";
import { TIPOLOGIE, type Vitigno } from "@/lib/vini";

// Lettura dell'etichetta dalle foto, con una catena di provider gratuiti.
//
// L'ordine viene da AI_ETICHETTA (es. "gemini,groq,openrouter"); chi non ha la chiave viene saltato.
// Se un provider risponde con errore, quota finita o testo non valido si passa al successivo.
// Tutti parlano il protocollo "compatibile OpenAI": cambia solo indirizzo, chiave e modello.
//
// Verificato il 14/11/2026: Groq con il modello qwen/qwen3.8-27b legge le immagini (1.000 richieste al giorno
// sul piano gratuito, ma anche 200.000 token al giorno: circa 40 etichette con due foto). Gemini verificato il
// 20/11/2026 (vedi sotto). OpenRouter verificato il 20/11/2026: ultima riserva. I nomi dei modelli
// cambiano spesso: si impostano da variabile d'ambiente senza toccare il codice.

type Provider = { nome: string; base: string; chiave: string | undefined; modello: string | undefined };

function provider(nome: string): Provider | null {
  switch (nome) {
    case "groq":
      return {
        nome,
        base: "https://api.groq.com/openai/v1",
        chiave: process.env.GROQ_API_KEY,
        modello: process.env.GROQ_MODELLO_VISIONE || "qwen/qwen3.8-27b",
      };
    case "gemini":
      return {
        nome,
        base: "https://generativelanguage.googleapis.com/v1beta/openai",
        chiave: process.env.GEMINI_API_KEY,
        // Verificato il 20/11/2026 su tre etichette vere (fronte + retro): letture corrette in 3-10 secondi.
        // I modelli "flash" più grandi (3.6, 3.8) vanno fuori tempo o sono sovraccarichi sul piano gratuito.
        modello: process.env.GEMINI_MODELLO_VISIONE || "gemini-3.5-flash-lite",
      };
    case "openrouter":
      return {
        nome,
        base: "https://openrouter.ai/api/v1",
        chiave: process.env.OPENROUTER_API_KEY,
        // Verificato il 20/11/2026: tra i modelli gratuiti che leggono le immagini questo ha letto bene un'etichetta
        // (fronte + retro, 7 secondi), ma spesso risponde "troppe richieste" (429): va bene solo come ultima riserva.
        modello: process.env.OPENROUTER_MODELLO_VISIONE || "google/gemma-4-31b-it:free",
      };
    default:
      return null;
  }
}

export function catenaEtichetta(): Provider[] {
  return (process.env.AI_ETICHETTA || "groq")
    .split(",")
    .map((n) => provider(n.trim().toLowerCase()))
    .filter((p): p is Provider => !!p && !!p.chiave && !!p.modello);
}

const PROMPT = `Sei un sommelier esperto di etichette. Ricevi la foto FRONTALE e, se c'è, quella del RETRO della stessa bottiglia.
Restituisci SOLO un oggetto JSON valido, senza markdown e senza testo prima o dopo:
{
  "nome_fantasia": "nome commerciale del vino (es. Tignanello, Rabajà). Stringa vuota se il vino si chiama solo con la denominazione",
  "denominazione": "denominazione con la SIGLA abbreviata: DOCG, DOC, IGT, IGP, DOP, AOC, AOP — mai la forma estesa. Es. 'Barolo DOCG', 'Toscana IGT', 'Gevrey-Chambertin 1er Cru AOC'. Includi menzioni come Riserva o Superiore",
  "annata": "anno di vendemmia a 4 cifre; stringa vuota se non c'è (non usare l'anno del lotto o dell'imbottigliamento)",
  "produttore": "nome della cantina",
  "alcool": "solo il numero, con il punto: 13.5",
  "capacita_cl": "numero intero in centilitri: 750 ml → 75, 375 ml → 37, 1,5 l → 150",
  "tipologia": "uno tra: ${TIPOLOGIE.join(", ")}",
  "vitigni": [{"nome": "Sangiovese", "pct": 90}]
}
Regole:
- Scrivi solo ciò che LEGGI sull'etichetta. Non completare con ciò che sai del vino.
- "vitigni": solo se sono stampati sull'etichetta; altrimenti lista vuota. "pct" si omette se non indicata.
- Campi non leggibili o assenti: stringa vuota (o lista vuota).
- "tipologia" puoi dedurla dalla denominazione e dal colore del vino o della bottiglia; se non sei ragionevolmente sicuro, stringa vuota.`;

export type DatiEtichetta = {
  nome_fantasia: string | null;
  denominazione: string | null;
  annata: number | null;
  produttore: string | null;
  alcool: number | null;
  capacita_cl: number | null;
  tipologia: string | null;
  vitigni: Vitigno[] | null;
};

export type EsitoLettura =
  | { ok: true; dati: DatiEtichetta; provider: string; modello: string; tentativi: Tentativo[] }
  | { ok: false; motivo: "nessun_provider" | "tutti_falliti"; tentativi: Tentativo[] };

export type Tentativo = { provider: string; ok: boolean; stato?: number; dettaglio?: string };

/** "Denominazione di Origine Controllata e Garantita" → "DOCG" (l'ordine conta: prima la più lunga). */
export function abbreviaDenominazione(testo: string): string {
  return testo
    .replace(/(vino\s+a\s+)?denominazione\s+di\s+origine\s+controllata\s+e\s+garantita/gi, "DOCG")
    .replace(/(vino\s+a\s+)?denominazione\s+di\s+origine\s+controllata/gi, "DOC")
    .replace(/denominazione\s+di\s+origine\s+protetta/gi, "DOP")
    .replace(/indicazione\s+geografica\s+tipica/gi, "IGT")
    .replace(/indicazione\s+geografica\s+protetta/gi, "IGP")
    .replace(/appellation\s+d['’]origine\s+contr[ôo]l[ée]e/gi, "AOC")
    // Sigle scritte con i punti: "D.O.C.G." → "DOCG", "D.O.C." → "DOC", "I.G.T." → "IGT"…
    .replace(/\bD\.\s?O\.\s?C\.\s?G\.?/gi, "DOCG")
    .replace(/\bD\.\s?O\.\s?C\.?/gi, "DOC")
    .replace(/\bD\.\s?O\.\s?P\.?/gi, "DOP")
    .replace(/\bI\.\s?G\.\s?T\.?/gi, "IGT")
    .replace(/\bI\.\s?G\.\s?P\.?/gi, "IGP")
    .replace(/\s+/g, " ")
    .trim();
}

/** "750ml", "0.75 l", "75", 750 → 75 (centilitri interi). */
export function capacitaInCl(valore: unknown): number | null {
  const s = String(valore ?? "").trim().toLowerCase();
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(ml|cl|l|lt|litr[io])?$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unita = m[2] ?? "";
  const cl = unita === "ml" ? n / 10 : unita && unita !== "cl" ? n * 100 : n >= 100 ? n / 10 : n;
  return cl > 0 && cl < 3000 ? Math.round(cl) : null;
}

function pulito(valore: unknown, lunghezzaMassima = 200): string | null {
  if (typeof valore !== "string" && typeof valore !== "number") return null;
  // Via i marcatori di citazione che alcuni modelli aggiungono ("Nebbiolo [cite: 2").
  const s = String(valore).replace(/\[cite[^\]]*\]?/gi, "").replace(/\s+/g, " ").trim();
  if (!s || /^(n\/?a|null|nessuno|non (leggibile|presente|indicat[oa]|trovato))$/i.test(s)) return null;
  return s.slice(0, lunghezzaMassima);
}

/** Trasforma la risposta grezza del modello in dati affidabili, o null se non c'è nulla di utile. */
export function validaEtichetta(grezzo: unknown): DatiEtichetta | null {
  if (!grezzo || typeof grezzo !== "object") return null;
  const g = grezzo as Record<string, unknown>;

  const annata = Number(String(g.annata ?? "").match(/\b(18|19|20)\d{2}\b/)?.[0]);
  const alcool = Number(String(g.alcool ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0]);
  const tipologia = pulito(g.tipologia);
  const denominazione = pulito(g.denominazione);

  const vitigni: Vitigno[] = Array.isArray(g.vitigni)
    ? g.vitigni
        .map((v): Vitigno | null => {
          const nome = pulito(typeof v === "string" ? v : (v as Record<string, unknown>)?.nome, 60);
          // Un nome di vitigno non è una frase: si scartano i testi lunghi o con un verbo evidente.
          if (!nome || nome.split(" ").length > 5 || /\b(è|sono|viene|una|denominazione)\b/i.test(nome)) return null;
          const pct = Number((v as Record<string, unknown>)?.pct);
          return pct > 0 && pct <= 100 ? { nome, pct } : { nome };
        })
        .filter((v): v is Vitigno => v !== null)
    : [];

  const dati: DatiEtichetta = {
    nome_fantasia: pulito(g.nome_fantasia),
    denominazione: denominazione ? abbreviaDenominazione(denominazione) : null,
    annata: annata >= 1800 && annata <= new Date().getFullYear() + 1 ? annata : null,
    produttore: pulito(g.produttore),
    alcool: alcool > 0 && alcool < 100 ? alcool : null,
    capacita_cl: capacitaInCl(g.capacita_cl),
    tipologia: tipologia && (TIPOLOGIE as readonly string[]).includes(tipologia) ? tipologia : null,
    vitigni: vitigni.length > 0 ? vitigni : null,
  };
  const utile = dati.nome_fantasia || dati.denominazione || dati.produttore;
  return utile ? dati : null;
}

function estraiJson(testo: string): unknown {
  const pulita = testo.replace(/```(?:json)?/gi, "").trim();
  const inizio = pulita.indexOf("{");
  const fine = pulita.lastIndexOf("}");
  if (inizio < 0 || fine <= inizio) return null;
  try {
    return JSON.parse(pulita.slice(inizio, fine + 1));
  } catch {
    return null;
  }
}

async function chiedi(p: Provider, immagini: { etichetta: string; base64: string }[]): Promise<Tentativo & { dati?: DatiEtichetta }> {
  const contenuto: unknown[] = [];
  for (const img of immagini) {
    contenuto.push({ type: "text", text: `Foto ${img.etichetta}:` });
    contenuto.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img.base64}` } });
  }
  contenuto.push({ type: "text", text: PROMPT });

  try {
    let risposta = await invia(p, contenuto);
    // Il piano gratuito ha un tetto al minuto: tre etichette lette in fila lo raggiungono.
    // Il servizio dice quanti secondi aspettare; si riprova fino a due volte, senza superare ~70 secondi in tutto.
    for (let giro = 0; giro < 2 && risposta.status === 429; giro++) {
      const attesa = Number(risposta.headers.get("retry-after")) || 20;
      if (attesa > 35) break; // quota giornaliera, non al minuto: inutile aspettare
      await new Promise((ok) => setTimeout(ok, (attesa + 1) * 1000));
      risposta = await invia(p, contenuto);
    }
    if (!risposta.ok) {
      const corpo = await risposta.text();
      return { provider: p.nome, ok: false, stato: risposta.status, dettaglio: corpo.slice(0, 200) };
    }
    const json = (await risposta.json()) as { choices?: { message?: { content?: string } }[] };
    const dati = validaEtichetta(estraiJson(json.choices?.[0]?.message?.content ?? ""));
    if (!dati) return { provider: p.nome, ok: false, stato: 200, dettaglio: "risposta senza dati utilizzabili" };
    return { provider: p.nome, ok: true, stato: 200, dati };
  } catch (e) {
    return { provider: p.nome, ok: false, dettaglio: e instanceof Error ? e.message : String(e) };
  }
}

function invia(p: Provider, contenuto: unknown[]): Promise<Response> {
  return fetch(`${p.base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.chiave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: p.modello,
      temperature: 0,
      max_tokens: 700,
      messages: [{ role: "user", content: contenuto }],
    }),
    signal: AbortSignal.timeout(40_000),
  });
}

/** Prova i provider in ordine finché uno restituisce dati validi. */
export async function leggiEtichetta(immagini: { etichetta: string; base64: string }[]): Promise<EsitoLettura> {
  const catena = catenaEtichetta();
  if (catena.length === 0) return { ok: false, motivo: "nessun_provider", tentativi: [] };

  const tentativi: Tentativo[] = [];
  for (const p of catena) {
    const { dati, ...tentativo } = await chiedi(p, immagini);
    tentativi.push(tentativo);
    if (dati) return { ok: true, dati, provider: p.nome, modello: p.modello!, tentativi };
  }
  return { ok: false, motivo: "tutti_falliti", tentativi };
}

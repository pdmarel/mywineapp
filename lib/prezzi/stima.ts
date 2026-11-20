import "server-only";
import type { VinoDaPrezzare } from "./cerca";

// Prezzo di riferimento di mercato quando il vino non è in vendita sulle enoteche online (o mancano i dati per
// riconoscerlo): una STIMA fatta da un modello di testo, con una percentuale di affidabilità dichiarata.
//
// Il modello riceve i dati del vino e, se la ricerca è stata fatta, i frammenti dei risultati (titoli e testi
// con i prezzi di vini simili o dello stesso vino). Restituisce prezzo, forbice e quanto si fida.
// L'affidabilità ha comunque un tetto deciso qui, non dal modello: una stima non vale mai quanto un prezzo letto
// su un'enoteca. Tetti: 65 con prezzi nei frammenti, 45 senza, 30 se manca anche il produttore.

export type Frammento = { titolo: string; testo: string; url: string };
export type Stima = { prezzo: number; minimo: number; massimo: number; affidabilita: number; base: string; provider: string };

type Provider = { nome: string; base: string; chiave: string | undefined; modelli: string[] };

function catena(): Provider[] {
  const tutti: Provider[] = [
    {
      nome: "gemini",
      base: "https://generativelanguage.googleapis.com/v1beta/openai",
      chiave: process.env.GEMINI_API_KEY,
      modelli: [process.env.GEMINI_MODELLO_TESTO || "gemini-3.5-flash-lite"],
    },
    {
      nome: "groq",
      base: "https://api.groq.com/openai/v1",
      chiave: process.env.GROQ_API_KEY,
      modelli: (process.env.GROQ_MODELLO_TESTO || "qwen/qwen3.8-27b,openai/gpt-oss-120b").split(",").map((m) => m.trim()).filter(Boolean),
    },
  ];
  return tutti.filter((p) => !!p.chiave);
}

const haPrezzi = (f: Frammento[]) => f.some((x) => /(€|eur|euro)\s?\d|\d+[.,]?\d*\s?(€|eur|euro)/i.test(`${x.titolo} ${x.testo}`));

/** Il tetto dell'affidabilità di una stima, secondo quanto si sa del vino e che cosa ha trovato la ricerca. */
export function tettoStima(v: VinoDaPrezzare, frammenti: Frammento[]): number {
  if (!v.produttore) return 30;
  return haPrezzi(frammenti) ? 65 : 45;
}

function estraiJson(testo: string): Record<string, unknown> | null {
  const pulita = testo.replace(/```(?:json)?/gi, "");
  const [inizio, fine] = [pulita.indexOf("{"), pulita.lastIndexOf("}")];
  if (inizio < 0 || fine <= inizio) return null;
  try {
    return JSON.parse(pulita.slice(inizio, fine + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function stimaPrezzo(v: VinoDaPrezzare, frammenti: Frammento[] = []): Promise<Stima | null> {
  // Senza nemmeno una denominazione o un nome non c'è nulla su cui ragionare.
  if (!v.nome_fantasia && !v.denominazione && !v.produttore) return null;
  const tetto = tettoStima(v, frammenti);
  const scheda = [
    v.produttore ? `Produttore: ${v.produttore}` : "Produttore: non noto",
    v.nome_fantasia ? `Nome: ${v.nome_fantasia}` : null,
    v.denominazione ? `Denominazione: ${v.denominazione}` : null,
    v.annata ? `Annata: ${v.annata}` : "Annata: non indicata",
    `Formato: ${v.capacita_cl ?? 75} cl`,
  ]
    .filter(Boolean)
    .join("\n");
  const risultati = frammenti
    .slice(0, 8)
    .map((f, i) => `[${i + 1}] ${f.titolo}\n${f.testo.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n\n");
  const richiesta = `Sei un esperto del mercato italiano del vino. Stima il prezzo di riferimento al dettaglio (enoteca o enoteca online, in Italia, IVA inclusa, in euro) di UNA bottiglia di questo vino nel formato indicato.

${scheda}

${risultati ? `Risultati di una ricerca sulle enoteche online (possono riguardare lo stesso vino, altre annate o vini diversi dello stesso produttore):\n${risultati}` : "Non ci sono risultati di ricerca: usa solo ciò che sai del produttore, della denominazione e dell'annata."}

Rispondi SOLO con un oggetto JSON, senza altro testo:
{"prezzo": numero, "minimo": numero, "massimo": numero, "affidabilita": numero intero da 0 a 100, "base": "una frase in italiano, max 120 caratteri, su che cosa si fonda la stima"}

Regole:
- "affidabilita" è la probabilità che il prezzo vero a scaffale stia tra "minimo" e "massimo". Sii prudente: alta solo se i risultati mostrano proprio questo vino; bassa se conosci poco il produttore.
- Se non conosci il produttore o i risultati non aiutano, stima comunque dal prezzo tipico a scaffale della denominazione (e del nome, se dice qualcosa), con affidabilità bassa (10-30) e una forbice larga.
- Rispondi {"prezzo": null} solo se non c'è né una denominazione né un nome riconoscibile.
- Non inventare fonti.`;

  for (const p of catena()) {
    for (const modello of p.modelli) {
      try {
        const risposta = await fetch(`${p.base}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.chiave}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: modello, temperature: 0, max_tokens: 400, messages: [{ role: "user", content: richiesta }] }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!risposta.ok) {
          console.error(`Stima prezzo, ${p.nome} ${modello}:`, risposta.status);
          continue;
        }
        const corpo = (await risposta.json()) as { choices?: { message?: { content?: string } }[] };
        const dati = estraiJson(corpo.choices?.[0]?.message?.content ?? "");
        const prezzo = Number(dati?.prezzo);
        if (!dati || !Number.isFinite(prezzo) || prezzo < 1 || prezzo > 10000) {
          if (dati && dati.prezzo === null) return null; // il modello dice di non poter stimare
          continue;
        }
        const minimo = Number(dati.minimo);
        const massimo = Number(dati.massimo);
        const dichiarata = Math.round(Number(dati.affidabilita));
        return {
          prezzo: Math.round(prezzo * 100) / 100,
          minimo: Number.isFinite(minimo) && minimo > 0 && minimo <= prezzo ? minimo : Math.round(prezzo * 0.8),
          massimo: Number.isFinite(massimo) && massimo >= prezzo ? massimo : Math.round(prezzo * 1.25),
          affidabilita: Math.max(5, Math.min(tetto, Number.isFinite(dichiarata) ? dichiarata : tetto - 15)),
          base: String(dati.base ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
          provider: p.nome,
        };
      } catch (e) {
        console.error(`Stima prezzo, ${p.nome} ${modello}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  return null;
}

// Il disegno di un luogo della cantina: un locale (misure in metri) con gli scaffali appoggiati alle pareti
// (misure in centimetri). Ogni scaffale ha dei piani, elencati dall'alto; ogni piano è diviso in 1, 2 o 3 parti,
// e ogni parte ha un nome. Il nome è il codice di una posizione del luogo (A1, B4…): è così che il disegno
// sa quante bottiglie ci sono, senza tenerne una copia.
//
// Su ogni parete ci sono fino a 5 posti, da sinistra a destra guardando la parete da dentro il locale: ogni
// scaffale occupa un posto e parte dove finisce il precedente (più un eventuale spazio libero prima).
// Così due scaffali sulla stessa parete non possono mai sovrapporsi.

import { daTradurre } from "./i18n/lingue";

export const PARETI = [
  { id: "fondo", nome: daTradurre("Parete di fondo (di fronte all'ingresso)") },
  { id: "sinistra", nome: daTradurre("Parete sinistra") },
  { id: "destra", nome: daTradurre("Parete destra") },
  { id: "ingresso", nome: daTradurre("Parete dell'ingresso") },
] as const;
export type Parete = (typeof PARETI)[number]["id"];

export type Piano = { parti: string[] };
export type Scaffale = {
  id: string;
  nome: string;
  parete: Parete;
  /** Il posto sulla parete, da 1 a 5, da sinistra a destra guardandola da dentro il locale. */
  posto: number;
  /** Centimetri di spazio libero prima dello scaffale, dopo quello del posto precedente (o dall'angolo). */
  distanza: number;
  larghezza: number;
  altezza: number;
  profondita: number;
  /** Dall'alto verso il basso. */
  piani: Piano[];
};
export type Locale = { larghezza: number; profondita: number; altezza: number; scaffali: Scaffale[] };

export const LOCALE_NUOVO: Locale = { larghezza: 1.5, profondita: 2, altezza: 2.2, scaffali: [] };
export const MASSIMO_PIANI = 12;
export const MASSIMO_PER_PARETE = 5;
export const MASSIMO_SCAFFALI = MASSIMO_PER_PARETE * 4;

/** Il nome di una parte, scritto come i codici delle posizioni: maiuscolo, senza spazi. */
export function codiceParte(nome: unknown): string {
  return String(nome ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s,;]+/g, "-")
    .slice(0, 20);
}

const numero = (v: unknown, minimo: number, massimo: number, predefinito: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(massimo, Math.max(minimo, n)) : predefinito;
};

/** Controlla e ripulisce un disegno arrivato dal browser o dal database. null se non c'è. */
export function validaLocale(grezzo: unknown): Locale | null {
  if (!grezzo || typeof grezzo !== "object") return null;
  const g = grezzo as Record<string, unknown>;
  const sullaParete: Record<string, number> = {};
  const scaffali = (Array.isArray(g.scaffali) ? g.scaffali : []).slice(0, MASSIMO_SCAFFALI).map((s, i): Scaffale => {
    const x = (s ?? {}) as Record<string, unknown>;
    const parete: Parete = PARETI.some((p) => p.id === x.parete) ? (x.parete as Parete) : "fondo";
    sullaParete[parete] = (sullaParete[parete] ?? 0) + 1;
    const piani = (Array.isArray(x.piani) ? x.piani : []).slice(0, MASSIMO_PIANI).map((p): Piano => {
      const parti = Array.isArray((p as Piano | null)?.parti) ? (p as Piano).parti : [""];
      return { parti: parti.slice(0, 3).map(codiceParte).concat(parti.length === 0 ? [""] : []) };
    });
    return {
      id: typeof x.id === "string" && x.id ? x.id.slice(0, 40) : `s${i}`,
      nome: String(x.nome ?? "").trim().slice(0, 20) || String.fromCharCode(65 + (i % 26)),
      parete,
      // Un disegno senza posti (versioni precedenti) li riceve nell'ordine in cui gli scaffali sono elencati.
      posto: Math.round(numero(x.posto, 1, MASSIMO_PER_PARETE, Math.min(sullaParete[parete], MASSIMO_PER_PARETE))),
      distanza: Math.round(numero(x.distanza, 0, 2000, 0)),
      larghezza: Math.round(numero(x.larghezza, 10, 600, 100)),
      altezza: Math.round(numero(x.altezza, 10, 400, 180)),
      profondita: Math.round(numero(x.profondita, 5, 200, 35)),
      piani: piani.length > 0 ? piani : [{ parti: [""] }],
    };
  });
  return {
    larghezza: numero(g.larghezza, 0.5, 30, 1.5),
    profondita: numero(g.profondita, 0.5, 30, 2),
    altezza: numero(g.altezza, 1, 6, 2.2),
    scaffali,
  };
}

/** Tutti i nomi di parte usati nel disegno, senza i vuoti. */
export function partiDi(locale: Locale): string[] {
  return locale.scaffali.flatMap((s) => s.piani.flatMap((p) => p.parti)).filter(Boolean);
}

/** I nomi usati più di una volta: la stessa posizione comparirebbe in due punti del disegno. */
export function partiDoppie(locale: Locale): string[] {
  const visti = new Map<string, number>();
  for (const p of partiDi(locale)) visti.set(p, (visti.get(p) ?? 0) + 1);
  return [...visti].filter(([, n]) => n > 1).map(([p]) => p);
}

/** Nome proposto per una parte: scaffale + numero del piano (dall'alto), più il numero della parte se sono più d'una. */
export function nomeProposto(scaffale: string, piano: number, parte: number, quante: number): string {
  return codiceParte(`${scaffale}${piano + 1}${quante > 1 ? `-${parte + 1}` : ""}`);
}

/** Quanto è lunga, in centimetri, la parete a cui è appoggiato uno scaffale. */
export function lunghezzaParete(locale: Locale, parete: Parete): number {
  return Math.round((parete === "fondo" || parete === "ingresso" ? locale.larghezza : locale.profondita) * 100);
}

/**
 * Dove sta ogni scaffale sulla sua parete, in centimetri dall'angolo sinistro: uno dopo l'altro, nell'ordine
 * dei posti, ciascuno con il suo spazio libero prima. È l'unica fonte per il disegno, quindi niente sovrapposizioni.
 */
export function disposizione(locale: Locale): Record<string, { inizio: number; fine: number }> {
  const out: Record<string, { inizio: number; fine: number }> = {};
  for (const parete of PARETI) {
    const sulla = locale.scaffali.map((s, i) => ({ s, i })).filter((x) => x.s.parete === parete.id);
    sulla.sort((a, b) => a.s.posto - b.s.posto || a.i - b.i);
    let corrente = 0;
    for (const { s } of sulla) {
      const inizio = corrente + s.distanza;
      out[s.id] = { inizio, fine: inizio + s.larghezza };
      corrente = inizio + s.larghezza;
    }
  }
  return out;
}

/** Che cosa c'è in una posizione: serve al disegno per i numeri e al dettaglio per l'elenco. */
export type Contenuto = {
  bottiglie: number;
  vini: { id: string; titolo: string; produttore: string | null; annata: number | null; quantita: number }[];
};

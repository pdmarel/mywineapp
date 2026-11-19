// Il disegno di un luogo della cantina: un locale (misure in metri) con gli scaffali appoggiati alle pareti
// (misure in centimetri). Ogni scaffale ha dei piani, elencati dall'alto; ogni piano è diviso da 1 a 5 parti,
// e ogni parte ha un nome. Il nome è il codice di una posizione del luogo (A1, B4…): è così che il disegno
// sa quante bottiglie ci sono, senza tenerne una copia.
//
// Su ogni parete ci sono fino a 5 posti, da sinistra a destra guardando la parete da dentro il locale: ogni
// scaffale occupa un posto e parte dove finisce il precedente (più un eventuale spazio libero prima).
// Così due scaffali sulla stessa parete non possono mai sovrapporsi.
//
// Oltre agli scaffali, nel locale si possono mettere oggetti liberi (un tavolo, un rack, una cassa, una botte):
// ognuno ha le sue misure e una posizione scelta nello spazio, in centimetri dalla parete sinistra, dall'ingresso
// e da terra. Se ha un nome di posizione (facoltativo) conta anche le bottiglie, come una parte di scaffale.

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
/** Un oggetto libero nel locale. Le misure e la posizione sono in centimetri. */
export type Oggetto = {
  id: string;
  nome: string;
  /** Distanza dalla parete sinistra (guardando dall'ingresso verso il fondo) al lato sinistro dell'oggetto. */
  x: number;
  /** Distanza dall'ingresso al lato dell'oggetto più vicino all'ingresso. */
  y: number;
  /** Altezza da terra della base (0 = appoggiato sul pavimento; più su se sta sopra un altro oggetto). */
  z: number;
  larghezza: number;
  profondita: number;
  altezza: number;
  /** Facoltativo: il nome di una posizione del luogo, per contare qui le sue bottiglie. */
  parte: string;
};
export type Locale = { larghezza: number; profondita: number; altezza: number; scaffali: Scaffale[]; oggetti: Oggetto[] };

export const LOCALE_NUOVO: Locale = { larghezza: 1.5, profondita: 2, altezza: 2.2, scaffali: [], oggetti: [] };
export const MASSIMO_PARTI = 5;
export const MASSIMO_OGGETTI = 30;
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
      return { parti: parti.slice(0, MASSIMO_PARTI).map(codiceParte).concat(parti.length === 0 ? [""] : []) };
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
  const oggetti = (Array.isArray(g.oggetti) ? g.oggetti : []).slice(0, MASSIMO_OGGETTI).map((o, i): Oggetto => {
    const x = (o ?? {}) as Record<string, unknown>;
    return {
      id: typeof x.id === "string" && x.id ? x.id.slice(0, 40) : `o${i}`,
      nome: String(x.nome ?? "").trim().slice(0, 30) || `Oggetto ${i + 1}`,
      x: Math.round(numero(x.x, 0, 3000, 0)),
      y: Math.round(numero(x.y, 0, 3000, 0)),
      z: Math.round(numero(x.z, 0, 600, 0)),
      larghezza: Math.round(numero(x.larghezza, 5, 600, 60)),
      profondita: Math.round(numero(x.profondita, 5, 600, 60)),
      altezza: Math.round(numero(x.altezza, 5, 400, 80)),
      parte: codiceParte(x.parte),
    };
  });
  return {
    larghezza: numero(g.larghezza, 0.5, 30, 1.5),
    profondita: numero(g.profondita, 0.5, 30, 2),
    altezza: numero(g.altezza, 1, 6, 2.2),
    scaffali,
    oggetti,
  };
}

/** Tutti i nomi di parte usati nel disegno, senza i vuoti. */
export function partiDi(locale: Locale): string[] {
  return [...locale.scaffali.flatMap((s) => s.piani.flatMap((p) => p.parti)), ...locale.oggetti.map((o) => o.parte)].filter(Boolean);
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

/** Per ogni parete: l'angolo sinistro (guardandola da dentro), la direzione lungo la parete e quella verso l'interno (metri). */
export const GEOMETRIA_PARETE: Record<Parete, (l: Locale) => { o: [number, number]; u: [number, number]; n: [number, number] }> = {
  fondo: (l) => ({ o: [0, l.profondita], u: [1, 0], n: [0, -1] }),
  ingresso: (l) => ({ o: [l.larghezza, 0], u: [-1, 0], n: [0, 1] }),
  sinistra: () => ({ o: [0, 0], u: [0, 1], n: [1, 0] }),
  destra: (l) => ({ o: [l.larghezza, l.profondita], u: [0, -1], n: [-1, 0] }),
};

/** Un rettangolo sul pavimento, in centimetri: x dalla parete sinistra, y dall'ingresso. */
export type Ingombro = { x0: number; y0: number; x1: number; y1: number };

/** Il posto occupato sul pavimento da uno scaffale (centimetri). */
export function ingombroScaffale(locale: Locale, s: Scaffale, posti = disposizione(locale)): Ingombro {
  const { o, u, n } = GEOMETRIA_PARETE[s.parete](locale);
  const { inizio, fine } = posti[s.id];
  const punto = (lungo: number, dentro: number): [number, number] => [o[0] * 100 + u[0] * lungo + n[0] * dentro, o[1] * 100 + u[1] * lungo + n[1] * dentro];
  const [a, b] = [punto(inizio, 0), punto(fine, s.profondita)];
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
}

export function ingombroOggetto(o: Oggetto): Ingombro {
  return { x0: o.x, y0: o.y, x1: o.x + o.larghezza, y1: o.y + o.profondita };
}

const siTocca = (a: Ingombro, b: Ingombro) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export type ConflittoOggetto =
  | { tipo: "fuori"; oggetto: string }
  | { tipo: "troppo_alto"; oggetto: string }
  | { tipo: "sovrapposto"; oggetto: string; con: string };

/** Gli oggetti che escono dal locale, sono più alti del locale o si sovrappongono a uno scaffale o a un altro oggetto. */
export function conflittiOggetti(locale: Locale): ConflittoOggetto[] {
  const out: ConflittoOggetto[] = [];
  const posti = disposizione(locale);
  const scaffali = locale.scaffali.map((s) => ({ nome: s.nome, r: ingombroScaffale(locale, s, posti), alto: s.altezza }));
  locale.oggetti.forEach((o, i) => {
    const r = ingombroOggetto(o);
    if (r.x1 > locale.larghezza * 100 || r.y1 > locale.profondita * 100) out.push({ tipo: "fuori", oggetto: o.nome });
    if (o.z + o.altezza > locale.altezza * 100) out.push({ tipo: "troppo_alto", oggetto: o.nome });
    for (const s of scaffali) if (o.z < s.alto && siTocca(r, s.r)) out.push({ tipo: "sovrapposto", oggetto: o.nome, con: s.nome });
    locale.oggetti.forEach((altro, k) => {
      if (k <= i) return;
      const dentro = o.z < altro.z + altro.altezza && altro.z < o.z + o.altezza; // stessa fascia di altezza
      if (dentro && siTocca(r, ingombroOggetto(altro))) out.push({ tipo: "sovrapposto", oggetto: o.nome, con: altro.nome });
    });
  });
  return out;
}

/** Un posto libero sul pavimento per un nuovo oggetto largo `larghezza` e profondo `profondita` (centimetri), o null. */
export function trovaPosto(locale: Locale, larghezza: number, profondita: number): { x: number; y: number } | null {
  const posti = disposizione(locale);
  const occupati = [...locale.scaffali.map((s) => ingombroScaffale(locale, s, posti)), ...locale.oggetti.filter((o) => o.z === 0).map(ingombroOggetto)];
  const [L, P] = [Math.round(locale.larghezza * 100), Math.round(locale.profondita * 100)];
  for (let y = 0; y + profondita <= P; y += 10) {
    for (let x = 0; x + larghezza <= L; x += 10) {
      if (!occupati.some((r) => siTocca({ x0: x, y0: y, x1: x + larghezza, y1: y + profondita }, r))) return { x, y };
    }
  }
  return null;
}

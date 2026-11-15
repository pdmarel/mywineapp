import ruota from "./aromi.json";
import { daTradurre, inItaliano, minuscolo, type Traduttore } from "./i18n/lingue";

// Lo "spazio" tridimensionale della degustazione.
//
// Un parallelepipedo ideale con tre assi:
//   lunghezza = PERSISTENZA   (quanto dura)
//   larghezza = AMPIEZZA      (quanto è largo, avvolgente)
//   altezza   = INTENSITÀ     (quanto è forte)
// Ogni profumo (al naso) o gusto/aroma (in bocca) è un PUNTO nello spazio. I punti sono in ordine di
// percezione e una linea li collega: è il percorso del vino nel tempo. Ogni punto può avere un COMMENTO,
// come la nota di una cella di Excel, scritto o dettato a voce.
// Dai punti si ricava un racconto scritto (funzione "racconto"): niente intelligenza artificiale,
// solo le parole che corrispondono ai numeri, così il testo dice esattamente ciò che è stato segnato.
//
// PROVVISORIO: la scala 0–5 e gli aggettivi del racconto sono una proposta, da confermare.

export type Parte = "olfatto" | "bocca";

export type Punto = {
  id: string;
  /** Il profumo, gusto o aroma: "Ciliegia", "Sapido", o testo libero. */
  nome: string;
  /** Categoria della ruota degli aromi (o "gusto" / "tattile"), per il colore. */
  categoria: string;
  intensita: number;
  ampiezza: number;
  persistenza: number;
  commento?: string;
};

export type Spazio = { olfatto: Punto[]; bocca: Punto[] };

export const MASSIMO = 5;
export const ASSI = [
  { id: "persistenza", nome: daTradurre("Persistenza"), breve: "dura" },
  { id: "ampiezza", nome: daTradurre("Ampiezza"), breve: "largo" },
  { id: "intensita", nome: daTradurre("Intensità"), breve: "forte" },
] as const;

export type Categoria = { id: string; nome: string; colore: string; voci: string[] };

/** Le 18 categorie della ruota degli aromi, con i loro colori. */
export const CATEGORIE_AROMI: Categoria[] = ruota.categorie.map((c) => ({
  id: c.id,
  nome: c.nome,
  colore: c.colore,
  voci: c.aromi,
}));

/** In bocca, oltre agli aromi, ci sono i gusti e le sensazioni tattili. */
export const CATEGORIE_BOCCA: Categoria[] = [
  {
    id: "gusto",
    nome: daTradurre("Gusto"),
    colore: "#c8892b",
    voci: [daTradurre("Dolce"), daTradurre("Acido"), daTradurre("Sapido"), daTradurre("Amaro"), daTradurre("Umami")],
  },
  {
    id: "tattile",
    nome: daTradurre("Tattile"),
    colore: "#8e3b46",
    voci: [
      daTradurre("Morbido"),
      daTradurre("Caldo"),
      daTradurre("Astringente"),
      daTradurre("Corposo"),
      daTradurre("Effervescente"),
      daTradurre("Pungente"),
      daTradurre("Vellutato"),
    ],
  },
  ...CATEGORIE_AROMI,
];

export function categorieDi(parte: Parte): Categoria[] {
  return parte === "olfatto" ? CATEGORIE_AROMI : CATEGORIE_BOCCA;
}

export function coloreDi(categoria: string): string {
  return CATEGORIE_BOCCA.find((c) => c.id === categoria)?.colore ?? "#7a6f69";
}

/** Cerca la categoria di un nome scritto a mano ("ciliegia" → fruttati vino rosso). */
export function categoriaDi(nome: string, parte: Parte): string {
  const cercato = nome.trim().toLowerCase();
  return categorieDi(parte).find((c) => c.voci.some((v) => v.toLowerCase() === cercato))?.id ?? "vari";
}

function limita(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(MASSIMO, Math.max(0, Math.round(v * 2) / 2)) : 0;
}

/** Ripulisce i punti arrivati dal modulo: nomi presenti, valori nei limiti, niente doppioni di id. */
export function validaSpazio(grezzo: unknown): Spazio {
  const lista = (v: unknown, parte: Parte): Punto[] => {
    if (!Array.isArray(v)) return [];
    const visti = new Set<string>();
    const out: Punto[] = [];
    for (const p of v as Record<string, unknown>[]) {
      const nome = typeof p?.nome === "string" ? p.nome.trim().slice(0, 60) : "";
      const id = typeof p?.id === "string" ? p.id.slice(0, 40) : "";
      if (!nome || !id || visti.has(id)) continue;
      visti.add(id);
      const commento = typeof p.commento === "string" ? p.commento.trim().slice(0, 600) : "";
      out.push({
        id,
        nome,
        categoria: typeof p.categoria === "string" && p.categoria ? p.categoria : categoriaDi(nome, parte),
        intensita: limita(p.intensita),
        ampiezza: limita(p.ampiezza),
        persistenza: limita(p.persistenza),
        ...(commento ? { commento } : {}),
      });
      if (out.length >= 40) break;
    }
    return out;
  };
  const g = (grezzo ?? {}) as Record<string, unknown>;
  return { olfatto: lista(g.olfatto, "olfatto"), bocca: lista(g.bocca, "bocca") };
}

// ── Il racconto ──────────────────────────────────────────────────────────────

// Si descrive con i nomi degli assi ("intensità alta") e non con aggettivi riferiti al profumo
// ("ciliegia intenso / intensa"): il genere del descrittore non è noto e l'accordo verrebbe sbagliato.
// Ogni coppia asse + grado è un testo a sé, così ogni lingua può accordarla come vuole.
const INTENSITA = [daTradurre("intensità bassa"), daTradurre("intensità media"), daTradurre("intensità alta"), daTradurre("intensità molto alta")] as const;
const AMPIEZZA = [daTradurre("ampiezza bassa"), daTradurre("ampiezza media"), daTradurre("ampiezza alta"), daTradurre("ampiezza molto alta")] as const;
const PERSISTENZA = [daTradurre("persistenza breve"), daTradurre("persistenza media"), daTradurre("persistenza lunga"), daTradurre("persistenza molto lunga")] as const;
const grado = (v: number) => (v <= 1.5 ? 0 : v <= 2.5 ? 1 : v <= 3.5 ? 2 : 3);

/** Il nome di un punto nella lingua scelta: gli aromi della ruota si traducono, quelli scritti a mano no. */
function nomeDi(p: Punto, t: Traduttore): string {
  return minuscolo(t(p.nome), t.lingua);
}

function descrivi(p: Punto, t: Traduttore): string {
  return t("{nome} ({intensita}, {ampiezza}, {persistenza})", {
    nome: nomeDi(p, t),
    intensita: t(INTENSITA[grado(p.intensita)]),
    ampiezza: t(AMPIEZZA[grado(p.ampiezza)]),
    persistenza: t(PERSISTENZA[grado(p.persistenza)]),
  });
}

/** Come cambia da un punto al successivo, sui due assi usati per il racconto. */
function passaggio(prima: Punto, dopo: Punto, t: Traduttore): string {
  const di = dopo.intensita - prima.intensita;
  const da = dopo.ampiezza - prima.ampiezza;
  const sale = di >= 1 ? t("crescendo d'intensità") : di <= -1 ? t("calando d'intensità") : "";
  const allarga = da >= 1 ? t("allargandosi") : da <= -1 ? t("stringendosi") : "";
  if (sale && allarga) return t("{primo} e {secondo}", { primo: sale, secondo: allarga });
  return sale || allarga || t("sullo stesso registro");
}

/**
 * Il percorso scritto di una parte: punto per punto, in ordine, con i passaggi tra l'uno e l'altro
 * e i commenti tra virgolette. Stringa vuota se non ci sono punti. Scritto nella lingua del traduttore
 * (i commenti restano nella lingua in cui sono stati scritti).
 */
export function racconto(punti: Punto[], parte: Parte, t: Traduttore = inItaliano): string {
  if (punti.length === 0) return "";
  const frasi: string[] = [];
  punti.forEach((p, i) => {
    const valori = { cosa: descrivi(p, t), nota: p.commento ? ` — «${p.commento}»` : "", passaggio: i > 0 ? passaggio(punti[i - 1], p, t) : "" };
    if (i === 0) {
      frasi.push(parte === "olfatto" ? t("Al naso si apre con {cosa}{nota}.", valori) : t("In bocca si apre con {cosa}{nota}.", valori));
    } else if (i === punti.length - 1 && punti.length > 2) {
      frasi.push(t("Chiude, {passaggio}, su {cosa}{nota}.", valori));
    } else {
      frasi.push(t("Poi, {passaggio}, arriva {cosa}{nota}.", valori));
    }
  });
  // Una riga di sintesi: il punto più intenso, il più ampio, il più lungo.
  if (punti.length > 1) {
    const massimo = (chiave: "intensita" | "ampiezza" | "persistenza") =>
      punti.reduce((a, b) => (b[chiave] > a[chiave] ? b : a));
    const forte = massimo("intensita");
    const largo = massimo("ampiezza");
    const lungo = massimo("persistenza");
    // "che è anche ciò che dura di più" si riferisce al punto più intenso: gli sta subito accanto.
    const pezzi = [t("il momento più intenso è {nome}", { nome: nomeDi(forte, t) })];
    if (lungo.id === forte.id) pezzi.push(t("che è anche ciò che dura di più"));
    if (largo.id !== forte.id) pezzi.push(t("il più ampio {nome}", { nome: nomeDi(largo, t) }));
    if (lungo.id !== forte.id) pezzi.push(t("ciò che dura di più {nome}", { nome: nomeDi(lungo, t) }));
    frasi.push(t("Nel complesso {pezzi}.", { pezzi: pezzi.join(", ") }));
  }
  return frasi.join(" ");
}

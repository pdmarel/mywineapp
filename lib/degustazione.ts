import ruota from "./aromi.json";
import { daTradurre, inItaliano, type Traduttore } from "./i18n/lingue";

// Modello della degustazione "dinamica": come cambiano le sensazioni in bocca nel tempo.
// Unica fonte per modulo, mappa 3D e (più avanti) prompt del vocale: cambiare qui cambia tutto.
//
// PROVVISORIO, punto di partenza: elenco delle sensazioni e delle fasi.
// La scheda di degustazione statica (esame visivo, olfattivo, gusto-olfattivo) NON è qui: va aggiunta quando
// si dispone della scheda ufficiale. Non ricostruirne i termini a memoria.

export type Gruppo = "tattile" | "gusto" | "aroma" | "giudizio";

export const GRUPPI: { id: Gruppo; nome: string; colore: string }[] = [
  { id: "tattile", nome: daTradurre("Tattile"), colore: "#8e3b46" },
  { id: "gusto", nome: daTradurre("Gusto"), colore: "#c8892b" },
  { id: "aroma", nome: daTradurre("Aromatica"), colore: "#3f6f8f" },
  // Anche equilibrio e qualità si muovono nel tempo.
  { id: "giudizio", nome: daTradurre("Equilibrio e qualità"), colore: "#5a6472" },
];

export const SENSAZIONI: { id: string; nome: string; gruppo: Gruppo }[] = [
  { id: "morbidezza", nome: daTradurre("Morbidezza"), gruppo: "tattile" },
  { id: "calore", nome: daTradurre("Calore alcolico"), gruppo: "tattile" },
  { id: "astringenza", nome: daTradurre("Astringenza"), gruppo: "tattile" },
  { id: "corpo", nome: daTradurre("Corpo"), gruppo: "tattile" },
  { id: "effervescenza", nome: daTradurre("Effervescenza"), gruppo: "tattile" },
  { id: "dolcezza", nome: daTradurre("Dolcezza"), gruppo: "gusto" },
  { id: "acidita", nome: daTradurre("Acidità"), gruppo: "gusto" },
  { id: "sapidita", nome: daTradurre("Sapidità"), gruppo: "gusto" },
  { id: "amaro", nome: daTradurre("Amaro"), gruppo: "gusto" },
  { id: "fruttato", nome: daTradurre("Fruttato"), gruppo: "aroma" },
  { id: "floreale", nome: daTradurre("Floreale"), gruppo: "aroma" },
  { id: "vegetale", nome: daTradurre("Vegetale"), gruppo: "aroma" },
  { id: "speziato", nome: daTradurre("Speziato"), gruppo: "aroma" },
  { id: "tostato", nome: daTradurre("Tostato"), gruppo: "aroma" },
  { id: "minerale", nome: daTradurre("Minerale"), gruppo: "aroma" },
  { id: "terziario", nome: daTradurre("Terziario"), gruppo: "aroma" },
  { id: "equilibrio", nome: daTradurre("Equilibrio"), gruppo: "giudizio" },
  { id: "qualita", nome: daTradurre("Qualità percepita"), gruppo: "giudizio" },
];

/**
 * Per ogni famiglia aromatica, gli aromi specifici suggeriti, presi dalla ruota degli aromi.
 * L'abbinamento famiglia → categorie della ruota è una proposta, da far confermare.
 */
const CATEGORIE_PER_FAMIGLIA: Record<string, string[]> = {
  fruttato: ["fruttati-vino-rosso", "fruttati-vino-bianco", "fruttati-evoluti", "frutta-secca"],
  floreale: ["floreali"],
  vegetale: ["vegetali-freschi", "vegetali-secchi", "erbe-aromatiche", "sottobosco"],
  speziato: ["spezie"],
  tostato: ["tostato-legno", "dolce-pasticceria", "lieviti"],
  minerale: ["minerale"],
  terziario: ["animale", "chimici"],
};

export function vociSpecifiche(famiglia: string): string[] {
  const categorie = CATEGORIE_PER_FAMIGLIA[famiglia] ?? [];
  return ruota.categorie.filter((c) => categorie.includes(c.id)).flatMap((c) => c.aromi);
}

/** I quattro momenti, con il tempo indicativo in secondi dall'ingresso in bocca. */
export const FASI = [
  { id: "attacco", nome: daTradurre("Attacco"), t: 1.5 },
  { id: "centro", nome: daTradurre("Centro bocca"), t: 5 },
  { id: "finale", nome: daTradurre("Finale"), t: 10 },
  { id: "persistenza", nome: daTradurre("Persistenza"), t: 14 },
] as const;

export const INTENSITA_MASSIMA = 5;
export const CODA_PREDEFINITA = 5; // secondi dopo la persistenza prima che la sensazione si spenga

export type Curva = {
  /**
   * Il codice della sensazione ("floreale") oppure, per un aroma specifico dentro una famiglia,
   * "famiglia:nome" ("floreale:Gelsomino"). Così si può restare sul generico o scendere al singolo aroma.
   */
  id: string;
  /** Intensità 0–5 nelle quattro fasi. */
  valori: [number, number, number, number];
  /** Secondi dopo l'ultima fase in cui la sensazione si spegne. */
  coda: number;
  /** "dichiarato": detto o impostato dal degustatore. "stimato": dedotto da un giudizio complessivo. */
  origine: "dichiarato" | "stimato";
  /** Le parole del degustatore da cui è stato ricavato (solo dal vocale). */
  citazione?: string;
};

export type Dinamica = { versione: 1; curve: Curva[] };

/** Andamenti pronti: si toccano invece di muovere quattro cursori. Valori relativi all'intensità massima scelta. */
export const ANDAMENTI: { id: string; nome: string; forma: [number, number, number, number]; coda: number }[] = [
  { id: "costante", nome: daTradurre("Costante"), forma: [1, 1, 1, 0.8], coda: 5 },
  { id: "crescita", nome: daTradurre("In crescita"), forma: [0.3, 0.6, 0.85, 1], coda: 7 },
  { id: "picco", nome: daTradurre("Picco al centro"), forma: [0.5, 1, 0.6, 0.3], coda: 4 },
  { id: "calo", nome: daTradurre("In calo"), forma: [1, 0.7, 0.45, 0.2], coda: 3 },
  { id: "coda", nome: daTradurre("Coda lunga"), forma: [0.5, 0.7, 0.9, 1], coda: 12 },
];

export function applicaAndamento(forma: readonly number[], massimo: number): [number, number, number, number] {
  return forma.map((f) => Math.round(f * massimo * 2) / 2) as [number, number, number, number];
}

/** La sensazione di una curva, anche quando è un aroma specifico ("floreale:Gelsomino" → floreale). */
export function sensazione(id: string) {
  const base = id.split(":")[0];
  return SENSAZIONI.find((s) => s.id === base);
}

/** Il nome da mostrare, nella lingua del traduttore: "Floreale" per la famiglia, "Gelsomino" per l'aroma specifico. */
export function nomeCurva(id: string, t: Traduttore = inItaliano): string {
  const [base, voce] = id.split(":");
  // Un aroma della ruota si traduce; uno scritto a mano resta com'è (t restituisce il testo se non lo conosce).
  return t(voce?.trim() || SENSAZIONI.find((s) => s.id === base)?.nome || id);
}

export function idSpecifico(famiglia: string, voce: string): string {
  return `${famiglia}:${voce.trim().replace(/[:\n]/g, " ").slice(0, 40)}`;
}

/**
 * Riconosce una sensazione dal codice o dal nome, senza badare a maiuscole e accenti:
 * i modelli a volte rispondono "Sapidità" o "Calore alcolico" invece di "sapidita" o "calore".
 */
export function riconosciSensazione(testo: string) {
  const piano = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z]/g, "");
  const cercato = piano(testo);
  return SENSAZIONI.find((s) => piano(s.id) === cercato || piano(s.nome) === cercato);
}

/**
 * Intensità di una curva all'istante t (secondi). Parte da zero, passa per i quattro punti e torna a zero
 * alla fine della coda, con raccordo a coseno: morbido, ma senza mai superare i valori dichiarati
 * (una spline cubica disegnerebbe picchi che nessuno ha sentito).
 */
export function intensitaAl(curva: Curva, t: number): number {
  const fine = FASI[FASI.length - 1].t + Math.max(0.5, curva.coda);
  if (t <= 0 || t >= fine) return 0;
  const punti = [{ t: 0, v: 0 }, ...FASI.map((f, i) => ({ t: f.t, v: curva.valori[i] })), { t: fine, v: 0 }];
  for (let i = 0; i < punti.length - 1; i++) {
    const a = punti[i];
    const b = punti[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (1 - Math.cos((Math.PI * (t - a.t)) / (b.t - a.t))) / 2;
      return a.v + (b.v - a.v) * k;
    }
  }
  return 0;
}

/** Ripulisce una dinamica arrivata dal modulo o dal modello: solo sensazioni note, valori nei limiti. */
export function validaDinamica(grezzo: unknown): Dinamica {
  const curve: Curva[] = [];
  const elenco = (grezzo as { curve?: unknown })?.curve;
  if (Array.isArray(elenco)) {
    for (const c of elenco as Record<string, unknown>[]) {
      // "famiglia:voce" indica un aroma specifico: la famiglia deve essere nota, la voce è libera.
      const [parteBase, ...resto] = c && typeof c.id === "string" ? c.id.split(":") : [""];
      const nota = parteBase ? riconosciSensazione(parteBase) : undefined;
      const voce = resto.join(" ").trim();
      if (!nota || (voce && nota.gruppo !== "aroma")) continue;
      const id = voce ? idSpecifico(nota.id, voce) : nota.id;
      if (curve.some((x) => x.id.toLowerCase() === id.toLowerCase()) || curve.length >= 30) continue;
      if (!Array.isArray(c.valori) || c.valori.length !== 4) continue;
      const valori = c.valori.map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(INTENSITA_MASSIMA, Math.max(0, Math.round(n * 2) / 2)) : 0;
      }) as [number, number, number, number];
      if (valori.every((v) => v === 0)) continue; // una sensazione tutta a zero non è stata sentita: non si disegna
      const coda = Number(c.coda);
      curve.push({
        id,
        valori,
        coda: Number.isFinite(coda) ? Math.min(30, Math.max(0, Math.round(coda))) : CODA_PREDEFINITA,
        origine: c.origine === "stimato" ? "stimato" : "dichiarato",
        ...(typeof c.citazione === "string" && c.citazione.trim() ? { citazione: c.citazione.trim().slice(0, 300) } : {}),
      });
    }
  }
  // Ordine fisso: quello dell'elenco delle sensazioni, così la mappa ha sempre le fasce nello stesso posto.
  // Dentro una famiglia: prima la curva generica, poi gli aromi specifici in ordine alfabetico.
  const posto = (id: string) => SENSAZIONI.findIndex((s) => s.id === id.split(":")[0]);
  curve.sort((a, b) => posto(a.id) - posto(b.id) || a.id.localeCompare(b.id, "it"));
  return { versione: 1, curve };
}

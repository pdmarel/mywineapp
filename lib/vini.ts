// Tipi e piccole funzioni condivise tra le pagine dei vini. Niente accesso al database qui.

import { daTradurre, inItaliano, type Traduttore } from "./i18n/lingue";

// I valori sono quelli salvati nel database (in italiano); a schermo si mostrano con t(tipologia).
export const TIPOLOGIE = [
  daTradurre("Bianco"),
  daTradurre("Bianco frizzante"),
  daTradurre("Bianco passito"),
  daTradurre("Liquoroso"),
  daTradurre("Rosa"),
  daTradurre("Rosa frizzante"),
  daTradurre("Rosso"),
  daTradurre("Rosso frizzante"),
  daTradurre("Rosso passito"),
  daTradurre("Speciale"),
  daTradurre("Spumante bianco"),
  daTradurre("Spumante dolce"),
  daTradurre("Spumante rosa"),
  daTradurre("Sake"),
] as const;

/** La tipologia come si mostra a schermo. "Rosa" ha una chiave a parte: da sola è anche un profumo della ruota. */
export function nomeTipologia(tipologia: string, t: Traduttore): string {
  return t(tipologia === "Rosa" ? daTradurre("Rosa|tipologia") : tipologia);
}

export const BUCKET_ETICHETTE = "etichette";

export type Vitigno = { nome: string; pct?: number };

export type Giacenza = {
  id: string;
  quantita: number;
  posizioni: { id: string; codice: string; luoghi: { id: string; nome: string } | null } | null;
};

export type Vino = {
  id: string;
  cantina_id: string;
  nome_fantasia: string | null;
  denominazione: string | null;
  annata: number | null;
  produttore: string | null;
  tipologia: string | null;
  alcool: number | null;
  capacita_cl: number | null;
  vitigni: Vitigno[] | null;
  foto_fronte: string | null;
  foto_retro: string | null;
  stato: string;
  /** Ultima lettura automatica dell'etichetta: una proposta, non dati confermati. */
  estrazione?: { dati?: Partial<CampiVino>; provider?: string; modello?: string; quando?: string } | null;
  errore?: string | null;
  giacenze?: Giacenza[];
};

export type PosizioneScelta = { id: string; codice: string; luogo: string };

/** Ogni foto ha una copia piccola per gli elenchi: stesso percorso con "_mini" prima dell'estensione. */
export function percorsoMini(percorso: string): string {
  return percorso.replace(/\.jpg$/, "_mini.jpg");
}

/** Titolo leggibile di un vino anche quando mancano dei campi. */
export function titoloVino(v: Pick<Vino, "nome_fantasia" | "denominazione" | "produttore">, t: Traduttore = inItaliano): string {
  return v.nome_fantasia || v.denominazione || v.produttore || t("Vino senza nome");
}

export function bottiglieTotali(v: Pick<Vino, "giacenze">): number {
  return (v.giacenze ?? []).reduce((somma, g) => somma + g.quantita, 0);
}

/** "Sangiovese 90%, Merlot 10" → [{nome:"Sangiovese",pct:90},{nome:"Merlot",pct:10}] */
export function vitigniDaTesto(testo: string): Vitigno[] | null {
  const elenco = testo
    .split(/[,;\n]+/)
    .map((pezzo) => pezzo.trim())
    .filter(Boolean)
    .map((pezzo) => {
      const m = pezzo.match(/^(.*?)[\s:]*(\d{1,3}(?:[.,]\d+)?)\s*%?$/);
      if (m && m[1].trim()) {
        const pct = Number(m[2].replace(",", "."));
        return pct > 0 && pct <= 100 ? { nome: m[1].trim(), pct } : { nome: pezzo };
      }
      return { nome: pezzo };
    });
  return elenco.length > 0 ? elenco : null;
}

export function vitigniInTesto(vitigni: Vitigno[] | null | undefined): string {
  return (vitigni ?? []).map((v) => (v.pct ? `${v.nome} ${v.pct}%` : v.nome)).join(", ");
}

/** Ordina i codici come li leggerebbe una persona: A2 prima di A10. */
export function confrontaCodici(a: string, b: string): number {
  return a.localeCompare(b, "it", { numeric: true });
}

/** I dati dell'etichetta così come si salvano nella tabella "vini" (senza foto). */
export type CampiVino = {
  nome_fantasia: string | null;
  denominazione: string | null;
  produttore: string | null;
  annata: number | null;
  tipologia: string | null;
  alcool: number | null;
  capacita_cl: number | null;
  vitigni: Vitigno[] | null;
  vitigni_fonte: string | null;
};

export function testoCampo(formData: FormData, campo: string): string | null {
  const v = String(formData.get(campo) ?? "").trim();
  return v.length > 0 ? v : null;
}

export function numeroCampo(formData: FormData, campo: string): number | null {
  const v = String(formData.get(campo) ?? "").trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Legge dal modulo i campi dell'etichetta, già ripuliti. Usata sia dal server sia dal telefono (coda senza rete). */
export function campiDaModulo(formData: FormData): CampiVino {
  const annata = numeroCampo(formData, "annata");
  const alcool = numeroCampo(formData, "alcool");
  const capacita = numeroCampo(formData, "capacita_cl");
  const tipologia = testoCampo(formData, "tipologia");
  return {
    nome_fantasia: testoCampo(formData, "nome_fantasia"),
    denominazione: testoCampo(formData, "denominazione"),
    produttore: testoCampo(formData, "produttore"),
    annata: annata && annata >= 1800 && annata <= new Date().getFullYear() + 1 ? Math.round(annata) : null,
    tipologia: tipologia && (TIPOLOGIE as readonly string[]).includes(tipologia) ? tipologia : null,
    alcool: alcool && alcool > 0 && alcool < 100 ? alcool : null,
    capacita_cl: capacita && capacita > 0 && capacita < 3000 ? Math.round(capacita) : null,
    vitigni: vitigniDaTesto(String(formData.get("vitigni") ?? "")),
    vitigni_fonte: testoCampo(formData, "vitigni") ? "manuale" : null,
  };
}

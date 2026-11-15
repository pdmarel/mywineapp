// Le lingue dell'app. L'italiano è la lingua in cui l'app è scritta: i testi nel codice sono in italiano
// e fanno anche da chiave. Per le altre lingue c'è un dizionario (en.json, es.json, de.json, fr.json) che
// a ogni testo italiano fa corrispondere la traduzione; se una traduzione manca si vede l'italiano.
//
// Come si scrive un testo traducibile:
//   t("Salva la degustazione")
//   t("{n} bottiglie in questo luogo", { n: totale })          ← i valori tra graffe
// Il primo argomento deve essere sempre una stringa scritta per esteso tra virgolette doppie: è da lì che
// lo script scripts/i18n-estrai.mjs ricava l'elenco dei testi da tradurre.
// Per i testi che stanno in costanti (elenchi, messaggi d'errore) si usa daTradurre("…"), che non fa nulla
// se non segnalare il testo allo script; la traduzione avviene dove il testo viene mostrato, con t(variabile).
//
// Restano nella lingua in cui sono stati scritti: i dati dei vini, le note, i commenti, i nomi delle posizioni.

export const LINGUE = [
  { id: "it", nome: "Italiano", locale: "it-IT" },
  { id: "en", nome: "English", locale: "en-GB" },
  { id: "es", nome: "Español", locale: "es-ES" },
  { id: "de", nome: "Deutsch", locale: "de-DE" },
  { id: "fr", nome: "Français", locale: "fr-FR" },
] as const;

export type Lingua = (typeof LINGUE)[number]["id"];
export type Dizionario = Record<string, string>;
export type Valori = Record<string, string | number | null | undefined>;
/** La funzione che traduce; porta con sé la lingua, per le poche regole che non stanno in un dizionario. */
export type Traduttore = ((testo: string, valori?: Valori) => string) & { lingua: Lingua };

export const LINGUA_PREDEFINITA: Lingua = "it";
export const BISCOTTO_LINGUA = "lingua";

export function eLingua(v: unknown): v is Lingua {
  return LINGUE.some((l) => l.id === v);
}

export function localeDi(lingua: Lingua): string {
  return LINGUE.find((l) => l.id === lingua)!.locale;
}

/** Sceglie la lingua dall'intestazione del browser ("de-CH,de;q=0.9,en;q=0.8"), se è una delle cinque. */
export function linguaDaBrowser(accetta: string | null | undefined): Lingua {
  for (const pezzo of (accetta ?? "").split(",")) {
    const codice = pezzo.trim().slice(0, 2).toLowerCase();
    if (eLingua(codice)) return codice;
  }
  return LINGUA_PREDEFINITA;
}

/** Segnala allo script di estrazione un testo che verrà tradotto più tardi con t(variabile). Non fa altro. */
export function daTradurre<T extends string>(testo: T): T {
  return testo;
}

export function creaTraduttore(lingua: Lingua, dizionario: Dizionario): Traduttore {
  const t = (testo: string, valori?: Valori) => {
    // Una chiave può finire con "|contesto" per distinguere due testi uguali in italiano ma diversi altrove
    // ("Rosa|tipologia" è il vino rosato, "Rosa" il fiore): in italiano il contesto si toglie.
    const tradotto = dizionario[testo] ?? testo.replace(/\|[a-z]+$/, "");
    return valori ? tradotto.replace(/\{(\w+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome] ?? "") : tutto)) : tradotto;
  };
  return Object.assign(t, { lingua });
}

/** Traduttore che lascia tutto in italiano: per il codice che non ha (ancora) una lingua a disposizione. */
export const inItaliano: Traduttore = creaTraduttore("it", {});

/** Minuscolo dove la lingua lo consente: in tedesco i nomi restano maiuscoli. */
export function minuscolo(testo: string, lingua: Lingua): string {
  return lingua === "de" ? testo : testo.toLowerCase();
}

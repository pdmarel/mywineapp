import "server-only";
import { cookies, headers } from "next/headers";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import { BISCOTTO_LINGUA, creaTraduttore, eLingua, linguaDaBrowser, localeDi, type Dizionario, type Lingua } from "./lingue";

// La lingua lato server: quella scelta (cookie "lingua") oppure, la prima volta, quella del browser.
// Uso nelle pagine, nelle azioni e nelle route:  const { t, lingua, locale } = await traduzione();

const DIZIONARI: Record<Lingua, Dizionario> = { it: {}, en, es, de, fr };

export function dizionarioDi(lingua: Lingua): Dizionario {
  return DIZIONARI[lingua];
}

export async function linguaCorrente(): Promise<Lingua> {
  const scelta = (await cookies()).get(BISCOTTO_LINGUA)?.value;
  if (eLingua(scelta)) return scelta;
  return linguaDaBrowser((await headers()).get("accept-language"));
}

export async function traduzione() {
  const lingua = await linguaCorrente();
  return { t: creaTraduttore(lingua, DIZIONARI[lingua]), lingua, locale: localeDi(lingua) };
}

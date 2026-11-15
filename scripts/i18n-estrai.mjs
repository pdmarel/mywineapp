// Ricava dal codice l'elenco dei testi da tradurre e dice che cosa manca in ogni lingua.
//
//   node scripts/i18n-estrai.mjs            scrive lib/i18n/chiavi.json e stampa il riepilogo
//   node scripts/i18n-estrai.mjs --manca    scrive anche lib/i18n/manca-<lingua>.json (i soli testi senza traduzione)
//
// Trova: t("…"), daTradurre("…") con il testo scritto per esteso tra virgolette doppie, più i nomi della
// ruota degli aromi (lib/aromi.json). Segnala le chiamate t(…) con un argomento che non è né una stringa
// né una variabile semplice, perché lì un testo potrebbe sfuggire alla traduzione.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const radice = join(import.meta.dirname, "..");
const LINGUE = ["en", "es", "de", "fr"];

function file(cartella) {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) return file(percorso);
    return /\.(ts|tsx)$/.test(nome) ? [percorso] : [];
  });
}

const chiavi = new Set();
const sospetti = [];
const LETTERALE = /\b(?:t|daTradurre)\(\s*"((?:[^"\\]|\\.)*)"/g;
const NON_LETTERALE = /\bt\(\s*([`'][^)]{0,40})/g;

for (const percorso of ["app", "components", "lib"].flatMap((c) => file(join(radice, c)))) {
  const testo = readFileSync(percorso, "utf8");
  for (const m of testo.matchAll(LETTERALE)) chiavi.add(JSON.parse(`"${m[1]}"`));
  for (const m of testo.matchAll(NON_LETTERALE)) sospetti.push(`${relative(radice, percorso)}: t(${m[1]}`);
}

const ruota = JSON.parse(readFileSync(join(radice, "lib", "aromi.json"), "utf8"));
for (const c of ruota.categorie) {
  chiavi.add(c.nome);
  for (const a of c.aromi) chiavi.add(a);
}

const elenco = [...chiavi].filter(Boolean).sort((a, b) => a.localeCompare(b, "it"));
writeFileSync(join(radice, "lib", "i18n", "chiavi.json"), JSON.stringify(elenco, null, 1) + "\n");
console.log(`testi da tradurre: ${elenco.length}`);

for (const lingua of LINGUE) {
  const percorso = join(radice, "lib", "i18n", `${lingua}.json`);
  const dizionario = existsSync(percorso) ? JSON.parse(readFileSync(percorso, "utf8")) : {};
  const manca = elenco.filter((k) => !(k in dizionario));
  const avanzi = Object.keys(dizionario).filter((k) => !chiavi.has(k));
  // Una traduzione deve conservare gli stessi segnaposto {nome} dell'originale.
  const segnaposto = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const rotti = elenco.filter((k) => k in dizionario && segnaposto(k) !== segnaposto(dizionario[k]));
  console.log(`${lingua}: mancano ${manca.length}, non più usati ${avanzi.length}, segnaposto diversi ${rotti.length}`);
  for (const k of rotti) console.log(`   segnaposto: ${JSON.stringify(k)} → ${JSON.stringify(dizionario[k])}`);
  if (process.argv.includes("--manca")) writeFileSync(join(radice, "lib", "i18n", `manca-${lingua}.json`), JSON.stringify(manca, null, 1) + "\n");
}

if (sospetti.length) {
  console.log(`\nchiamate t(…) da controllare (${sospetti.length}):`);
  for (const s of sospetti) console.log("  " + s);
}

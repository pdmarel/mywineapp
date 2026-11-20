import "server-only";

// Ricerca del prezzo corrente di un vino sulle enoteche online italiane.
//
// 1. Una ricerca Tavily (1 credito; il piano gratuito ne dà 1.000 al mese) limitata ai siti delle enoteche.
// 2. Per ogni risultato si scarica la pagina e si legge il prezzo dai dati strutturati (JSON-LD), che le enoteche
//    pubblicano per i motori di ricerca: è il dato più affidabile, non una stima.
// 3. Si tengono solo i prodotti che sono davvero quel vino: stesso produttore e stesso nome, niente grappe,
//    cofanetti o formati diversi. Poi si sceglie per annata: quella esatta, altrimenti la più vicina (dichiarata).
//
// Verificato il 14/11/2026 su due vini: Tavily risponde; Callmewine, Tannico, Svinando e Bernabei espongono
// il prezzo in JSON-LD, Vino.com no. Nessun modello di intelligenza artificiale è coinvolto.

export const ENOTECHE = [
  "tannico.it",
  "callmewine.com",
  "svinando.com",
  "bernabei.it",
  "xtrawine.com",
  "winepoint.it",
  "vinopuro.com",
  "enotecaaristide.it",
  "dispensas.it",
  "vino.com",
];

export type VinoDaPrezzare = {
  nome_fantasia: string | null;
  denominazione: string | null;
  produttore: string | null;
  annata: number | null;
  capacita_cl: number | null;
};

export type Offerta = { nome: string; prezzo: number; annata: number | null; fonte: string; url: string };

/** Titolo e testo di un risultato della ricerca: servono alla stima quando non c'è un'offerta sicura. */
export type Frammento = { titolo: string; testo: string; url: string };

export type EsitoPrezzo =
  | { trovato: true; offerta: Offerta; annataEsatta: boolean; alternative: number; affidabilita: number; query: string }
  | {
      trovato: false;
      motivo: "dati_insufficienti" | "ricerca_fallita" | "nessuna_offerta";
      dettaglio?: string;
      query: string;
      frammenti?: Frammento[];
    };

/**
 * Quanto ci si può fidare di un prezzo letto su un'enoteca (0-100).
 * Stessa annata (o vino senza annata): 88, più 3 punti per ogni altra enoteca che lo conferma (fino a 97).
 * Altra annata: 75 meno 5 punti per ogni anno di distanza (minimo 50). Offerta senza annata dichiarata: 65.
 */
export function affidabilitaOfferta(annataVino: number | null, offerta: Offerta, annataEsatta: boolean, alternative: number): number {
  if (annataEsatta) return Math.min(97, (annataVino ? 88 : 82) + 3 * Math.min(alternative, 3));
  if (annataVino && offerta.annata) return Math.max(50, 75 - 5 * Math.abs(offerta.annata - annataVino));
  return 65;
}

const VUOTE = new Set([
  "di", "del", "della", "dei", "delle", "da", "e", "il", "la", "le", "lo", "i", "gli", "in", "a",
  "de", "du", "des", "et", "les", "the", "and",
  "cantina", "cantine", "tenuta", "tenute", "azienda", "agricola", "vitivinicola", "societa", "soc", "srl",
  "sac", "spa", "ss", "fratelli", "f.lli", "domaine", "chateau", "maison", "weingut", "bodega", "bodegas",
  "docg", "doc", "igt", "igp", "dop", "aoc", "aop", "vino", "rosso", "bianco", "rosato",
]);

function normale(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // via gli accenti: "Rabajà" = "rabaja"
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parole(testo: string | null): string[] {
  return normale(testo ?? "")
    .split(" ")
    .filter((p) => p.length >= 3 && !VUOTE.has(p) && !/^(18|19|20)\d{2}$/.test(p));
}

/** Quota di parole di "cercate" presenti nel nome del prodotto (0–1). */
function copertura(cercate: string[], nomeProdotto: string): number {
  if (cercate.length === 0) return 1;
  const nome = ` ${normale(nomeProdotto)} `;
  return cercate.filter((p) => nome.includes(` ${p} `) || nome.includes(` ${p}`)).length / cercate.length;
}

export function queryPrezzo(v: VinoDaPrezzare): string {
  // La denominazione senza sigla aiuta la ricerca; la posizione in cantina non c'entra mai.
  const denominazione = (v.denominazione ?? "").replace(/\b(DOCG|DOC|IGT|IGP|DOP|AOC|AOP)\b/gi, "").trim();
  const pezzi = [v.nome_fantasia, denominazione, v.produttore, v.annata ? String(v.annata) : null];
  if (v.capacita_cl && v.capacita_cl !== 75) pezzi.push(`${v.capacita_cl} cl`);
  return pezzi.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Tutti i prodotti con prezzo dichiarati nei dati strutturati di una pagina. */
function prodottiJsonLd(html: string): { nome: string; prezzo: number }[] {
  const trovati: { nome: string; prezzo: number }[] = [];
  const visita = (nodo: unknown) => {
    if (!nodo || typeof nodo !== "object") return;
    if (Array.isArray(nodo)) return nodo.forEach(visita);
    const o = nodo as Record<string, unknown>;
    if (o.offers && typeof o.name === "string") {
      for (const offerta of ([] as unknown[]).concat(o.offers)) {
        const of = offerta as Record<string, unknown>;
        const valuta = String(of.priceCurrency ?? "EUR").toUpperCase();
        const prezzo = Number(String(of.price ?? of.lowPrice ?? "").replace(",", "."));
        if (valuta === "EUR" && prezzo > 0.5 && prezzo < 10000) trovati.push({ nome: o.name, prezzo });
      }
    }
    Object.values(o).forEach(visita);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visita(JSON.parse(m[1]));
    } catch {
      // blocco JSON-LD malformato: si ignora
    }
  }
  return trovati;
}

async function leggiPagina(url: string): Promise<{ nome: string; prezzo: number }[]> {
  try {
    const risposta = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(9000),
      redirect: "follow",
    });
    if (!risposta.ok) return [];
    const prodotti = prodottiJsonLd(await risposta.text());
    // Una pagina con tanti prodotti è un elenco di categoria, non la scheda di un vino.
    return prodotti.length <= 3 ? prodotti : [];
  } catch {
    return [];
  }
}

export async function cercaPrezzo(v: VinoDaPrezzare): Promise<EsitoPrezzo> {
  const query = queryPrezzo(v);
  const chiaveNome = parole(v.nome_fantasia).length > 0 ? parole(v.nome_fantasia) : parole(v.denominazione);
  const chiaveProduttore = parole(v.produttore);
  // Senza produttore e senza un nome non si può riconoscere il vino tra i risultati.
  if (chiaveNome.length === 0 || chiaveProduttore.length === 0) {
    return { trovato: false, motivo: "dati_insufficienti", query };
  }
  const chiave = process.env.TAVILY_API_KEY;
  if (!chiave) return { trovato: false, motivo: "ricerca_fallita", dettaglio: "manca TAVILY_API_KEY", query };

  let risultati: { url: string; title?: string; content?: string }[] = [];
  try {
    const risposta = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${query} prezzo`,
        search_depth: "basic",
        max_results: 8,
        include_domains: ENOTECHE,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!risposta.ok) {
      const corpo = await risposta.text();
      return { trovato: false, motivo: "ricerca_fallita", dettaglio: `Tavily ${risposta.status}: ${corpo.slice(0, 150)}`, query };
    }
    risultati = ((await risposta.json()) as { results?: { url: string; title?: string; content?: string }[] }).results ?? [];
  } catch (e) {
    return { trovato: false, motivo: "ricerca_fallita", dettaglio: e instanceof Error ? e.message : String(e), query };
  }

  const pagine = await Promise.all(
    risultati.map(async (r) => ({ url: r.url, prodotti: await leggiPagina(r.url) })),
  );

  const formato = v.capacita_cl ?? 75;
  const offerte: Offerta[] = [];
  for (const pagina of pagine) {
    for (const p of pagina.prodotti) {
      const nome = normale(p.nome);
      if (/\b(grappa|olio|aceto|bicchier|calic|decanter|cofanetto|cassa|cassetta|confezione da|x ?6|x ?3|6 bottiglie|3 bottiglie)\b/.test(nome)) continue;
      // Formati diversi dal proprio: magnum e mezze bottiglie hanno un altro prezzo.
      const eMagnum = /\b(magnum|150 ?cl|1 ?5 ?l|jeroboam|300 ?cl)\b/.test(nome);
      const eMezza = /\b(375 ?ml|37 ?5 ?cl|mezza bottiglia|50 ?cl|500 ?ml)\b/.test(nome);
      if ((formato === 75 && (eMagnum || eMezza)) || (formato >= 150 && !eMagnum) || (formato < 75 && !eMezza)) continue;
      // Il nome del vino deve esserci tutto; il produttore almeno in buona parte, nel nome del prodotto
      // o nell'indirizzo della pagina (alcune enoteche lo scrivono solo lì).
      if (copertura(chiaveNome, p.nome) < 1) continue;
      if (copertura(chiaveProduttore, `${p.nome} ${pagina.url}`) < 0.6) continue;
      const anno = Number(p.nome.match(/\b(19|20)\d{2}\b/)?.[0]);
      offerte.push({
        nome: p.nome.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&"),
        prezzo: p.prezzo,
        annata: anno || null,
        fonte: new URL(pagina.url).hostname.replace(/^www\./, ""),
        url: pagina.url,
      });
    }
  }
  if (offerte.length === 0) {
    const frammenti = risultati.map((r) => ({ titolo: r.title ?? "", testo: r.content ?? "", url: r.url })).filter((f) => f.titolo || f.testo);
    return { trovato: false, motivo: "nessuna_offerta", query, frammenti };
  }

  // Annata esatta se c'è (o se il vino non ha annata); altrimenti la più vicina, e lo si dichiara.
  const esatte = v.annata ? offerte.filter((o) => o.annata === v.annata) : offerte;
  let scelte = esatte;
  if (scelte.length === 0) {
    const conAnno = offerte.filter((o) => o.annata);
    if (conAnno.length > 0) {
      const distanza = Math.min(...conAnno.map((o) => Math.abs(o.annata! - v.annata!)));
      scelte = conAnno.filter((o) => Math.abs(o.annata! - v.annata!) === distanza);
    } else {
      scelte = offerte;
    }
  }
  // Tra più enoteche si prende il prezzo di mezzo (il più basso dei due centrali): né l'offerta lampo né il più caro.
  scelte.sort((a, b) => a.prezzo - b.prezzo);
  const offerta = scelte[Math.floor((scelte.length - 1) / 2)];
  const annataEsatta = esatte.length > 0;
  const alternative = scelte.length - 1;
  return { trovato: true, offerta, annataEsatta, alternative, affidabilita: affidabilitaOfferta(v.annata, offerta, annataEsatta, alternative), query };
}

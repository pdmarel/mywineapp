// Collaudo del service worker (public/sw.js) senza browser: lo carica in un ambiente simulato
// (cache finta, rete finta) e controlla che risposta dà nei casi che contano in cantina.
//
//   node scripts/prova-sw.mjs
//
// I tempi di attesa del service worker sono ridotti di 100 volte per non aspettare davvero.
// Non sostituisce una prova su un telefono vero (qui non c'è il browser), ma verifica la logica:
// rete che non risponde, rete assente, copia presente o mancante, inserimento rapido come ripiego.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const BASE = "http://app.test";
const sorgente = readFileSync(join(import.meta.dirname, "..", "public", "sw.js"), "utf8")
  .replace("ATTESA_RETE_MS = 4000", "ATTESA_RETE_MS = 40")
  .replace("ATTESA_SENZA_COPIA_MS = 9000", "ATTESA_SENZA_COPIA_MS = 90");

class CacheFinta {
  constructor() {
    this.voci = new Map();
  }
  chiave(r, ignoraRicerca) {
    const u = new URL(typeof r === "string" ? r : r.url, BASE);
    return ignoraRicerca ? u.origin + u.pathname : u.href;
  }
  async put(r, risposta) {
    this.voci.set(this.chiave(r), { corpo: await risposta.text(), stato: risposta.status, intestazioni: [...risposta.headers] });
  }
  async match(r, opzioni = {}) {
    const k = this.chiave(r, opzioni.ignoreSearch);
    for (const [chiave, v] of this.voci) {
      if ((opzioni.ignoreSearch ? new URL(chiave).origin + new URL(chiave).pathname : chiave) === k) {
        return new Response(v.corpo, { status: v.stato, headers: v.intestazioni });
      }
    }
    return undefined;
  }
  async keys() {
    return [...this.voci.keys()].map((url) => ({ url }));
  }
}

function creaAmbiente(rete) {
  const archivi = new Map();
  const gestori = {};
  const caches = {
    async open(nome) {
      if (!archivi.has(nome)) archivi.set(nome, new CacheFinta());
      return archivi.get(nome);
    },
    async keys() {
      return [...archivi.keys()];
    },
    async delete(nome) {
      return archivi.delete(nome);
    },
  };
  class RichiestaFinta {
    constructor(url) {
      this.url = new URL(url, BASE).href;
      this.method = "GET";
      this.mode = "cors";
      this.headers = new Headers();
    }
  }
  const self = {
    location: new URL(BASE),
    addEventListener: (n, f) => (gestori[n] = f),
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  const contesto = vm.createContext({ self, caches, fetch: (r) => rete(r), Request: RichiestaFinta, Response, URL, Headers, setTimeout, clearTimeout, Promise, console });
  vm.runInContext(sorgente, contesto);
  return { archivi, gestori, caches };
}

/** Simula una richiesta del browser e dice cosa risponde il service worker, e dopo quanto. */
async function chiedi(ambiente, percorso, { navigazione = true, rsc = false } = {}) {
  const richiesta = { url: new URL(percorso + (rsc ? (percorso.includes("?") ? "&" : "?") + "_rsc=1" : ""), BASE).href, method: "GET", mode: navigazione ? "navigate" : "cors", headers: new Headers() };
  let risposta;
  const lavori = [];
  ambiente.gestori.fetch({ request: richiesta, respondWith: (p) => (risposta = p), waitUntil: (p) => lavori.push(p) });
  if (!risposta) return { gestito: false };
  const inizio = Date.now();
  const r = await risposta;
  const ms = Date.now() - inizio;
  await Promise.allSettled(lavori);
  return { gestito: true, stato: r.status, tipo: r.type, dove: r.headers.get("location"), testo: r.status === 302 ? "" : await r.clone().text(), ms };
}

const SILENZIO = () => new Promise(() => {}); // rete con poco segnale: la richiesta non risponde mai
const ASSENTE = () => Promise.reject(new TypeError("Failed to fetch")); // rete assente: errore subito
const pagina = (testo) => new Response(`<html>${testo} <script src="/_next/static/chunks/a.js"></script></html>`, { status: 200 });

let falliti = 0;
function verifica(nome, condizione, dettaglio = "") {
  console.log(`${condizione ? "ok    " : "FALLITO"}  ${nome}${dettaglio ? `  (${dettaglio})` : ""}`);
  if (!condizione) falliti++;
}

const UUID = "2936a140-4c95-4b8f-80cb-86e69da18c5f";

// 1. Rete buona: risponde la rete, tiene la copia della pagina e dei suoi file.
{
  const a = creaAmbiente((r) => (String(r.url ?? r).includes("/_next/static/") ? Promise.resolve(new Response("js", { status: 200 })) : Promise.resolve(pagina("cantina"))));
  const r = await chiedi(a, "/cantine/" + UUID);
  const pagine = await (await a.caches.open("mywineapp-pagine-v2")).keys();
  const file = await (await a.caches.open("mywineapp-file-v2")).keys();
  verifica("rete buona: risponde la rete", r.stato === 200 && r.testo.includes("cantina"));
  verifica("rete buona: la pagina resta in copia", pagine.length === 1);
  verifica("rete buona: restano in copia anche i file della pagina", file.some((f) => f.url.endsWith("/_next/static/chunks/a.js")));
}

// 2. Poco segnale, pagina già vista: dopo l'attesa si usa la copia (prima c'era la rete buona).
{
  let buona = true;
  const a = creaAmbiente((r) => (String(r.url ?? r).includes("/_next/static/") ? Promise.resolve(new Response("js")) : buona ? Promise.resolve(pagina("vecchia copia")) : SILENZIO()));
  await chiedi(a, "/");
  buona = false;
  const r = await chiedi(a, "/");
  verifica("poco segnale, pagina già vista: si apre la copia", r.stato === 200 && r.testo.includes("vecchia copia"), `${r.ms} ms ≈ ${r.ms * 100} ms reali`);
  verifica("poco segnale, pagina già vista: l'attesa è breve", r.ms < 150, "attesa prevista ≈ 4 s reali");
}

// 3. Poco segnale, pagina mai vista, inserimento rapido in copia: si passa all'inserimento ricordando la cantina.
{
  let buona = true;
  const a = creaAmbiente((r) => (String(r.url ?? r).includes("/_next/static/") ? Promise.resolve(new Response("js")) : buona ? Promise.resolve(pagina("inserimento rapido")) : SILENZIO()));
  await chiedi(a, "/inserimento");
  buona = false;
  const r = await chiedi(a, "/cantine/" + UUID + "/vini/abc");
  verifica("poco segnale, pagina mai vista: ripiego sull'inserimento rapido", r.stato === 302 && r.dove === `${BASE}/inserimento?cantina=${UUID}`, `${r.stato} → ${r.dove}`);
  verifica("poco segnale, pagina mai vista: non si resta ad aspettare", r.ms < 250, `${r.ms * 100} ms reali (limite 9 s)`);
  const q = await chiedi(a, "/inserimento?cantina=" + UUID);
  verifica("l'inserimento rapido si apre anche con ?cantina= non in copia", q.stato === 200 && q.testo.includes("inserimento rapido"));
  verifica("l'inserimento rapido si apre subito dalla copia, senza attendere la rete", q.ms < 15, `${q.ms} ms (rete muta)`);
}

// 3b. L'inserimento rapido chiesto «in anticipo» dalla pagina (non è una navigazione) tiene in copia anche i suoi file.
{
  const a = creaAmbiente((r) => (String(r.url ?? r).includes("/_next/static/") ? Promise.resolve(new Response("js")) : Promise.resolve(pagina("inserimento rapido"))));
  const richiesta = { url: BASE + "/inserimento", method: "GET", mode: "cors", headers: new Headers() };
  const lavori = [];
  let risposta;
  a.gestori.fetch({ request: richiesta, respondWith: (p) => (risposta = p), waitUntil: (p) => lavori.push(p) });
  await risposta;
  await Promise.allSettled(lavori);
  const file = await (await a.caches.open("mywineapp-file-v2")).keys();
  verifica("l'inserimento chiesto in anticipo tiene in copia anche i suoi file", file.some((f) => f.url.endsWith("/_next/static/chunks/a.js")));
}

// 4. Rete assente (errore subito), pagina mai vista: ripiego immediato, senza aspettare i 9 secondi.
{
  let buona = true;
  const a = creaAmbiente((r) => (String(r.url ?? r).includes("/_next/static/") ? Promise.resolve(new Response("js")) : buona ? Promise.resolve(pagina("inserimento rapido")) : ASSENTE()));
  await chiedi(a, "/inserimento");
  buona = false;
  const r = await chiedi(a, "/degustazioni");
  verifica("rete assente, pagina mai vista: ripiego immediato", r.stato === 302 && r.dove === `${BASE}/inserimento` && r.ms < 20, `${r.ms} ms`);
}

// 5. Né la pagina né l'inserimento rapido in copia: una pagina semplice, non una schermata bianca.
{
  const a = creaAmbiente(SILENZIO);
  const r = await chiedi(a, "/");
  verifica("niente in copia: pagina di cortesia", r.stato === 503 && r.testo.includes("Senza rete"), `${r.stato}`);
  const i = await chiedi(a, "/inserimento");
  verifica("niente in copia: anche /inserimento non va in ciclo", i.stato === 503 && i.testo.includes("Riprova"));
}

// 6. Dati di pagina (navigazione dentro l'app) senza copia: errore rapido, così l'app ripiega sul caricamento normale.
{
  const a = creaAmbiente(SILENZIO);
  const r = await chiedi(a, "/cantine/" + UUID, { navigazione: false, rsc: true });
  verifica("dati di pagina senza copia: errore dopo l'attesa breve", r.stato === 503 && r.ms < 150, `${r.ms * 100} ms reali (limite 4 s)`);
}

// 7. Accesso e uscita non si toccano; le richieste non GET nemmeno.
{
  const a = creaAmbiente(SILENZIO);
  verifica("/login non è gestito dal service worker", (await chiedi(a, "/login")).gestito === false);
  verifica("/auth non è gestito dal service worker", (await chiedi(a, "/auth/esci")).gestito === false);
}

console.log(falliti === 0 ? "\nTutti i controlli sono andati a buon fine." : `\n${falliti} controlli falliti.`);
process.exit(falliti === 0 ? 0 : 1);

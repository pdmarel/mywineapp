"use client";

import { creaClientBrowser } from "@/lib/supabase/browser";
import { confrontaCodici, type PosizioneScelta } from "@/lib/vini";

// Copia sul telefono delle cantine e delle loro posizioni (IndexedDB), per poter inserire bottiglie
// anche quando il server non è raggiungibile: la pagina «Inserimento rapido» legge da qui, non dal server.
// Si aggiorna da sola ogni volta che l'app si apre con il segnale (vedi SincronizzaCantine).
// All'uscita dall'app la copia si cancella: contiene i nomi delle cantine.

const NOME_DB = "mywineapp-cantine";
const TABELLA = "cantine";
export const EVENTO_CANTINE = "mywineapp:cantine";

export type CantinaLocale = {
  id: string;
  nome: string;
  posizioni: PosizioneScelta[];
  /** Quando la copia è stata presa dal server (millisecondi). */
  aggiornata: number;
};

function apri(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const richiesta = indexedDB.open(NOME_DB, 1);
    richiesta.onupgradeneeded = () => {
      if (!richiesta.result.objectStoreNames.contains(TABELLA)) {
        richiesta.result.createObjectStore(TABELLA, { keyPath: "id" });
      }
    };
    richiesta.onsuccess = () => ok(richiesta.result);
    richiesta.onerror = () => ko(richiesta.error ?? new Error("Archivio del telefono non disponibile"));
  });
}

export async function leggiCantine(): Promise<CantinaLocale[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await apri();
  try {
    const tutte = await new Promise<CantinaLocale[]>((ok, ko) => {
      const r = db.transaction(TABELLA, "readonly").objectStore(TABELLA).getAll();
      r.onsuccess = () => ok(r.result as CantinaLocale[]);
      r.onerror = () => ko(r.error);
    });
    return tutte.sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  } finally {
    db.close();
  }
}

/** Sostituisce tutta la copia in un colpo solo: una cantina tolta dal server sparisce anche dal telefono. */
async function sostituisci(cantine: CantinaLocale[]): Promise<void> {
  const db = await apri();
  try {
    await new Promise<void>((ok, ko) => {
      const t = db.transaction(TABELLA, "readwrite");
      const archivio = t.objectStore(TABELLA);
      archivio.clear();
      for (const c of cantine) archivio.put(c);
      t.oncomplete = () => ok();
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    });
  } finally {
    db.close();
  }
}

/** Cancella la copia (uscita dall'app). */
export async function svuotaArchivioCantine(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await sostituisci([]);
}

type RigaCantina = { id: string; nome: string; luoghi: { nome: string; posizioni: { id: string; codice: string }[] }[] | null };

let ultimoGiro = 0;
let paginaScaldata = false;

/**
 * Tiene in copia nel service worker la pagina dell'inserimento rapido: è quella a cui si ripiega
 * quando una pagina non è disponibile e la rete non risponde. Serve il service worker già attivo.
 */
async function scaldaPaginaOffline(): Promise<void> {
  if (paginaScaldata || !("serviceWorker" in navigator)) return;
  try {
    await Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(ok, 4000))]);
    const risposta = await fetch("/inserimento", { credentials: "same-origin" });
    if (risposta.ok && !risposta.redirected) paginaScaldata = true;
  } catch {
    // senza rete: si riprova al prossimo giro
  }
}

/** Scarica dal server cantine e posizioni dell'utente e le tiene sul telefono. Silenzioso se non c'è rete o accesso. */
export async function aggiornaCantine(forza = false): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!forza && Date.now() - ultimoGiro < 60_000) return;
  ultimoGiro = Date.now();

  const supabase = creaClientBrowser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const { data, error } = await supabase.from("cantine").select("id, nome, luoghi(nome, posizioni(id, codice))");
  if (error || !data) return;

  const adesso = Date.now();
  const cantine: CantinaLocale[] = (data as unknown as RigaCantina[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    aggiornata: adesso,
    posizioni: (c.luoghi ?? [])
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "it"))
      .flatMap((luogo) =>
        luogo.posizioni
          .slice()
          .sort((a, b) => confrontaCodici(a.codice, b.codice))
          .map((p) => ({ id: p.id, codice: p.codice, luogo: luogo.nome })),
      ),
  }));
  await sostituisci(cantine);
  window.dispatchEvent(new Event(EVENTO_CANTINE));
  void scaldaPaginaOffline();
}

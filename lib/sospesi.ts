"use client";

import { daTradurre } from "@/lib/i18n/lingue";
import { creaClientBrowser } from "@/lib/supabase/browser";
import { BUCKET_ETICHETTE, percorsoMini, type CampiVino } from "@/lib/vini";

// Coda delle bottiglie nuove, tenuta sul telefono (IndexedDB).
//
// In cantina spesso non c'è segnale. Una bottiglia nuova viene quindi scritta PRIMA qui, con le sue foto,
// e solo dopo spedita al server. Se la rete manca resta "in sospeso" e riparte da sola quando torna.
// Ogni passo dell'invio è ripetibile senza creare doppioni: l'identificativo del vino nasce sul telefono
// e i passi già fatti sono segnati nel record.

const NOME_DB = "mywineapp";
const TABELLA = "sospesi";
export const EVENTO_SOSPESI = "mywineapp:sospesi";

export type FotoDaInviare = { foto: Blob; mini: Blob };

export type Sospeso = {
  /** Identificativo del vino, generato sul telefono. */
  id: string;
  cantinaId: string;
  creatoIl: number;
  titolo: string;
  campi: CampiVino;
  posizioneId: string;
  quantita: number;
  foto: { fronte?: FotoDaInviare; retro?: FotoDaInviare };
  fatto: { foto: boolean; vino: boolean; giacenzaId?: string; movimento: boolean };
  tentativi: number;
  errore?: string;
};

export type EsitoInvio = {
  inviati: number;
  rimasti: number;
  /** "rete": manca il segnale; "accesso": sessione scaduta, bisogna rientrare; "errore": altro problema. */
  motivo?: "rete" | "accesso" | "errore";
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
    richiesta.onerror = () => ko(richiesta.error ?? new Error(daTradurre("Archivio del telefono non disponibile")));
  });
}

async function operazione<T>(modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await apri();
  try {
    return await new Promise<T>((ok, ko) => {
      const richiesta = fn(db.transaction(TABELLA, modo).objectStore(TABELLA));
      richiesta.onsuccess = () => ok(richiesta.result);
      richiesta.onerror = () => ko(richiesta.error ?? new Error(daTradurre("Scrittura sul telefono non riuscita")));
    });
  } finally {
    db.close();
  }
}

function avvisa() {
  window.dispatchEvent(new Event(EVENTO_SOSPESI));
}

export async function elencoSospesi(): Promise<Sospeso[]> {
  if (typeof indexedDB === "undefined") return [];
  const tutti = await operazione<Sospeso[]>("readonly", (t) => t.getAll());
  return tutti.sort((a, b) => a.creatoIl - b.creatoIl);
}

/** Scrive la bottiglia sul telefono. Da questo momento non si perde più, anche chiudendo l'app. */
export async function mettiInCoda(nuovo: Omit<Sospeso, "creatoIl" | "fatto" | "tentativi">): Promise<void> {
  const record: Sospeso = {
    ...nuovo,
    creatoIl: Date.now(),
    fatto: { foto: false, vino: false, movimento: false },
    tentativi: 0,
  };
  await operazione("readwrite", (t) => t.put(record));
  avvisa();
}

async function salva(record: Sospeso) {
  await operazione("readwrite", (t) => t.put(record));
}

async function togli(id: string) {
  await operazione("readwrite", (t) => t.delete(id));
}

/** Toglie dalla coda una bottiglia che non si vuole più inviare. */
export async function scartaSospeso(id: string): Promise<void> {
  await togli(id);
  avvisa();
}

function mancaLaRete(errore: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // Richiesta interrotta perché troppo lenta (vedi lib/supabase/browser.ts): con poco segnale vale come rete assente.
  const nome = (errore as { name?: string } | null)?.name;
  if (nome === "TimeoutError" || nome === "AbortError") return true;
  const testo = errore instanceof Error ? errore.message : String(errore);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted/i.test(testo);
}

/** Spedisce una bottiglia. Ogni passo fatto viene segnato: riprovare non crea doppioni. */
async function inviaUno(record: Sospeso, userId: string): Promise<void> {
  const supabase = creaClientBrowser();

  if (!record.fatto.foto) {
    const archivio = supabase.storage.from(BUCKET_ETICHETTE);
    const opzioni = { contentType: "image/jpeg", upsert: true };
    for (const lato of ["fronte", "retro"] as const) {
      const f = record.foto[lato];
      if (!f) continue;
      const percorso = `${record.cantinaId}/${record.id}/${lato}.jpg`;
      const a = await archivio.upload(percorso, f.foto, opzioni);
      if (a.error) throw new Error(a.error.message);
      const b = await archivio.upload(percorsoMini(percorso), f.mini, opzioni);
      if (b.error) throw new Error(b.error.message);
    }
    record.fatto.foto = true;
    await salva(record);
  }

  if (!record.fatto.vino) {
    const haTesto = record.campi.nome_fantasia || record.campi.denominazione || record.campi.produttore;
    const { error } = await supabase.from("vini").insert({
      id: record.id,
      cantina_id: record.cantinaId,
      ...record.campi,
      foto_fronte: record.foto.fronte ? `${record.cantinaId}/${record.id}/fronte.jpg` : null,
      foto_retro: record.foto.retro ? `${record.cantinaId}/${record.id}/retro.jpg` : null,
      // Solo foto, niente dati: resta "da analizzare" per la lettura automatica.
      stato: haTesto ? "confermato" : "da_analizzare",
    });
    // 23505 = esiste già: un invio precedente era arrivato fin qui prima di interrompersi.
    if (error && error.code !== "23505") throw new Error(error.message);
    record.fatto.vino = true;
    await salva(record);
  }

  if (!record.fatto.giacenzaId) {
    const { error } = await supabase
      .from("giacenze")
      .upsert(
        { vino_id: record.id, posizione_id: record.posizioneId, quantita: record.quantita },
        { onConflict: "vino_id,posizione_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    const { data, error: erroreLettura } = await supabase
      .from("giacenze")
      .select("id")
      .eq("vino_id", record.id)
      .eq("posizione_id", record.posizioneId)
      .single();
    if (erroreLettura || !data) throw new Error(erroreLettura?.message ?? daTradurre("Giacenza non trovata"));
    record.fatto.giacenzaId = data.id;
    await salva(record);
  }

  if (!record.fatto.movimento) {
    if (record.quantita > 0) {
      const { error } = await supabase.from("movimenti").insert({
        giacenza_id: record.fatto.giacenzaId,
        delta: record.quantita,
        motivo: "carico",
        user_id: userId,
      });
      if (error) throw new Error(error.message);
    }
    record.fatto.movimento = true;
    await salva(record);
  }

  await togli(record.id);

  // Ogni bottiglia con foto: si chiede subito la lettura dell'etichetta, senza aspettarla. La proposta riempie
  // solo i campi rimasti vuoti, quindi vale anche se chi inserisce ha già scritto qualcosa. Con ?auto=1 una scheda
  // già compilata che la lettura non arricchisce resta confermata. Se la richiesta non parte (rete, quota) non è
  // un problema: ci pensa il lavoro notturno, e resta il pulsante nella scheda del vino.
  if (record.foto.fronte || record.foto.retro) {
    void fetch(`/api/vini/${record.id}/leggi?auto=1`, { method: "POST", keepalive: true }).catch(() => {});
  }
}

let invioInCorso: Promise<EsitoInvio> | null = null;

/** Prova a spedire tutto ciò che è in coda. Chiamate contemporanee condividono lo stesso giro. */
export function inviaSospesi(): Promise<EsitoInvio> {
  if (!invioInCorso) {
    invioInCorso = giro().finally(() => {
      invioInCorso = null;
      avvisa();
    });
  }
  return invioInCorso;
}

async function giro(): Promise<EsitoInvio> {
  const coda = await elencoSospesi();
  if (coda.length === 0) return { inviati: 0, rimasti: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { inviati: 0, rimasti: coda.length, motivo: "rete" };
  }

  let userId: string;
  try {
    // La sessione si legge dal telefono: non serve chiedere al server chi sei per sapere chi sei
    // (e con poco segnale quella richiesta resterebbe appesa). Se la sessione è scaduta si rinnova da sola.
    const { data, error } = await creaClientBrowser().auth.getSession();
    if (error || !data.session) {
      return { inviati: 0, rimasti: coda.length, motivo: mancaLaRete(error) ? "rete" : "accesso" };
    }
    userId = data.session.user.id;
  } catch (e) {
    return { inviati: 0, rimasti: coda.length, motivo: mancaLaRete(e) ? "rete" : "errore" };
  }

  let inviati = 0;
  let motivo: EsitoInvio["motivo"];
  for (const record of coda) {
    try {
      await inviaUno(record, userId);
      inviati++;
      avvisa();
    } catch (e) {
      record.tentativi++;
      record.errore = e instanceof Error ? e.message : String(e);
      await salva(record);
      if (mancaLaRete(e)) {
        motivo = "rete";
        break; // inutile insistere con le altre: riparte quando torna il segnale
      }
      motivo = "errore"; // problema di questa bottiglia: si prova comunque con le successive
    }
  }
  return { inviati, rimasti: coda.length - inviati, motivo };
}

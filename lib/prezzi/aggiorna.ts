import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cercaPrezzo, type EsitoPrezzo, type VinoDaPrezzare } from "./cerca";
import { stimaPrezzo, type Stima } from "./stima";

// Cerca il prezzo di un vino e ne scrive l'esito nello storico (tabella "prezzi").
// Va chiamata con il client di servizio: la tabella è scrivibile solo dal server.
//
// Un prezzo c'è (quasi) sempre:
//  - trovato su un'enoteca online → prezzo letto, con la sua affidabilità (alta);
//  - non trovato, o dati insufficienti per riconoscerlo → prezzo di riferimento STIMATO (metodo "stima"),
//    con un'affidabilità più bassa e una nota che dice su che cosa si fonda.
// Solo se nemmeno la stima riesce resta la riga "non trovato" (prezzo vuoto), che serve a non ripetere la
// stessa ricerca ogni giorno.

export type EsitoAggiornamento = EsitoPrezzo & { stima?: Stima };

type Riga = Record<string, unknown>;

/** Inserisce una riga di prezzo; se il database non ha ancora le colonne nuove (0005) la salva senza. */
async function inserisci(admin: SupabaseClient, riga: Riga) {
  const { error } = await admin.from("prezzi").insert(riga);
  if (!error) return;
  if (error.code === "PGRST204" || error.code === "42703") {
    const { affidabilita: _a, nota: _n, ...senza } = riga;
    void _a;
    void _n;
    const secondo = await admin.from("prezzi").insert(senza);
    if (secondo.error) console.error("Prezzo non salvato:", secondo.error.message);
    return;
  }
  console.error("Prezzo non salvato:", error.message);
}

export async function aggiornaPrezzo(admin: SupabaseClient, vino: VinoDaPrezzare & { id: string }): Promise<EsitoAggiornamento> {
  const esito = await cercaPrezzo(vino);

  // Conteggio dei crediti di ricerca usati (mai bloccante).
  if (esito.trovato || esito.motivo !== "dati_insufficienti") {
    try {
      const chiave = { giorno: new Date().toISOString().slice(0, 10), provider: "tavily", compito: "prezzo" };
      const { data } = await admin.from("uso_api").select("ok, errori").match(chiave).maybeSingle();
      const fallita = !esito.trovato && esito.motivo === "ricerca_fallita";
      await admin.from("uso_api").upsert({
        ...chiave,
        ok: (data?.ok ?? 0) + (fallita ? 0 : 1),
        errori: (data?.errori ?? 0) + (fallita ? 1 : 0),
      });
    } catch {
      // il conteggio non deve mai far fallire la ricerca
    }
  }

  if (esito.trovato) {
    await inserisci(admin, {
      vino_id: vino.id,
      prezzo: esito.offerta.prezzo,
      annata_trovata: esito.offerta.annata,
      fonte: esito.offerta.fonte,
      url: esito.offerta.url,
      metodo: "json-ld",
      provider: "tavily",
      affidabilita: esito.affidabilita,
    });
    return esito;
  }
  // Ricerca non riuscita (crediti finiti, servizio giù): niente stima, si riproverà.
  if (esito.motivo === "ricerca_fallita") return esito;

  const stima = await stimaPrezzo(vino, esito.frammenti ?? []);
  if (stima) {
    await inserisci(admin, {
      vino_id: vino.id,
      prezzo: stima.prezzo,
      fonte: "stima",
      metodo: "stima",
      provider: stima.provider,
      affidabilita: stima.affidabilita,
      nota: `Tra ${stima.minimo} e ${stima.massimo} €. ${stima.base}`.trim().slice(0, 300),
    });
    return { ...esito, stima };
  }
  if (esito.motivo === "nessuna_offerta") {
    await inserisci(admin, { vino_id: vino.id, prezzo: null, metodo: "non_trovato", provider: "tavily" });
  }
  return esito;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cercaPrezzo, type EsitoPrezzo, type VinoDaPrezzare } from "./cerca";

// Cerca il prezzo di un vino e ne scrive l'esito nello storico (tabella "prezzi").
// Va chiamata con il client di servizio: la tabella è scrivibile solo dal server.
// Anche un "non trovato" diventa una riga (prezzo vuoto): serve a non ripetere la stessa ricerca ogni giorno.

export async function aggiornaPrezzo(
  admin: SupabaseClient,
  vino: VinoDaPrezzare & { id: string },
): Promise<EsitoPrezzo> {
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
    await admin.from("prezzi").insert({
      vino_id: vino.id,
      prezzo: esito.offerta.prezzo,
      annata_trovata: esito.offerta.annata,
      fonte: esito.offerta.fonte,
      url: esito.offerta.url,
      metodo: "json-ld",
      provider: "tavily",
    });
  } else if (esito.motivo === "nessuna_offerta") {
    await admin.from("prezzi").insert({ vino_id: vino.id, prezzo: null, metodo: "non_trovato", provider: "tavily" });
  }
  return esito;
}

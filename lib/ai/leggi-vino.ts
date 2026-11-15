import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leggiEtichetta, type Tentativo } from "@/lib/ai/etichetta";
import { daTradurre } from "@/lib/i18n/lingue";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { BUCKET_ETICHETTE } from "@/lib/vini";

// Legge l'etichetta di un vino dalle sue foto e salva la PROPOSTA in vini.estrazione.
// Non tocca i campi del vino: i dati diventano definitivi solo quando l'utente li controlla e salva.
// Usata dalla scheda del vino (con i permessi dell'utente) e dal lavoro notturno (con il client di servizio).

export type EsitoLetturaVino =
  | { ok: true; provider: string }
  | { ok: false; codice: "non_trovato" | "senza_foto" | "foto_non_leggibili" | "quota" | "fallita" | "salvataggio"; messaggio: string };

/** Conta l'uso dei provider gratuiti (tabella uso_api, scrivibile solo dal server). Mai bloccante. */
async function registraUso(tentativi: Tentativo[]) {
  try {
    const admin = creaClientAdmin();
    const giorno = new Date().toISOString().slice(0, 10);
    for (const t of tentativi) {
      const chiave = { giorno, provider: t.provider, compito: "etichetta" };
      const { data } = await admin.from("uso_api").select("ok, errori").match(chiave).maybeSingle();
      await admin.from("uso_api").upsert({
        ...chiave,
        ok: (data?.ok ?? 0) + (t.ok ? 1 : 0),
        errori: (data?.errori ?? 0) + (t.ok ? 0 : 1),
      });
    }
  } catch (e) {
    console.error("Conteggio uso API non riuscito:", e instanceof Error ? e.message : e);
  }
}

const CAMPI_LETTI = ["nome_fantasia", "denominazione", "produttore", "annata", "tipologia", "alcool", "capacita_cl", "vitigni"] as const;

/** La lettura porta qualcosa di nuovo? Cioè: riempie almeno un campo che nel vino è ancora vuoto. */
function portaNovita(vino: Record<string, unknown>, dati: unknown): boolean {
  const letti = (dati ?? {}) as Record<string, unknown>;
  return CAMPI_LETTI.some((campo) => {
    const mio = vino[campo];
    const suo = letti[campo];
    const vuotoMio = mio === null || mio === undefined || (Array.isArray(mio) && mio.length === 0);
    const vuotoSuo = suo === null || suo === undefined || suo === "" || (Array.isArray(suo) && suo.length === 0);
    return vuotoMio && !vuotoSuo;
  });
}

/**
 * soloNovita: lettura automatica fatta per ogni bottiglia con foto, anche se chi l'ha inserita ha già scritto i dati.
 * Se la lettura non aggiunge nulla a una scheda già confermata, la scheda resta confermata e nessuno deve ricontrollarla.
 * Una rilettura chiesta a mano (soloNovita assente) riporta sempre la scheda «da confermare».
 */
export async function leggiVino(
  supabase: SupabaseClient,
  vinoId: string,
  opzioni: { soloNovita?: boolean } = {},
): Promise<EsitoLetturaVino> {
  const { data: vino } = await supabase
    .from("vini")
    .select("id, stato, foto_fronte, foto_retro, nome_fantasia, denominazione, produttore, annata, tipologia, alcool, capacita_cl, vitigni")
    .eq("id", vinoId)
    .maybeSingle();
  if (!vino) return { ok: false, codice: "non_trovato", messaggio: daTradurre("Vino non trovato.") };
  if (!vino.foto_fronte && !vino.foto_retro) {
    return { ok: false, codice: "senza_foto", messaggio: daTradurre("Servono le foto dell'etichetta: scattale e salva, poi riprova.") };
  }

  const immagini: { etichetta: string; base64: string }[] = [];
  for (const [etichetta, percorso] of [
    ["FRONTALE", vino.foto_fronte],
    ["RETRO", vino.foto_retro],
  ] as const) {
    if (!percorso) continue;
    const { data: file, error } = await supabase.storage.from(BUCKET_ETICHETTE).download(percorso);
    if (error || !file) continue;
    immagini.push({ etichetta, base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }
  if (immagini.length === 0) {
    return { ok: false, codice: "foto_non_leggibili", messaggio: daTradurre("Non riesco ad aprire le foto di questo vino.") };
  }

  const esito = await leggiEtichetta(immagini);
  await registraUso(esito.tentativi);

  if (!esito.ok) {
    const quotaFinita = esito.tentativi.length > 0 && esito.tentativi.every((t) => t.stato === 429);
    const messaggio =
      esito.motivo === "nessun_provider"
        ? daTradurre("Nessun servizio di lettura configurato.")
        : quotaFinita
          ? daTradurre("Il servizio gratuito è momentaneamente saturo: la lettura ripartirà da sola stanotte, oppure riprova tra un minuto.")
          : daTradurre("La lettura automatica non è riuscita: riprova o compila a mano.");
    await supabase
      .from("vini")
      .update({ stato: quotaFinita ? "in_coda" : "da_analizzare", errore: messaggio })
      .eq("id", vinoId)
      .in("stato", ["da_analizzare", "in_coda", "errore"]);
    console.error("Lettura etichetta fallita:", JSON.stringify(esito.tentativi));
    return { ok: false, codice: quotaFinita ? "quota" : "fallita", messaggio };
  }

  // Anche un vino già confermato torna "da confermare": chi ha chiesto la rilettura deve controllarla.
  // Unica eccezione: la lettura automatica che non aggiunge nulla a una scheda già confermata.
  const stato = opzioni.soloNovita && vino.stato === "confermato" && !portaNovita(vino, esito.dati) ? "confermato" : "da_confermare";
  const { error } = await supabase
    .from("vini")
    .update({
      estrazione: {
        dati: esito.dati,
        provider: esito.provider,
        modello: esito.modello,
        quando: new Date().toISOString(),
      },
      errore: null,
      stato,
    })
    .eq("id", vinoId);
  if (error) return { ok: false, codice: "salvataggio", messaggio: error.message };
  return { ok: true, provider: esito.provider };
}

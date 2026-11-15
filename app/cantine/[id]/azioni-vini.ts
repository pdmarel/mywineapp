"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { creaClientServer } from "@/lib/supabase/server";
import { BUCKET_ETICHETTE, campiDaModulo, numeroCampo, testoCampo } from "@/lib/vini";

// Tutte le azioni passano dal client dell'utente: è la RLS del database a decidere se può scrivere.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sessione() {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Campi dell'etichetta più le foto, accettate solo se stanno nella cartella di questo vino. */
function campiVino(formData: FormData, cantinaId: string, vinoId: string) {
  const foto = (campo: string) => {
    const p = testoCampo(formData, campo);
    return p && p.startsWith(`${cantinaId}/${vinoId}/`) ? p : null;
  };
  return { ...campiDaModulo(formData), foto_fronte: foto("foto_fronte"), foto_retro: foto("foto_retro") };
}

// La creazione di una bottiglia nuova non è qui: avviene dal telefono (lib/sospesi.ts),
// così funziona anche senza rete e parte da sola quando il segnale torna.

/** Modifica i dati dell'etichetta di un vino esistente. */
export async function aggiornaVino(formData: FormData) {
  const { supabase } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(vinoId)) redirect("/");
  const scheda = `/cantine/${cantinaId}/vini/${vinoId}`;

  const campi = campiVino(formData, cantinaId, vinoId);
  const haTesto = campi.nome_fantasia || campi.denominazione || campi.produttore;
  const { error } = await supabase
    .from("vini")
    .update({
      ...campi,
      stato: haTesto ? "confermato" : "da_analizzare",
      aggiornato_il: new Date().toISOString(),
    })
    .eq("id", vinoId);
  if (error) {
    console.error("Modifica vino fallita:", error.message);
    redirect(`${scheda}?errore=salvataggio`);
  }
  revalidatePath(scheda);
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(`${scheda}?salvato=1`);
}

/** Carico o scarico di bottiglie in una posizione (delta positivo o negativo). */
export async function cambiaQuantita(formData: FormData) {
  const { supabase, user } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  const giacenzaId = String(formData.get("giacenza_id") ?? "");
  const delta = Math.round(Number(formData.get("delta") ?? 0));
  if (!UUID.test(cantinaId) || !UUID.test(vinoId) || !UUID.test(giacenzaId) || !delta) redirect("/");
  const scheda = `/cantine/${cantinaId}/vini/${vinoId}`;

  const { data: giacenza } = await supabase
    .from("giacenze")
    .select("id, quantita")
    .eq("id", giacenzaId)
    .eq("vino_id", vinoId)
    .maybeSingle();
  if (!giacenza) redirect(`${scheda}?errore=salvataggio`);

  const nuova = Math.max(0, giacenza.quantita + delta);
  const effettivo = nuova - giacenza.quantita;
  if (effettivo !== 0) {
    const { error } = await supabase
      .from("giacenze")
      .update({ quantita: nuova, aggiornato_il: new Date().toISOString() })
      .eq("id", giacenzaId);
    if (error) {
      console.error("Cambio quantità fallito:", error.message);
      redirect(`${scheda}?errore=salvataggio`);
    }
    await supabase.from("movimenti").insert({
      giacenza_id: giacenzaId,
      delta: effettivo,
      motivo: effettivo > 0 ? "carico" : "consumo",
      user_id: user.id,
    });
  }
  revalidatePath(scheda);
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(scheda);
}

/** Mette bottiglie dello stesso vino in un'altra posizione (o ne aggiunge a una già usata). */
export async function aggiungiGiacenza(formData: FormData) {
  const { supabase, user } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  const posizioneId = String(formData.get("posizione_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(vinoId)) redirect("/");
  const scheda = `/cantine/${cantinaId}/vini/${vinoId}`;
  if (!UUID.test(posizioneId)) redirect(`${scheda}?errore=posizione`);

  const quantita = Math.max(1, Math.round(numeroCampo(formData, "quantita") ?? 1));

  const { data: esistente } = await supabase
    .from("giacenze")
    .select("id, quantita")
    .eq("vino_id", vinoId)
    .eq("posizione_id", posizioneId)
    .maybeSingle();

  let giacenzaId = esistente?.id as string | undefined;
  if (esistente) {
    const { error } = await supabase
      .from("giacenze")
      .update({ quantita: esistente.quantita + quantita, aggiornato_il: new Date().toISOString() })
      .eq("id", esistente.id);
    if (error) redirect(`${scheda}?errore=salvataggio`);
  } else {
    const { data, error } = await supabase
      .from("giacenze")
      .insert({ vino_id: vinoId, posizione_id: posizioneId, quantita })
      .select("id")
      .single();
    if (error || !data) redirect(`${scheda}?errore=salvataggio`);
    giacenzaId = data.id;
  }
  await supabase
    .from("movimenti")
    .insert({ giacenza_id: giacenzaId, delta: quantita, motivo: "carico", user_id: user.id });

  revalidatePath(scheda);
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(scheda);
}

/** Prezzo scritto a mano (quando la ricerca online non lo trova o si conosce il valore reale). */
export async function salvaPrezzoManuale(formData: FormData) {
  const { supabase } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(vinoId)) redirect("/");
  const scheda = `/cantine/${cantinaId}/vini/${vinoId}`;

  const prezzo = numeroCampo(formData, "prezzo");
  if (!prezzo || prezzo <= 0 || prezzo >= 100000) redirect(`${scheda}?errore=prezzo`);

  // La tabella dei prezzi è scrivibile solo dal server: prima si verifica, con i permessi dell'utente,
  // che il vino sia davvero di una sua cantina.
  const { data: vino } = await supabase
    .from("vini")
    .select("id")
    .eq("id", vinoId)
    .eq("cantina_id", cantinaId)
    .maybeSingle();
  if (!vino) redirect("/");

  const { error } = await creaClientAdmin()
    .from("prezzi")
    .insert({ vino_id: vinoId, prezzo: Math.round(prezzo * 100) / 100, fonte: "inserito a mano", metodo: "manuale" });
  if (error) {
    console.error("Prezzo manuale non salvato:", error.message);
    redirect(`${scheda}?errore=salvataggio`);
  }
  revalidatePath(scheda);
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(scheda);
}

/** Sposta bottiglie da una posizione a un'altra in un solo gesto (stesso vino). */
export async function spostaBottiglie(formData: FormData) {
  const { supabase, user } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  const giacenzaId = String(formData.get("giacenza_id") ?? "");
  const destinazioneId = String(formData.get("posizione_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(vinoId) || !UUID.test(giacenzaId)) redirect("/");
  const scheda = `/cantine/${cantinaId}/vini/${vinoId}`;
  if (!UUID.test(destinazioneId)) redirect(`${scheda}?errore=posizione`);

  const { data: origine } = await supabase
    .from("giacenze")
    .select("id, quantita, posizione_id")
    .eq("id", giacenzaId)
    .eq("vino_id", vinoId)
    .maybeSingle();
  if (!origine) redirect(`${scheda}?errore=salvataggio`);
  if (origine.posizione_id === destinazioneId) redirect(`${scheda}?errore=stessa_posizione`);

  // Senza numero si spostano tutte; mai più di quelle che ci sono.
  const richieste = Math.round(numeroCampo(formData, "quantita") ?? origine.quantita);
  const quante = Math.min(Math.max(richieste, 0), origine.quantita);
  if (quante === 0) redirect(`${scheda}?errore=niente_da_spostare`);

  const adesso = new Date().toISOString();
  const { data: arrivo } = await supabase
    .from("giacenze")
    .select("id, quantita")
    .eq("vino_id", vinoId)
    .eq("posizione_id", destinazioneId)
    .maybeSingle();

  // Prima si aggiunge a destinazione, poi si toglie dall'origine: se qualcosa va storto
  // a metà restano bottiglie in più da correggere, mai bottiglie sparite.
  let arrivoId = arrivo?.id as string | undefined;
  if (arrivo) {
    const { error } = await supabase
      .from("giacenze")
      .update({ quantita: arrivo.quantita + quante, aggiornato_il: adesso })
      .eq("id", arrivo.id);
    if (error) redirect(`${scheda}?errore=salvataggio`);
  } else {
    const { data, error } = await supabase
      .from("giacenze")
      .insert({ vino_id: vinoId, posizione_id: destinazioneId, quantita: quante })
      .select("id")
      .single();
    if (error || !data) redirect(`${scheda}?errore=salvataggio`);
    arrivoId = data.id;
  }

  const resto = origine.quantita - quante;
  if (resto === 0) {
    // Posizione svuotata dallo spostamento: la riga non serve più (lo storico resta nella destinazione).
    const { error } = await supabase.from("giacenze").delete().eq("id", origine.id);
    if (error) redirect(`${scheda}?errore=salvataggio`);
  } else {
    const { error } = await supabase
      .from("giacenze")
      .update({ quantita: resto, aggiornato_il: adesso })
      .eq("id", origine.id);
    if (error) redirect(`${scheda}?errore=salvataggio`);
    await supabase
      .from("movimenti")
      .insert({ giacenza_id: origine.id, delta: -quante, motivo: "spostamento", user_id: user.id });
  }
  await supabase
    .from("movimenti")
    .insert({ giacenza_id: arrivoId, delta: quante, motivo: "spostamento", user_id: user.id });

  revalidatePath(scheda);
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(scheda);
}

/** Cancella un vino con le sue foto, quantità e prezzi. Non si può annullare. */
export async function eliminaVino(formData: FormData) {
  const { supabase } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(vinoId)) redirect("/");
  const scheda = `/cantine/${cantinaId}/vini/${vinoId}`;

  // Si verifica che il vino sia davvero di questa cantina prima di toccare le foto.
  const { data: vino } = await supabase.from("vini").select("id").eq("id", vinoId).eq("cantina_id", cantinaId).maybeSingle();
  if (!vino) redirect(`/cantine/${cantinaId}`);

  const archivio = supabase.storage.from(BUCKET_ETICHETTE);
  const { data: file } = await archivio.list(`${cantinaId}/${vinoId}`);
  if (file && file.length > 0) {
    await archivio.remove(file.map((f) => `${cantinaId}/${vinoId}/${f.name}`));
  }

  const { error } = await supabase.from("vini").delete().eq("id", vinoId);
  if (error) {
    console.error("Cancellazione vino fallita:", error.message);
    redirect(`${scheda}?errore=salvataggio`);
  }
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(`/cantine/${cantinaId}?fatto=vino_cancellato`);
}

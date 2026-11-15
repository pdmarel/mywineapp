"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { creaClientServer } from "@/lib/supabase/server";
import { BUCKET_ETICHETTE } from "@/lib/vini";

// Azioni sulla cantina intera: nome, persone, cancellazione. Tutte riservate al proprietario.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verifica, con i permessi dell'utente, che sia proprietario di questa cantina. */
async function proprietario(cantinaId: string) {
  if (!UUID.test(cantinaId)) redirect("/");
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("cantina_membri")
    .select("ruolo")
    .eq("cantina_id", cantinaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.ruolo !== "proprietario") redirect(`/cantine/${cantinaId}/impostazioni?errore=permesso`);
  return { supabase, user };
}

export async function rinominaCantina(formData: FormData) {
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const { supabase } = await proprietario(cantinaId);
  const pagina = `/cantine/${cantinaId}/impostazioni`;
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome || nome.length > 60) redirect(`${pagina}?errore=nome`);

  const { error } = await supabase.from("cantine").update({ nome }).eq("id", cantinaId);
  if (error) redirect(`${pagina}?errore=salvataggio`);
  revalidatePath("/");
  revalidatePath(`/cantine/${cantinaId}`);
  redirect(`${pagina}?fatto=nome`);
}

export async function invitaPersona(formData: FormData) {
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const { user } = await proprietario(cantinaId);
  const pagina = `/cantine/${cantinaId}/impostazioni`;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`${pagina}?errore=email`);
  if (email === (user.email ?? "").toLowerCase()) redirect(`${pagina}?errore=te_stesso`);

  const admin = creaClientAdmin();
  const { error } = await admin
    .from("inviti")
    .upsert({ cantina_id: cantinaId, email, invitato_da: user.id }, { onConflict: "cantina_id,email", ignoreDuplicates: true });
  if (error) {
    console.error("Invito non salvato:", error.message);
    redirect(`${pagina}?errore=${error.code === "42P01" || /inviti/.test(error.message) ? "tabella" : "salvataggio"}`);
  }
  revalidatePath(pagina);
  redirect(`${pagina}?fatto=invito`);
}

export async function togliPersona(formData: FormData) {
  const cantinaId = String(formData.get("cantina_id") ?? "");
  await proprietario(cantinaId);
  const pagina = `/cantine/${cantinaId}/impostazioni`;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(pagina);

  const admin = creaClientAdmin();
  const { error } = await admin.from("inviti").delete().eq("cantina_id", cantinaId).eq("email", email);
  if (error) redirect(`${pagina}?errore=salvataggio`);

  // Se era già entrata, perde anche l'accesso alla cantina (mai il proprietario).
  const { data: utenti } = await admin.auth.admin.listUsers({ perPage: 200 });
  const utente = (utenti?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  if (utente) {
    await admin
      .from("cantina_membri")
      .delete()
      .eq("cantina_id", cantinaId)
      .eq("user_id", utente.id)
      .neq("ruolo", "proprietario");
  }
  revalidatePath(pagina);
  redirect(`${pagina}?fatto=tolta`);
}

/**
 * Cancella la cantina con tutto ciò che contiene: luoghi, posizioni, vini, giacenze, prezzi, foto.
 * Non si può annullare: per questo chiede di riscrivere il nome della cantina.
 */
export async function eliminaCantina(formData: FormData) {
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const { supabase } = await proprietario(cantinaId);
  const pagina = `/cantine/${cantinaId}/impostazioni`;

  const { data: cantina } = await supabase.from("cantine").select("nome").eq("id", cantinaId).maybeSingle();
  if (!cantina) redirect("/");
  const conferma = String(formData.get("conferma") ?? "").trim();
  if (conferma !== cantina.nome) redirect(`${pagina}?errore=conferma`);

  // Prima le foto (dopo la cancellazione non si saprebbe più quali sono), poi le righe.
  const archivio = creaClientAdmin().storage.from(BUCKET_ETICHETTE);
  const { data: cartelle } = await archivio.list(cantinaId, { limit: 10000 });
  for (const cartella of cartelle ?? []) {
    const { data: file } = await archivio.list(`${cantinaId}/${cartella.name}`);
    if (file && file.length > 0) {
      await archivio.remove(file.map((f) => `${cantinaId}/${cartella.name}/${f.name}`));
    }
  }

  // I vocali delle degustazioni stanno in un altro archivio, tutti nella cartella della cantina.
  const vocali = creaClientAdmin().storage.from("vocali");
  const { data: registrazioni } = await vocali.list(cantinaId, { limit: 10000 });
  if (registrazioni && registrazioni.length > 0) {
    await vocali.remove(registrazioni.map((f) => `${cantinaId}/${f.name}`));
  }

  // Le giacenze puntano alle posizioni senza cancellazione a cascata: vanno via prima i vini.
  const { error: erroreVini } = await supabase.from("vini").delete().eq("cantina_id", cantinaId);
  if (erroreVini) {
    console.error("Cancellazione vini fallita:", erroreVini.message);
    redirect(`${pagina}?errore=salvataggio`);
  }
  const { error } = await supabase.from("cantine").delete().eq("id", cantinaId);
  if (error) {
    console.error("Cancellazione cantina fallita:", error.message);
    redirect(`${pagina}?errore=salvataggio`);
  }
  revalidatePath("/");
  redirect("/?fatto=cantina_cancellata");
}

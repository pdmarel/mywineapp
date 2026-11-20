"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { creaClientServer } from "@/lib/supabase/server";
import { emailAutorizzata } from "@/lib/supabase/config";
import { codiceParte, sostituisciParte } from "@/lib/locale";

async function utenteCorrente() {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * Crea una cantina e ne rende proprietario chi la crea.
 * Passa dalla chiave di servizio perché la RLS non lascia inserire una cantina
 * a chi non ne è ancora membro; per questo ricontrolla qui che l'email sia abilitata.
 */
export async function creaCantina(formData: FormData) {
  const { user } = await utenteCorrente();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) redirect("/?errore=nome");
  if (!user.email || !emailAutorizzata(user.email)) redirect("/?errore=non_abilitata");

  const admin = creaClientAdmin();
  const { data: cantina, error } = await admin.from("cantine").insert({ nome }).select("id").single();
  if (error || !cantina) {
    console.error("Creazione cantina fallita:", error?.message);
    redirect("/?errore=salvataggio");
  }
  const { error: erroreMembro } = await admin
    .from("cantina_membri")
    .insert({ cantina_id: cantina.id, user_id: user.id, ruolo: "proprietario" });
  if (erroreMembro) {
    console.error("Iscrizione alla cantina fallita:", erroreMembro.message);
    await admin.from("cantine").delete().eq("id", cantina.id);
    redirect("/?errore=salvataggio");
  }
  redirect(`/cantine/${cantina.id}/luoghi`);
}

/** Aggiunge un luogo fisico alla cantina (es. "EM-home"). */
export async function creaLuogo(formData: FormData) {
  const { supabase } = await utenteCorrente();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!cantinaId) redirect("/");
  if (!nome) redirect(`/cantine/${cantinaId}/luoghi?errore=nome`);

  const { error } = await supabase.from("luoghi").insert({ cantina_id: cantinaId, nome });
  if (error) {
    console.error("Creazione luogo fallita:", error.message);
    redirect(`/cantine/${cantinaId}/luoghi?errore=${error.code === "23505" ? "doppione" : "salvataggio"}`);
  }
  revalidatePath(`/cantine/${cantinaId}/luoghi`);
  redirect(`/cantine/${cantinaId}/luoghi`);
}

/**
 * Aggiunge una o più posizioni a un luogo.
 * Si possono scrivere più codici insieme, separati da virgola o spazio: "A1, A2, A3".
 */
export async function creaPosizioni(formData: FormData) {
  const { supabase } = await utenteCorrente();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const luogoId = String(formData.get("luogo_id") ?? "");
  const codici = Array.from(
    new Set(
      String(formData.get("codici") ?? "")
        .split(/[\s,;]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  if (!cantinaId || !luogoId) redirect("/");
  if (codici.length === 0) redirect(`/cantine/${cantinaId}/luoghi?errore=nome`);

  const { error } = await supabase
    .from("posizioni")
    .upsert(
      codici.map((codice) => ({ luogo_id: luogoId, codice })),
      { onConflict: "luogo_id,codice", ignoreDuplicates: true },
    );
  if (error) {
    console.error("Creazione posizioni fallita:", error.message);
    redirect(`/cantine/${cantinaId}/luoghi?errore=salvataggio`);
  }
  revalidatePath(`/cantine/${cantinaId}/luoghi`);
  redirect(`/cantine/${cantinaId}/luoghi`);
}

/** Il disegno 3D di un luogo richiama le posizioni per nome: quando una cambia nome (o sparisce) il disegno la segue. */
async function aggiornaDisegno(supabase: Awaited<ReturnType<typeof utenteCorrente>>["supabase"], luogoId: string, da: string, a: string) {
  const { data } = await supabase.from("luoghi").select("locale").eq("id", luogoId).maybeSingle();
  const locale = (data as { locale?: unknown } | null)?.locale;
  if (!locale) return;
  const { error } = await supabase.from("luoghi").update({ locale: sostituisciParte(locale, da, a) }).eq("id", luogoId);
  if (error) console.error("Disegno non aggiornato dopo il cambio di una posizione:", error.message);
}

/** Cambia il nome di una posizione: le bottiglie restano dove sono e il disegno 3D la segue. */
export async function rinominaPosizione(formData: FormData) {
  const { supabase } = await utenteCorrente();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const luogoId = String(formData.get("luogo_id") ?? "");
  const posizioneId = String(formData.get("posizione_id") ?? "");
  const pagina = `/cantine/${cantinaId}/luoghi`;
  const nuovo = codiceParte(formData.get("codice"));
  if (!cantinaId || !luogoId || !posizioneId) redirect("/");
  if (!nuovo) redirect(`${pagina}?errore=nome`);

  const { data: attuale } = await supabase.from("posizioni").select("id, codice").eq("id", posizioneId).eq("luogo_id", luogoId).maybeSingle();
  if (!attuale) redirect(pagina);
  if (attuale.codice === nuovo) redirect(pagina);

  const { error } = await supabase.from("posizioni").update({ codice: nuovo }).eq("id", posizioneId);
  if (error) {
    console.error("Posizione non rinominata:", error.message);
    redirect(`${pagina}?errore=${error.code === "23505" ? "doppione_posizione" : "salvataggio"}`);
  }
  await aggiornaDisegno(supabase, luogoId, attuale.codice, nuovo);
  revalidatePath(pagina);
  revalidatePath(`${pagina}/${luogoId}`);
  redirect(`${pagina}?fatto=rinominata`);
}

/**
 * Toglie una posizione, ma solo se è vuota. Le righe con quantità 0 (l'archivio di bottiglie già finite o spostate)
 * se ne vanno con lei. Nel disegno 3D la parte resta, senza nome.
 */
export async function togliPosizione(formData: FormData) {
  const { supabase } = await utenteCorrente();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const luogoId = String(formData.get("luogo_id") ?? "");
  const posizioneId = String(formData.get("posizione_id") ?? "");
  const pagina = `/cantine/${cantinaId}/luoghi`;
  if (!cantinaId || !luogoId || !posizioneId) redirect("/");

  const { data: attuale } = await supabase.from("posizioni").select("id, codice").eq("id", posizioneId).eq("luogo_id", luogoId).maybeSingle();
  if (!attuale) redirect(pagina);

  const { count } = await supabase.from("giacenze").select("id", { count: "exact", head: true }).eq("posizione_id", posizioneId).gt("quantita", 0);
  if ((count ?? 0) > 0) redirect(`${pagina}?errore=bottiglie`);

  const { error: erroreArchivio } = await supabase.from("giacenze").delete().eq("posizione_id", posizioneId);
  const { error } = erroreArchivio ? { error: erroreArchivio } : await supabase.from("posizioni").delete().eq("id", posizioneId);
  if (error) {
    console.error("Posizione non tolta:", error.message);
    redirect(`${pagina}?errore=salvataggio`);
  }
  await aggiornaDisegno(supabase, luogoId, attuale.codice, "");
  revalidatePath(pagina);
  revalidatePath(`${pagina}/${luogoId}`);
  redirect(`${pagina}?fatto=tolta`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { creaClientServer } from "@/lib/supabase/server";
import { emailAutorizzata } from "@/lib/supabase/config";

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

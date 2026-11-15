"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { partiDi, validaLocale } from "@/lib/locale";
import { creaClientServer } from "@/lib/supabase/server";

// Salva il disegno di un luogo (locale e scaffali). Passa dal client dell'utente: è la RLS a decidere
// se può scrivere nella cantina. Le parti con un nome nuovo diventano posizioni del luogo, così ci si
// possono mettere le bottiglie; le posizioni esistenti non vengono mai toccate né cancellate.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function salvaLocale(formData: FormData) {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cantinaId = String(formData.get("cantina_id") ?? "");
  const luogoId = String(formData.get("luogo_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(luogoId)) redirect("/");
  const pagina = `/cantine/${cantinaId}/luoghi/${luogoId}`;

  let locale;
  try {
    locale = validaLocale(JSON.parse(String(formData.get("locale") ?? "null")));
  } catch {
    locale = null;
  }
  if (!locale) redirect(`${pagina}?errore=dati`);

  const { data: luogo } = await supabase.from("luoghi").select("id").eq("id", luogoId).eq("cantina_id", cantinaId).maybeSingle();
  if (!luogo) redirect(`/cantine/${cantinaId}/luoghi`);

  const { error } = await supabase.from("luoghi").update({ locale }).eq("id", luogoId);
  if (error) {
    console.error("Disegno del locale non salvato:", error.code, error.message);
    // Campo mancante: la migrazione 0003 non è ancora stata eseguita.
    redirect(`${pagina}?errore=${error.code === "PGRST204" || error.code === "42703" ? "migrazione" : "salvataggio"}`);
  }

  const codici = Array.from(new Set(partiDi(locale)));
  if (codici.length > 0) {
    const { error: errorePosizioni } = await supabase
      .from("posizioni")
      .upsert(
        codici.map((codice) => ({ luogo_id: luogoId, codice })),
        { onConflict: "luogo_id,codice", ignoreDuplicates: true },
      );
    if (errorePosizioni) {
      console.error("Posizioni del disegno non create:", errorePosizioni.message);
      redirect(`${pagina}?errore=posizioni`);
    }
  }

  revalidatePath(pagina);
  revalidatePath(`/cantine/${cantinaId}/luoghi`);
  redirect(`${pagina}?salvato=1`);
}

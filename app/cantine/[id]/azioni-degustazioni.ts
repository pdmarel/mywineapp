"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validaDinamica } from "@/lib/degustazione";
import { validaSpazio } from "@/lib/spazio";
import { creaClientServer } from "@/lib/supabase/server";
import { BUCKET_ETICHETTE, percorsoMini } from "@/lib/vini";

// Degustazioni: passano dal client dell'utente, è la RLS a decidere se può scrivere nella cantina.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sessione() {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function salvaDegustazione(formData: FormData) {
  const { supabase, user } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const vinoId = String(formData.get("vino_id") ?? "");
  if (!UUID.test(cantinaId) || (vinoId && !UUID.test(vinoId))) redirect("/");
  const nuova = vinoId ? `/cantine/${cantinaId}/vini/${vinoId}/degustazione` : "/degustazioni/nuova";

  // Vino assaggiato fuori cantina (una manifestazione, un ristorante): nome, produttore e annata sono
  // facoltativi, possono bastare le foto dell'etichetta.
  const nomeLibero = String(formData.get("vino_libero") ?? "").trim().slice(0, 120);
  // Il percorso della foto arriva dal browser: vale solo se sta in una cartella di questa cantina.
  const foto = (lato: "fronte" | "retro") => {
    const percorso = String(formData.get(`foto_${lato}`) ?? "").trim();
    const [cantina, cartella, file] = percorso.split("/");
    return cantina === cantinaId && UUID.test(cartella ?? "") && file === `${lato}.jpg` ? percorso : null;
  };
  const annataLibera = Number(String(formData.get("annata_libera") ?? "").trim());
  const libero = vinoId
    ? null
    : {
        nome: nomeLibero || null,
        foto_fronte: foto("fronte"),
        foto_retro: foto("retro"),
        produttore: String(formData.get("produttore_libero") ?? "").trim().slice(0, 120) || null,
        annata: annataLibera >= 1800 && annataLibera <= new Date().getFullYear() + 1 ? annataLibera : null,
        evento: String(formData.get("evento") ?? "").trim().slice(0, 120) || null,
      };

  let dinamica;
  try {
    dinamica = validaDinamica(JSON.parse(String(formData.get("dinamica") ?? "{}")));
  } catch {
    redirect(`${nuova}?errore=dati`);
  }
  const note = String(formData.get("note") ?? "").trim() || null;
  const descrittori = String(formData.get("descrittori") ?? "")
    .split(/[,;\n]+/)
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 40);
  let spazio;
  try {
    spazio = validaSpazio(JSON.parse(String(formData.get("spazio") ?? "{}")));
  } catch {
    redirect(`${nuova}?errore=dati`);
  }
  const vuota = dinamica.curve.length === 0 && spazio.olfatto.length === 0 && spazio.bocca.length === 0;
  // Una degustazione fuori cantina con la sola foto dell'etichetta è già un appunto che vale la pena tenere.
  const conFoto = Boolean(libero?.foto_fronte || libero?.foto_retro);
  if (vuota && !note && descrittori.length === 0 && !conFoto) redirect(`${nuova}?errore=vuota`);

  const punteggio = Number(String(formData.get("punteggio") ?? "").replace(",", "."));
  const data = String(formData.get("degustato_il") ?? "");
  const audio = String(formData.get("audio") ?? "").trim();
  const trascrizione = String(formData.get("trascrizione") ?? "").trim();

  const { data: riga, error } = await supabase
    .from("degustazioni")
    .insert({
      cantina_id: cantinaId,
      vino_id: vinoId || null,
      vino_libero: libero ? [libero.nome, libero.annata, libero.produttore].filter(Boolean).join(" · ") || null : null,
      user_id: user.id,
      degustato_il: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : new Date().toISOString().slice(0, 10),
      dinamica,
      scheda: { descrittori, spazio, ...(libero ? { libero } : {}) },
      note,
      punteggio: Number.isFinite(punteggio) && punteggio > 0 && punteggio <= 100 ? punteggio : null,
      // Il vocale vale solo se sta nella cartella di questa cantina: il percorso arriva dal browser.
      audio: audio.startsWith(`${cantinaId}/`) ? audio : null,
      trascrizione: trascrizione || null,
      stato: "confermata",
    })
    .select("id")
    .single();
  if (error || !riga) {
    console.error("Degustazione non salvata:", error?.message);
    redirect(`${nuova}?errore=salvataggio`);
  }
  if (vinoId) revalidatePath(`/cantine/${cantinaId}/vini/${vinoId}`);
  revalidatePath("/degustazioni");
  redirect(`/cantine/${cantinaId}/degustazioni/${riga.id}?salvata=1`);
}

export async function eliminaDegustazione(formData: FormData) {
  const { supabase } = await sessione();
  const cantinaId = String(formData.get("cantina_id") ?? "");
  const degustazioneId = String(formData.get("degustazione_id") ?? "");
  if (!UUID.test(cantinaId) || !UUID.test(degustazioneId)) redirect("/");

  const { data: riga } = await supabase
    .from("degustazioni")
    .select("vino_id, audio, scheda")
    .eq("id", degustazioneId)
    .eq("cantina_id", cantinaId)
    .maybeSingle();
  if (!riga) redirect(`/cantine/${cantinaId}`);
  if (riga.audio) await supabase.storage.from("vocali").remove([riga.audio]);
  // Le foto dell'etichetta di un vino fuori cantina appartengono solo a questa degustazione.
  const libero = (riga.scheda as { libero?: { foto_fronte?: string | null; foto_retro?: string | null } } | null)?.libero;
  const fotoDaTogliere = [libero?.foto_fronte, libero?.foto_retro]
    .filter((p): p is string => typeof p === "string" && p.startsWith(`${cantinaId}/`))
    .flatMap((p) => [p, percorsoMini(p)]);
  if (fotoDaTogliere.length > 0) await supabase.storage.from(BUCKET_ETICHETTE).remove(fotoDaTogliere);

  const { error } = await supabase.from("degustazioni").delete().eq("id", degustazioneId);
  if (error) redirect(`/cantine/${cantinaId}/degustazioni/${degustazioneId}?errore=salvataggio`);
  const scheda = riga.vino_id ? `/cantine/${cantinaId}/vini/${riga.vino_id}` : "/degustazioni";
  revalidatePath(scheda);
  revalidatePath("/degustazioni");
  redirect(scheda);
}

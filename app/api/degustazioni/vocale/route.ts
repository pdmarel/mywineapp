import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { daVocale } from "@/lib/ai/vocale";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import { titoloVino } from "@/lib/vini";

// Riceve il vocale di una degustazione, lo conserva e restituisce la proposta di compilazione.
// Non salva nessuna degustazione: il modulo si riempie e il degustatore conferma.
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTENSIONI: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
const STATO_HTTP = { configurazione: 500, trascrizione: 502, vuoto: 422, quota: 429, estrazione: 502 } as const;

export async function POST(richiesta: Request) {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: "accesso" }, { status: 401 });
  const { t, lingua } = await traduzione();

  const dati = await richiesta.formData().catch(() => null);
  const audio = dati?.get("audio");
  const cantinaId = String(dati?.get("cantina_id") ?? "");
  const vinoId = String(dati?.get("vino_id") ?? "");
  if (!(audio instanceof Blob) || audio.size < 2000 || !UUID.test(cantinaId) || (vinoId && !UUID.test(vinoId))) {
    return NextResponse.json({ errore: "richiesta", messaggio: t("Il vocale non è arrivato. Riprova.") }, { status: 400 });
  }
  if (audio.size > 4_000_000) {
    return NextResponse.json({ errore: "troppo_lungo", messaggio: t("Il vocale è troppo lungo: resta sotto i due minuti.") }, { status: 413 });
  }

  // La RLS restituisce cantina e vino solo se l'utente ne è membro.
  const { data: cantina } = await supabase.from("cantine").select("id").eq("id", cantinaId).maybeSingle();
  if (!cantina) return NextResponse.json({ errore: "non_trovato" }, { status: 404 });
  let descrizione = String(dati?.get("vino") ?? "").trim().slice(0, 200) || "vino assaggiato fuori cantina";
  if (vinoId) {
    const { data: vino } = await supabase
      .from("vini")
      .select("nome_fantasia, denominazione, produttore, annata")
      .eq("id", vinoId)
      .eq("cantina_id", cantinaId)
      .maybeSingle();
    if (!vino) return NextResponse.json({ errore: "non_trovato" }, { status: 404 });
    descrizione = [titoloVino(vino, t), vino.denominazione, vino.annata, vino.produttore].filter(Boolean).join(", ");
  }

  const tipo = (audio.type || "audio/webm").split(";")[0];
  const estensione = ESTENSIONI[tipo] ?? "webm";
  const percorso = `${cantinaId}/${randomUUID()}.${estensione}`;
  const caricamento = await supabase.storage.from("vocali").upload(percorso, audio, { contentType: tipo });
  if (caricamento.error) console.error("Vocale non conservato:", caricamento.error.message);

  const esito = await daVocale(audio, `vocale.${estensione}`, descrizione, lingua);
  const audioSalvato = caricamento.error ? null : percorso;

  if (!esito.ok) {
    return NextResponse.json(
      { errore: esito.codice, messaggio: t(esito.messaggio), trascrizione: esito.trascrizione ?? null, audio: audioSalvato },
      { status: STATO_HTTP[esito.codice] },
    );
  }
  return NextResponse.json({ ...esito, audio: audioSalvato });
}

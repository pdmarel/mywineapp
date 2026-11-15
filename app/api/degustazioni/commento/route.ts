import { NextResponse } from "next/server";
import { trascrivi } from "@/lib/ai/vocale";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";

// Trascrive un breve commento dettato a voce (la "nota" attaccata a un punto dello spazio 3D).
// Restituisce solo il testo: l'audio del commento non viene conservato.
export const maxDuration = 60;

export async function POST(richiesta: Request) {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: "accesso" }, { status: 401 });
  const { t, lingua } = await traduzione();
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ errore: "configurazione", messaggio: t("Il servizio per il vocale non è configurato.") }, { status: 500 });
  }

  const dati = await richiesta.formData().catch(() => null);
  const audio = dati?.get("audio");
  const contesto = String(dati?.get("contesto") ?? "").slice(0, 200);
  if (!(audio instanceof Blob) || audio.size < 1500) {
    return NextResponse.json({ errore: "richiesta", messaggio: t("Il commento non è arrivato. Riprova.") }, { status: 400 });
  }
  if (audio.size > 2_000_000) {
    return NextResponse.json({ errore: "troppo_lungo", messaggio: t("Commento troppo lungo: bastano poche parole.") }, { status: 413 });
  }

  const tipo = (audio.type || "audio/webm").split(";")[0];
  const estensione = tipo.includes("mp4") ? "m4a" : tipo.includes("wav") ? "wav" : tipo.includes("ogg") ? "ogg" : "webm";
  const esito = await trascrivi(audio, `commento.${estensione}`, contesto || "degustazione di un vino", lingua);
  if (!esito.ok) {
    console.error("Trascrizione commento fallita:", esito.stato, esito.dettaglio);
    return NextResponse.json(
      {
        errore: "trascrizione",
        messaggio: esito.stato === 429 ? t("Il servizio gratuito è saturo: riprova tra un minuto.") : t("Non sono riuscito a trascrivere. Riprova o scrivi a mano."),
      },
      { status: esito.stato === 429 ? 429 : 502 },
    );
  }
  return NextResponse.json({ ok: true, testo: esito.testo });
}

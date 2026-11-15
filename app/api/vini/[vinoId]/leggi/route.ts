import { NextResponse } from "next/server";
import { leggiVino } from "@/lib/ai/leggi-vino";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";

// Lettura dell'etichetta chiesta dall'app. Passa dal client dell'utente:
// è la RLS a garantire che il vino (e le sue foto) siano di una sua cantina.
export const maxDuration = 120;

const STATO_HTTP = {
  non_trovato: 404,
  senza_foto: 400,
  foto_non_leggibili: 400,
  quota: 429,
  fallita: 502,
  salvataggio: 500,
} as const;

export async function POST(richiesta: Request, { params }: { params: Promise<{ vinoId: string }> }) {
  const { vinoId } = await params;
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: "accesso" }, { status: 401 });

  // ?auto=1: lettura partita da sola dopo l'inserimento di una bottiglia (vedi lib/sospesi.ts).
  const automatica = new URL(richiesta.url).searchParams.get("auto") === "1";
  const esito = await leggiVino(supabase, vinoId, { soloNovita: automatica });
  if (!esito.ok) {
    const { t } = await traduzione();
    return NextResponse.json({ errore: esito.codice, messaggio: t(esito.messaggio) }, { status: STATO_HTTP[esito.codice] });
  }
  return NextResponse.json({ ok: true, provider: esito.provider });
}

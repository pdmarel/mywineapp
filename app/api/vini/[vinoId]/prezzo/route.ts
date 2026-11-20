import { NextResponse } from "next/server";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { aggiornaPrezzo } from "@/lib/prezzi/aggiorna";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { creaClientServer } from "@/lib/supabase/server";

// Cerca il prezzo corrente di un vino e lo aggiunge allo storico. Se non è in vendita online salva un prezzo
// di riferimento stimato, con la sua affidabilità.
export const maxDuration = 60;

const MESSAGGI = {
  dati_insufficienti: daTradurre("Per cercare il prezzo servono almeno il produttore e il nome (o la denominazione) del vino."),
  ricerca_fallita: daTradurre("La ricerca non è riuscita. Riprova più tardi."),
  nessuna_offerta: daTradurre("Non ho trovato questo vino in vendita sulle enoteche online. Puoi scrivere il prezzo a mano."),
} as const;

export async function POST(_richiesta: Request, { params }: { params: Promise<{ vinoId: string }> }) {
  const { vinoId } = await params;
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: "accesso" }, { status: 401 });
  const { t } = await traduzione();

  // Letto con il client dell'utente: la RLS garantisce che il vino sia di una sua cantina.
  const { data: vino } = await supabase
    .from("vini")
    .select("id, nome_fantasia, denominazione, produttore, annata, capacita_cl")
    .eq("id", vinoId)
    .maybeSingle();
  if (!vino) return NextResponse.json({ errore: "non_trovato" }, { status: 404 });

  // Una ricerca costa un credito: non più di una ogni 12 ore per vino.
  const { data: ultima } = await supabase
    .from("prezzi")
    .select("rilevato_il, metodo")
    .eq("vino_id", vinoId)
    .neq("metodo", "manuale")
    .order("rilevato_il", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima && Date.now() - new Date(ultima.rilevato_il).getTime() < 12 * 3600 * 1000) {
    return NextResponse.json(
      { errore: "troppo_presto", messaggio: t("Il prezzo di questo vino è già stato cercato oggi. Riprova domani.") },
      { status: 429 },
    );
  }

  const esito = await aggiornaPrezzo(creaClientAdmin(), vino);
  if (!esito.trovato && esito.stima) {
    // Non in vendita online (o dati incompleti): c'è comunque un prezzo di riferimento stimato.
    return NextResponse.json({ ok: true, stima: esito.stima });
  }
  if (!esito.trovato) {
    if (esito.dettaglio) console.error("Ricerca prezzo:", esito.dettaglio);
    return NextResponse.json(
      { errore: esito.motivo, messaggio: t(MESSAGGI[esito.motivo]) },
      { status: esito.motivo === "ricerca_fallita" ? 502 : 404 },
    );
  }
  return NextResponse.json({ ok: true, offerta: esito.offerta, annataEsatta: esito.annataEsatta, affidabilita: esito.affidabilita });
}

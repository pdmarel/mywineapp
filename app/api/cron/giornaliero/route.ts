import { NextResponse } from "next/server";
import { leggiVino } from "@/lib/ai/leggi-vino";
import { aggiornaPrezzo } from "@/lib/prezzi/aggiorna";
import { creaClientAdmin } from "@/lib/supabase/admin";

// Lavoro notturno, chiamato da Vercel una volta al giorno (vercel.json).
//  1. Tocca il database: sul piano gratuito Supabase mette in pausa i progetti fermi da 7 giorni.
//  2. Riprova le etichette rimaste in coda (quota finita al momento della foto).
//  3. Aggiorna alcuni prezzi: prima i vini in giacenza che non ne hanno mai avuto uno, poi i più vecchi.
//     Chi non è in vendita online riceve un prezzo di riferimento stimato (vedi lib/prezzi/stima.ts).
// Bilancio: PREZZI_AL_GIORNO ricerche × 30 giorni (600) deve stare dentro i 1.000 crediti mensili di Tavily,
// lasciando spazio alle ricerche fatte a mano dall'app.
export const maxDuration = 300;

const PREZZI_AL_GIORNO = 20;
const ETICHETTE_AL_GIORNO = 10;
const GIORNI_PRIMA_DI_RICERCARE = 45;

export async function GET(richiesta: Request) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto || richiesta.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
  }
  const admin = creaClientAdmin();

  const [{ data: vini, error }, { data: ricerche }] = await Promise.all([
    admin
      .from("vini")
      .select("id, nome_fantasia, denominazione, produttore, annata, capacita_cl, giacenze(quantita)")
      .limit(5000),
    admin.from("prezzi").select("vino_id, rilevato_il").neq("metodo", "manuale").order("rilevato_il", { ascending: false }).limit(20000),
  ]);
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  // Data dell'ultima ricerca automatica per ogni vino (le righe arrivano dalla più recente).
  const ultima = new Map<string, number>();
  for (const r of ricerche ?? []) if (!ultima.has(r.vino_id)) ultima.set(r.vino_id, new Date(r.rilevato_il).getTime());

  const soglia = Date.now() - GIORNI_PRIMA_DI_RICERCARE * 24 * 3600 * 1000;
  const daFare = (vini ?? [])
    // Basta un dato per avere almeno una stima; senza produttore non si consuma nessun credito di ricerca.
    .filter((v) => v.produttore || v.nome_fantasia || v.denominazione)
    .filter((v) => ((v.giacenze ?? []) as { quantita: number }[]).some((g) => g.quantita > 0))
    .filter((v) => (ultima.get(v.id) ?? 0) < soglia)
    .sort((a, b) => (ultima.get(a.id) ?? 0) - (ultima.get(b.id) ?? 0))
    .slice(0, PREZZI_AL_GIORNO);

  // Etichette in attesa, uno alla volta con una pausa (tetto al minuto del servizio):
  //  - vini con foto e senza dati (in coda per quota finita, o da analizzare);
  //  - bottiglie inserite a mano con le foto, la cui lettura automatica non è mai andata a buon fine.
  // Le schede importate dal vecchio foglio (id_foglio) non si toccano: sono già state controllate una per una.
  const { data: inCoda } = await admin
    .from("vini")
    .select("id, stato")
    .or("stato.in.(in_coda,da_analizzare),and(stato.eq.confermato,estrazione.is.null,id_foglio.is.null)")
    .not("foto_fronte", "is", null)
    .order("creato_il")
    .limit(ETICHETTE_AL_GIORNO);
  const etichette: { vino: string; esito: string }[] = [];
  for (const v of inCoda ?? []) {
    const e = await leggiVino(admin, v.id, { soloNovita: v.stato === "confermato" });
    etichette.push({ vino: v.id.slice(0, 8), esito: e.ok ? `letta (${e.provider})` : e.codice });
    if (!e.ok && e.codice === "quota") break;
    await new Promise((ok) => setTimeout(ok, 8000));
  }

  const esiti: { vino: string; esito: string }[] = [];
  for (const v of daFare) {
    const e = await aggiornaPrezzo(admin, v);
    esiti.push({
      vino: [v.nome_fantasia ?? v.denominazione, v.annata].filter(Boolean).join(" "),
      esito: e.trovato ? `${e.offerta.prezzo} € (${e.offerta.fonte}, ${e.affidabilita}%)` : e.stima ? `stima ${e.stima.prezzo} € (${e.stima.affidabilita}%)` : e.motivo,
    });
    if (!e.trovato && e.motivo === "ricerca_fallita") break; // crediti finiti o servizio giù: inutile insistere
  }
  return NextResponse.json({ ok: true, vini: vini?.length ?? 0, etichette, prezziInAttesa: daFare.length, esiti });
}

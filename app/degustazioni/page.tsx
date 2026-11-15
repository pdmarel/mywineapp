import Link from "next/link";
import { redirect } from "next/navigation";
import { Testata } from "@/components/Testata";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import { titoloVino } from "@/lib/vini";

// Tutte le degustazioni di chi è collegato, in ordine di data: quelle dei vini in cantina
// e quelle di vini assaggiati altrove (manifestazioni, ristoranti…), che in cantina non ci sono.

type Riga = {
  id: string;
  cantina_id: string;
  vino_id: string | null;
  vino_libero: string | null;
  degustato_il: string;
  punteggio: number | null;
  dinamica: { curve?: unknown[] } | null;
  scheda: {
    spazio?: { olfatto?: unknown[]; bocca?: unknown[] };
    libero?: { evento?: string | null; foto_fronte?: string | null; foto_retro?: string | null };
  } | null;
  vini: { nome_fantasia: string | null; denominazione: string | null; produttore: string | null; annata: number | null } | null;
};

export const dynamic = "force-dynamic";

export default async function PaginaDegustazioni() {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { t, locale } = await traduzione();

  const { data, error } = await supabase
    .from("degustazioni")
    .select("id, cantina_id, vino_id, vino_libero, degustato_il, punteggio, dinamica, scheda, vini(nome_fantasia, denominazione, produttore, annata)")
    .eq("user_id", user.id)
    .order("degustato_il", { ascending: false })
    .order("creato_il", { ascending: false })
    .limit(300);
  const righe = (data ?? []) as unknown as Riga[];

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{t("Le mie degustazioni")}</h1>
          <Link href="/degustazioni/nuova" className="pulsante flex items-center">
            {t("+ Degusta")}
          </Link>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {t("Non riesco a leggere le degustazioni ({errore}).", { errore: error.message })}
          </p>
        )}
        {righe.length === 0 && !error && (
          <p className="scheda text-sm text-tenue">
            {t("Nessuna degustazione. Con «+ Degusta» registri un vino assaggiato ovunque, anche se non è nella tua cantina. Per un vino che hai in cantina puoi partire anche dalla sua scheda.")}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {righe.map((d) => {
            const titolo = d.vini
              ? `${titoloVino(d.vini, t)}${d.vini.annata ? ` ${d.vini.annata}` : ""}`
              : (d.vino_libero ??
                (d.scheda?.libero?.foto_fronte || d.scheda?.libero?.foto_retro ? t("Vino in foto (senza nome)") : t("Vino senza nome")));
            const punti = (d.scheda?.spazio?.olfatto?.length ?? 0) + (d.scheda?.spazio?.bocca?.length ?? 0);
            const curve = d.dinamica?.curve?.length ?? 0;
            const dettagli = [
              punti > 0 ? (punti === 1 ? t("{n} punto nello spazio", { n: punti }) : t("{n} punti nello spazio", { n: punti })) : null,
              curve > 0 ? (curve === 1 ? t("{n} sensazione", { n: curve }) : t("{n} sensazioni", { n: curve })) : null,
            ].filter(Boolean);
            return (
              <li key={d.id}>
                <Link href={`/cantine/${d.cantina_id}/degustazioni/${d.id}`} className="scheda flex items-center gap-3 p-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{titolo}</span>
                    <span className="truncate text-sm text-tenue">
                      {new Date(`${d.degustato_il}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                      {" · "}
                      {d.vini ? t("in cantina") : (d.scheda?.libero?.evento ?? t("fuori cantina"))}
                    </span>
                    {dettagli.length > 0 && <span className="text-xs text-tenue">{dettagli.join(" · ")}</span>}
                  </div>
                  {d.punteggio && (
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="text-2xl font-semibold text-vino">{Number(d.punteggio)}</span>
                      <span className="text-xs text-tenue">{t("punti")}</span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}

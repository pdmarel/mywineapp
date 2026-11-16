import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Testata } from "@/components/Testata";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";

// Registro delle modifiche: chi ha cambiato cosa e quando. Lo vede solo il proprietario.
// Le righe le scrivono i trigger del database (supabase/migrations/0004_registro.sql).

type Riga = {
  id: number;
  email: string | null;
  azione: "inserimento" | "modifica" | "cancellazione";
  tabella: string;
  etichetta: string | null;
  prima: Record<string, unknown> | null;
  dopo: Record<string, unknown> | null;
  creato_il: string;
};

const PER_PAGINA = 100;

function valore(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return "(…)";
  return String(v);
}

export default async function PaginaAttivita({ params, searchParams }: PageProps<"/cantine/[id]/attivita">) {
  const { id } = await params;
  const { t, locale } = await traduzione();
  const parametri = await searchParams;
  const persona = typeof parametri.persona === "string" ? parametri.persona : "";

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: cantina }, { data: ruolo }] = await Promise.all([
    supabase.from("cantine").select("id, nome").eq("id", id).maybeSingle(),
    supabase.from("cantina_membri").select("ruolo").eq("cantina_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!cantina) notFound();
  if (ruolo?.ruolo !== "proprietario") redirect(`/cantine/${id}/impostazioni?errore=permesso`);

  let consulta = supabase
    .from("registro")
    .select("id, email, azione, tabella, etichetta, prima, dopo, creato_il")
    .eq("cantina_id", id)
    .order("creato_il", { ascending: false })
    .limit(PER_PAGINA);
  if (persona === "automatico") consulta = consulta.is("email", null);
  else if (persona) consulta = consulta.eq("email", persona);
  const { data, error } = await consulta;
  const mancaTabella = !!error && (error.code === "42P01" || /registro/.test(error.message));
  const righe = (data ?? []) as Riga[];

  // Chi ha lasciato tracce (per il filtro): dalle ultime righe, senza una seconda interrogazione.
  const { data: recenti } = mancaTabella
    ? { data: [] as { email: string | null }[] }
    : await supabase.from("registro").select("email").eq("cantina_id", id).order("creato_il", { ascending: false }).limit(500);
  const autori = [...new Set((recenti ?? []).map((r) => r.email))];

  const COSA: Record<string, string> = {
    vini: t("vino"),
    giacenze: t("quantità"),
    luoghi: t("luogo"),
    posizioni: t("posizione"),
    degustazioni: t("degustazione"),
  };
  const AZIONE: Record<Riga["azione"], string> = {
    inserimento: t("ha aggiunto"),
    modifica: t("ha modificato"),
    cancellazione: t("ha tolto"),
  };

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={`/cantine/${cantina.id}/impostazioni`} className="text-sm text-vino underline">
          ‹ {t("Impostazioni")}
        </Link>
        <h1 className="text-xl font-semibold">{t("Attività")}</h1>
        <p className="text-sm text-tenue">
          {t("Chi ha aggiunto, modificato o tolto vini, quantità, luoghi, posizioni e degustazioni di questa cantina. Lo vedi solo tu, che sei il proprietario.")}
        </p>

        {mancaTabella ? (
          <p className="rounded-xl bg-ambra/15 p-3 text-sm">
            {t("Per usare questa funzione serve un'aggiunta al database, da fare una volta sola: in Supabase → SQL Editor esegui il contenuto di questo file:")}{" "}
            <code>supabase/migrations/0004_registro.sql</code>
          </p>
        ) : (
          <>
            {autori.length > 1 && (
              <nav className="flex flex-wrap gap-2 text-sm" aria-label={t("Filtra per persona")}>
                <Link href={`/cantine/${id}/attivita`} className={`rounded-lg px-3 py-1.5 ${!persona ? "bg-vino text-white" : "bg-carta"}`}>
                  {t("Tutti")}
                </Link>
                {autori.map((a) => {
                  const chiave = a ?? "automatico";
                  return (
                    <Link
                      key={chiave}
                      href={`/cantine/${id}/attivita?persona=${encodeURIComponent(chiave)}`}
                      className={`rounded-lg px-3 py-1.5 ${persona === chiave ? "bg-vino text-white" : "bg-carta"}`}
                    >
                      {a ?? t("Automatico")}
                    </Link>
                  );
                })}
              </nav>
            )}

            {righe.length === 0 ? (
              <p className="scheda text-sm text-tenue">{t("Ancora nessuna modifica registrata. Da ora in poi comparirà qui.")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {righe.map((r) => {
                  const campi = r.dopo ? Object.keys(r.dopo) : [];
                  return (
                    <li key={r.id} className="scheda flex flex-col gap-1 text-sm">
                      <span className="text-xs text-tenue">
                        {new Date(r.creato_il).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>
                        <strong>{r.email ?? t("Automatico")}</strong> {AZIONE[r.azione]} {COSA[r.tabella] ?? r.tabella}
                        {r.etichetta ? <> · {r.etichetta}</> : null}
                      </span>
                      {campi.length > 0 && (
                        <ul className="text-xs text-tenue">
                          {campi.map((c) => (
                            <li key={c}>
                              {c}: {valore(r.prima?.[c])} → {valore(r.dopo?.[c])}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {righe.length === PER_PAGINA && (
              <p className="text-xs text-tenue">{t("Si vedono le ultime {n} modifiche.", { n: PER_PAGINA })}</p>
            )}
          </>
        )}
      </main>
    </>
  );
}

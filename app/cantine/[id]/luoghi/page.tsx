import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import { PulsanteConConferma } from "@/components/PulsanteConConferma";
import { creaLuogo, creaPosizioni, rinominaPosizione, togliPosizione } from "@/app/azioni";

const MESSAGGI: Record<string, string> = {
  nome: daTradurre("Manca il nome."),
  doppione: daTradurre("Esiste già un luogo con questo nome."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
  doppione_posizione: daTradurre("In questo luogo esiste già una posizione con questo nome."),
  bottiglie: daTradurre("In questa posizione ci sono ancora bottiglie: spostale prima di toglierla."),
};
const FATTO: Record<string, string> = {
  rinominata: daTradurre("Posizione rinominata: le bottiglie sono rimaste dove erano."),
  tolta: daTradurre("Posizione tolta."),
};

type Posizione = { id: string; codice: string };
type Luogo = { id: string; nome: string; posizioni: Posizione[] };

// Ordina i codici come li leggerebbe una persona: A2 prima di A10.
function perCodice(a: Posizione, b: Posizione) {
  return a.codice.localeCompare(b.codice, "it", { numeric: true });
}

export default async function PaginaLuoghi({ params, searchParams }: PageProps<"/cantine/[id]/luoghi">) {
  const { id } = await params;
  const { t } = await traduzione();
  const parametri = await searchParams;
  const errore = typeof parametri.errore === "string" ? MESSAGGI[parametri.errore] : undefined;
  const fatto = typeof parametri.fatto === "string" ? FATTO[parametri.fatto] : undefined;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cantina } = await supabase
    .from("cantine")
    .select("id, nome, luoghi(id, nome, posizioni(id, codice))")
    .eq("id", id)
    .maybeSingle();
  if (!cantina) notFound();

  const luoghi = ((cantina.luoghi ?? []) as Luogo[]).sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={`/cantine/${cantina.id}`} className="text-sm text-vino underline">
          ‹ {t("Cantina {nome}", { nome: cantina.nome })}
        </Link>
        <h1 className="text-xl font-semibold">{t("Luoghi e posizioni")}</h1>

        {fatto && <p className="rounded-xl bg-ambra/15 p-3 text-sm">{t(fatto)}</p>}
        {errore && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {t(errore)}
          </p>
        )}

        <p className="scheda text-sm text-tenue">
          {t("Qui si definisce dove stanno le bottiglie.")} <strong>{t("Luoghi:")}</strong>{" "}
          {t("una casa, un magazzino.")} <strong>{t("Posizioni:")}</strong>{" "}
          {t("uno scaffale o un ripiano dentro ogni luogo.")}
        </p>

        {luoghi.map((luogo) => (
          <section key={luogo.id} className="scheda flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">{luogo.nome}</h2>
              <Link href={`/cantine/${cantina.id}/luoghi/${luogo.id}`} className="text-sm text-vino underline">
                {t("Vedi in 3D")} ›
              </Link>
            </div>
            {luogo.posizioni.length === 0 ? (
              <p className="text-sm text-tenue">{t("Nessuna posizione.")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {[...luogo.posizioni].sort(perCodice).map((p) => (
                  <li key={p.id} className="rounded-lg border border-bordo bg-sfondo px-3 py-1 text-sm">
                    {p.codice}
                  </li>
                ))}
              </ul>
            )}
            {luogo.posizioni.length > 0 && (
              <details className="rounded-xl border border-bordo bg-sfondo p-3">
                <summary className="cursor-pointer text-sm text-vino underline">{t("Rinomina o togli una posizione")}</summary>
                <p className="mt-2 text-xs text-tenue">
                  {t("Cambiando il nome le bottiglie restano dove sono e il disegno 3D si aggiorna da solo. Si può togliere solo una posizione vuota.")}
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {[...luogo.posizioni].sort(perCodice).map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <form action={rinominaPosizione} className="flex min-w-0 flex-1 gap-2">
                        <input type="hidden" name="cantina_id" value={cantina.id} />
                        <input type="hidden" name="luogo_id" value={luogo.id} />
                        <input type="hidden" name="posizione_id" value={p.id} />
                        <input
                          name="codice"
                          required
                          maxLength={20}
                          defaultValue={p.codice}
                          className="campo min-h-10 min-w-0 px-2 text-sm"
                          aria-label={t("Nuovo nome della posizione {codice}", { codice: p.codice })}
                        />
                        <button type="submit" className="shrink-0 rounded-lg border border-bordo bg-carta px-3 text-sm">
                          {t("Rinomina")}
                        </button>
                      </form>
                      <form action={togliPosizione} className="shrink-0">
                        <input type="hidden" name="cantina_id" value={cantina.id} />
                        <input type="hidden" name="luogo_id" value={luogo.id} />
                        <input type="hidden" name="posizione_id" value={p.id} />
                        <PulsanteConConferma testo={t("Togli")} domanda={t("Togliere la posizione {codice}?", { codice: p.codice })} />
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <form action={creaPosizioni} className="flex gap-2">
              <input type="hidden" name="cantina_id" value={cantina.id} />
              <input type="hidden" name="luogo_id" value={luogo.id} />
              <input
                name="codici"
                required
                className="campo"
                placeholder={t("Posizioni, es. A1, A2, A3")}
                aria-label={t("Nuove posizioni in {luogo}", { luogo: luogo.nome })}
              />
              <button type="submit" className="pulsante">
                {t("Aggiungi")}
              </button>
            </form>
          </section>
        ))}

        <form action={creaLuogo} className="scheda flex flex-col gap-3">
          <label htmlFor="nome-luogo" className="text-sm font-medium">
            {t("Nuovo luogo")}
          </label>
          <input type="hidden" name="cantina_id" value={cantina.id} />
          <div className="flex gap-2">
            <input
              id="nome-luogo"
              name="nome"
              required
              maxLength={60}
              className="campo"
              placeholder={t("Nome, es. EM-home")}
            />
            <button type="submit" className="pulsante">
              {t("Crea")}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PulsanteConConferma } from "@/components/PulsanteConConferma";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { invitatiDi } from "@/lib/persone";
import { creaClientServer } from "@/lib/supabase/server";
import { eliminaCantina, invitaPersona, rinominaCantina, togliPersona } from "../azioni-cantina";

const ERRORI: Record<string, string> = {
  permesso: daTradurre("Solo il proprietario della cantina può cambiare queste impostazioni."),
  nome: daTradurre("Scrivi un nome (al massimo 60 caratteri)."),
  email: daTradurre("Scrivi un indirizzo email valido."),
  te_stesso: daTradurre("Sei già il proprietario di questa cantina."),
  tabella: daTradurre("Manca la tabella degli inviti nel database: va eseguito una volta il file 0002_inviti.sql (vedi sotto)."),
  conferma: daTradurre("Il nome scritto non coincide con quello della cantina: non ho cancellato nulla."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
};
const FATTO: Record<string, string> = {
  nome: daTradurre("Nome cambiato."),
  invito: daTradurre("Persona aggiunta: può entrare con la sua email."),
  tolta: daTradurre("Persona tolta dalla cantina."),
};

export default async function PaginaImpostazioni({ params, searchParams }: PageProps<"/cantine/[id]/impostazioni">) {
  const { id } = await params;
  const { t } = await traduzione();
  const parametri = await searchParams;
  const errore = typeof parametri.errore === "string" ? ERRORI[parametri.errore] : undefined;
  const fatto = typeof parametri.fatto === "string" ? FATTO[parametri.fatto] : undefined;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: cantina }, { data: ruolo }, { count: vini }] = await Promise.all([
    supabase.from("cantine").select("id, nome").eq("id", id).maybeSingle(),
    supabase.from("cantina_membri").select("ruolo").eq("cantina_id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("vini").select("id", { count: "exact", head: true }).eq("cantina_id", id),
  ]);
  if (!cantina) notFound();
  const sonoProprietario = ruolo?.ruolo === "proprietario";
  const invitati = sonoProprietario ? await invitatiDi(id) : [];

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={`/cantine/${cantina.id}`} className="text-sm text-vino underline">
          ‹ {t("Cantina {nome}", { nome: cantina.nome })}
        </Link>
        <h1 className="text-xl font-semibold">{t("Impostazioni")}</h1>

        {fatto && <p className="rounded-xl bg-ambra/15 p-3 text-sm">{t(fatto)}</p>}
        {errore && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {t(errore)}
          </p>
        )}

        {!sonoProprietario ? (
          <p className="scheda text-sm text-tenue">
            {t("Sei ospite di questa cantina: puoi vedere e modificare le bottiglie, ma nome, persone e cancellazione li gestisce il proprietario.")}
          </p>
        ) : (
          <>
            <section className="scheda flex flex-col gap-3">
              <h2 className="text-lg font-medium">{t("Nome")}</h2>
              <form action={rinominaCantina} className="flex gap-2">
                <input type="hidden" name="cantina_id" value={cantina.id} />
                <input name="nome" defaultValue={cantina.nome} required maxLength={60} className="campo" aria-label={t("Nome della cantina")} />
                <button type="submit" className="pulsante">
                  {t("Salva")}
                </button>
              </form>
            </section>

            <section className="scheda flex flex-col gap-3">
              <h2 className="text-lg font-medium">{t("Persone")}</h2>
              <p className="text-sm text-tenue">
                {t("Chi aggiungi qui entra nell'app con la propria email (riceve il codice come te), vede solo questa cantina e può inserire e modificare bottiglie. Non può cancellare la cantina né invitare altri.")}
              </p>

              {invitati === null ? (
                <p className="rounded-xl bg-ambra/15 p-3 text-sm">
                  {t("Per usare questa funzione serve un'aggiunta al database, da fare una volta sola: in Supabase → SQL Editor esegui il contenuto di questo file:")}{" "}
                  <code>supabase/migrations/0002_inviti.sql</code>
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    <li className="flex items-center justify-between gap-3 rounded-xl bg-sfondo px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{user.email}</span>
                      <span className="shrink-0 text-xs text-tenue">{t("proprietario")}</span>
                    </li>
                    {invitati.map((p) => (
                      <li key={p.email} className="flex items-center justify-between gap-3 rounded-xl bg-sfondo px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate">{p.email}</span>
                          <span className="block text-xs text-tenue">
                            {p.entrata ? t("è già entrata") : t("non è ancora entrata")}
                          </span>
                        </span>
                        <form action={togliPersona} className="shrink-0">
                          <input type="hidden" name="cantina_id" value={cantina.id} />
                          <input type="hidden" name="email" value={p.email} />
                          <PulsanteConConferma
                            testo={t("Togli")}
                            domanda={t("Togliere {email} da questa cantina? Non potrà più vederla.", { email: p.email })}
                          />
                        </form>
                      </li>
                    ))}
                  </ul>
                  <form action={invitaPersona} className="flex gap-2">
                    <input type="hidden" name="cantina_id" value={cantina.id} />
                    <input
                      name="email"
                      type="email"
                      required
                      inputMode="email"
                      className="campo"
                      placeholder={t("email della persona")}
                      aria-label={t("Email della persona da aggiungere")}
                    />
                    <button type="submit" className="pulsante">
                      {t("Aggiungi")}
                    </button>
                  </form>
                  <p className="text-xs text-tenue">
                    {t("L'app non le manda un invito: avvisala tu e dalle l'indirizzo dell'app.")}
                  </p>
                </>
              )}
            </section>

            <section className="scheda flex flex-col gap-3 border-vino/40">
              <h2 className="text-lg font-medium text-vino-scuro">{t("Cancella la cantina")}</h2>
              <p className="text-sm">
                {t("Elimina la cantina con tutto ciò che contiene: i vini, le loro foto, le quantità, i prezzi, i luoghi e le posizioni.")}{" "}
                <strong>{t("Vini in questa cantina: {n}.", { n: vini ?? 0 })}</strong>{" "}
                <strong>{t("Non si può annullare.")}</strong>
              </p>
              <form action={eliminaCantina} className="flex flex-col gap-2">
                <input type="hidden" name="cantina_id" value={cantina.id} />
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t("Per confermare scrivi il nome della cantina: {nome}", { nome: cantina.nome })}
                  <input name="conferma" required autoComplete="off" className="campo" />
                </label>
                <PulsanteConConferma
                  testo={t("Cancella definitivamente")}
                  domanda={t("Cancellare la cantina «{nome}» con {n} vini e tutte le foto? Non si può annullare.", { nome: cantina.nome, n: vini ?? 0 })}
                  className="pulsante"
                />
              </form>
            </section>
          </>
        )}
      </main>
    </>
  );
}

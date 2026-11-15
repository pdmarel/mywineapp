import Link from "next/link";
import { redirect } from "next/navigation";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { riscattaInviti } from "@/lib/persone";
import { creaClientServer } from "@/lib/supabase/server";
import { emailAutorizzata, supabaseConfigurato } from "@/lib/supabase/config";
import { creaCantina } from "./azioni";

// Dipende sempre dall'utente collegato: mai una versione salvata in anticipo.
export const dynamic = "force-dynamic";

const MESSAGGI: Record<string, string> = {
  nome: daTradurre("Scrivi un nome per la cantina."),
  non_abilitata: daTradurre("Questa email non è abilitata a creare cantine."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
};

export default async function PaginaCantine({ searchParams }: PageProps<"/">) {
  if (!supabaseConfigurato()) redirect("/login?errore=configurazione");

  const { t } = await traduzione();
  const parametri = await searchParams;
  const errore =
    typeof parametri.errore === "string"
      ? MESSAGGI[parametri.errore]
      : undefined;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Chi è stato invitato in una cantina ne diventa membro al primo ingresso.
  await riscattaInviti(user);

  // La RLS restituisce solo le cantine di cui l'utente è membro.
  const { data: cantine, error } = await supabase
    .from("cantine")
    .select("id, nome, luoghi(count)")
    .order("nome");

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">{t("Le mie cantine")}</h1>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro"
          >
            {t("Non riesco a leggere le cantine dal database ({errore}). Lo schema è stato applicato?", { errore: error.message })}
          </p>
        )}
        {errore && (
          <p
            role="alert"
            className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro"
          >
            {t(errore)}
          </p>
        )}
        {parametri.fatto === "cantina_cancellata" && (
          <p className="rounded-xl bg-ambra/15 p-3 text-sm">
            {t("Cantina cancellata.")}
          </p>
        )}

        {cantine && cantine.length === 0 && (
          <p className="scheda text-sm text-tenue">
            {user.email && emailAutorizzata(user.email)
              ? t("Non c'è ancora nessuna cantina. Creane una qui sotto.")
              : t("Non fai ancora parte di nessuna cantina: chiedi al proprietario di aggiungere la tua email.")}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {(cantine ?? []).map((cantina) => {
            const luoghi =
              (cantina.luoghi as { count: number }[] | null)?.[0]?.count ?? 0;
            return (
              <li key={cantina.id}>
                <Link
                  href={`/cantine/${cantina.id}`}
                  className="scheda flex items-center justify-between"
                >
                  <span className="text-lg font-medium">{cantina.nome}</span>
                  <span className="text-sm text-tenue">
                    {luoghi === 1 ? t("{n} luogo", { n: luoghi }) : t("{n} luoghi", { n: luoghi })} ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Solo i proprietari (EMAIL_AUTORIZZATE) possono creare cantine: agli ospiti il modulo non serve. */}
        {user.email && emailAutorizzata(user.email) && (
          <form
            action={creaCantina}
            className="scheda mt-2 flex flex-col gap-3"
          >
            <label htmlFor="nome" className="text-sm font-medium">
              {t("Nuova cantina")}
            </label>
            <div className="flex gap-2">
              <input
                id="nome"
                name="nome"
                required
                maxLength={60}
                className="campo"
                placeholder={t("Nome, es. EM")}
              />
              <button type="submit" className="pulsante">
                {t("Crea")}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}

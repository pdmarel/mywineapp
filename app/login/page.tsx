import { Logo } from "@/components/Logo";
import { SceltaLingua } from "@/components/SceltaLingua";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { supabaseConfigurato } from "@/lib/supabase/config";
import { postaConfigurata } from "@/lib/posta";
import { chiediAccesso, ricomincia, verificaCodice } from "./azioni";

const MESSAGGI: Record<string, string> = {
  configurazione: daTradurre("L'app non è ancora collegata a Supabase: mancano le variabili d'ambiente."),
  email: daTradurre("Scrivi un indirizzo email valido."),
  non_abilitata: daTradurre("Questa email non è abilitata a usare l'app."),
  invio: daTradurre("Non sono riuscito a spedire l'email. Riprova tra qualche minuto."),
  troppi_invii:
    daTradurre("Il servizio di posta ha raggiunto il limite di email per quest'ora. Se hai già ricevuto un link, usa quello; altrimenti riprova tra un'ora."),
  scaduto: daTradurre("La richiesta è scaduta. Inserisci di nuovo l'email."),
  codice: daTradurre("Codice non valido o scaduto. Controlla le cifre o fattene mandare uno nuovo."),
  link: daTradurre("Il link non è più valido o è già stato usato. Richiedine uno nuovo."),
};

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { t } = await traduzione();
  const parametri = await searchParams;
  const passo =
    parametri.passo === "codice" ? "codice" : parametri.passo === "inviata" ? "inviata" : "email";
  // L'avviso di configurazione mancante ha già il suo riquadro: non ripeterlo come errore.
  const errore =
    typeof parametri.errore === "string" && parametri.errore !== "configurazione" && MESSAGGI[parametri.errore]
      ? t(MESSAGGI[parametri.errore])
      : undefined;
  const conCodice = postaConfigurata();

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="scheda w-full max-w-sm">
        <h1 className="mb-1 text-2xl">
          <Logo />
        </h1>
        <p className="mb-5 text-sm text-tenue">{t("La mia cantina e le mie degustazioni")}</p>

        {!supabaseConfigurato() && (
          <p className="mb-4 rounded-xl bg-ambra/15 p-3 text-sm">{t(MESSAGGI.configurazione)}</p>
        )}
        {errore && (
          <p role="alert" className="mb-4 rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {errore}
          </p>
        )}

        {passo === "email" && (
          <form action={chiediAccesso} className="flex flex-col gap-3">
            <label className="text-sm font-medium" htmlFor="email">
              {t("Email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="campo"
              placeholder={t("nome@esempio.it")}
            />
            <button type="submit" className="pulsante">
              {conCodice ? t("Mandami il codice") : t("Mandami il link di accesso")}
            </button>
            <p className="text-xs text-tenue">
              {conCodice
                ? t("Ricevi per email un codice numerico da scrivere qui.")
                : t("Ricevi per email un link: aprendolo entri direttamente.")}{" "}
              {t("Nessuna password; entrano solo le email abilitate.")}
            </p>
          </form>
        )}

        {passo === "inviata" && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl bg-ambra/15 p-3 text-sm">
              {t("Ti ho mandato un'email con il link di accesso.")}{" "}
              <strong>{t("Aprilo su questo stesso dispositivo e in questo stesso browser: entri subito.")}</strong>
            </p>
            <p className="text-xs text-tenue">
              {t("Non arriva? Controlla la posta indesiderata. Il link vale circa un'ora e funziona una volta sola.")}
            </p>
            <form action={ricomincia}>
              <button type="submit" className="text-sm text-vino underline">
                {t("Cambia email o richiedi un nuovo link")}
              </button>
            </form>
          </div>
        )}

        {passo === "codice" && (
          <>
            <form action={verificaCodice} className="flex flex-col gap-3">
              <p className="rounded-xl bg-ambra/15 p-3 text-sm">
                <strong>{t("Ti ho mandato un'email con un codice numerico.")}</strong>{" "}
                {t("Scrivilo qui sotto. In alternativa, nell'email c'è anche un link.")}
              </p>
              <label className="text-sm font-medium" htmlFor="codice">
                {t("Codice ricevuto per email")}
              </label>
              <input
                id="codice"
                name="codice"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,12}"
                maxLength={12}
                className="campo text-center text-2xl tracking-[0.25em]"
                placeholder="···· ····"
              />
              <button type="submit" className="pulsante">
                {t("Entra")}
              </button>
            </form>
            <p className="mt-3 text-xs text-tenue">{t("Non arriva? Controlla la posta indesiderata.")}</p>
            <form action={ricomincia} className="mt-1">
              <button type="submit" className="text-sm text-vino underline">
                {t("Cambia email o richiedi un nuovo codice")}
              </button>
            </form>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <SceltaLingua estesa />
        </div>
      </div>
    </main>
  );
}

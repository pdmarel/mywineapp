import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDegustazione } from "@/components/FormDegustazione";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import { salvaDegustazione } from "@/app/cantine/[id]/azioni-degustazioni";

// Degustazione di un vino che non è in cantina (assaggiato a una manifestazione, al ristorante…).
//
// Nel database ogni degustazione deve appartenere a una cantina (è la cantina che decide chi può vederla):
// quelle "fuori cantina" si appoggiano alla prima cantina di cui si è proprietari, senza comparire tra i suoi vini.
// Conseguenza da sapere: gli altri membri di quella cantina possono leggerle.

const ERRORI: Record<string, string> = {
  vino: daTradurre("Scrivi almeno il nome del vino."),
  vuota: daTradurre("Valuta almeno una sensazione, aggiungi un punto nello spazio oppure scrivi una nota."),
  dati: daTradurre("I dati non sono arrivati correttamente. Riprova."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
};

export default async function PaginaNuovaDegustazioneLibera({ searchParams }: PageProps<"/degustazioni/nuova">) {
  const parametri = await searchParams;
  const { t } = await traduzione();
  const errore = typeof parametri.errore === "string" && ERRORI[parametri.errore] ? t(ERRORI[parametri.errore]) : undefined;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appartenenze } = await supabase
    .from("cantina_membri")
    .select("cantina_id, ruolo, cantine(nome)")
    .eq("user_id", user.id);
  // Scelta stabile: prima le cantine di cui si è proprietari, poi in ordine alfabetico di nome.
  const ordinate = ((appartenenze ?? []) as unknown as { cantina_id: string; ruolo: string; cantine: { nome: string } | null }[]).sort(
    (x, y) =>
      Number(y.ruolo === "proprietario") - Number(x.ruolo === "proprietario") ||
      (x.cantine?.nome ?? "").localeCompare(y.cantine?.nome ?? "", "it"),
  );
  const cantina = ordinate[0]?.cantina_id;

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href="/degustazioni" className="text-sm text-vino underline">
          ‹ {t("Le mie degustazioni")}
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{t("Nuova degustazione")}</h1>
          <p className="text-sm text-tenue">
            {t("Per un vino che non hai in cantina. Se invece è in cantina, apri la sua scheda e tocca «+ Degusta».")}
          </p>
        </div>
        {errore && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {errore}
          </p>
        )}
        {cantina ? (
          <FormDegustazione azione={salvaDegustazione} cantinaId={cantina} />
        ) : (
          <p className="scheda text-sm">
            {t("Per registrare degustazioni serve far parte di almeno una cantina.")}{" "}
            <Link href="/" className="text-vino underline">
              {t("Vai alle cantine")}
            </Link>
            .
          </p>
        )}
      </main>
    </>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormDegustazione } from "@/components/FormDegustazione";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import { titoloVino } from "@/lib/vini";
import { salvaDegustazione } from "../../../azioni-degustazioni";

const ERRORI: Record<string, string> = {
  vuota: daTradurre("Valuta almeno una sensazione oppure scrivi una nota."),
  dati: daTradurre("I dati della mappa non sono arrivati correttamente. Riprova."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
};

export default async function PaginaNuovaDegustazione({
  params,
  searchParams,
}: PageProps<"/cantine/[id]/vini/[vinoId]/degustazione">) {
  const { id, vinoId } = await params;
  const parametri = await searchParams;
  const { t } = await traduzione();
  const errore = typeof parametri.errore === "string" && ERRORI[parametri.errore] ? t(ERRORI[parametri.errore]) : undefined;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: vino } = await supabase
    .from("vini")
    .select("id, nome_fantasia, denominazione, produttore, annata")
    .eq("id", vinoId)
    .eq("cantina_id", id)
    .maybeSingle();
  if (!vino) notFound();

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={`/cantine/${id}/vini/${vinoId}`} className="text-sm text-vino underline">
          ‹ {titoloVino(vino, t)}
          {vino.annata ? ` ${vino.annata}` : ""}
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{t("Nuova degustazione")}</h1>
          <p className="text-sm text-tenue">
            {t("Tocca le sensazioni che senti e scegli come si muovono dall'attacco alla persistenza.")}
          </p>
        </div>
        {errore && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {errore}
          </p>
        )}
        <FormDegustazione
          azione={salvaDegustazione}
          cantinaId={id}
          vinoId={vinoId}
          vino={[titoloVino(vino, t), vino.produttore, vino.annata].filter(Boolean).join(", ")}
        />
      </main>
    </>
  );
}

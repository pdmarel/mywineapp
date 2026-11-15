import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocaleCantina } from "@/components/LocaleCantina";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { validaLocale, type Contenuto } from "@/lib/locale";
import { creaClientServer } from "@/lib/supabase/server";
import { titoloVino } from "@/lib/vini";
import { salvaLocale } from "../../azioni-locale";

// Un luogo della cantina in 3D: il locale, gli scaffali e quante bottiglie ci sono in ogni parte di ogni piano.
// Le bottiglie si leggono dalle posizioni del luogo (tabella giacenze): il disegno dice solo dove sta ogni posizione.

const MESSAGGI: Record<string, string> = {
  dati: daTradurre("Il disegno non è arrivato correttamente. Riprova."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
  posizioni: daTradurre("Il disegno è salvato, ma non sono riuscito a creare le nuove posizioni. Riprova a salvare."),
  migrazione: daTradurre("Per salvare il disegno manca un passaggio nel database: eseguire in Supabase il file 0003_locale.sql."),
};

type RigaPosizione = {
  codice: string;
  giacenze: {
    quantita: number;
    vini: { id: string; nome_fantasia: string | null; denominazione: string | null; produttore: string | null; annata: number | null } | null;
  }[];
};

export const dynamic = "force-dynamic";

export default async function PaginaLocale({ params, searchParams }: PageProps<"/cantine/[id]/luoghi/[luogoId]">) {
  const { id, luogoId } = await params;
  const parametri = await searchParams;
  const { t } = await traduzione();
  const errore = typeof parametri.errore === "string" && MESSAGGI[parametri.errore] ? t(MESSAGGI[parametri.errore]) : undefined;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: luogo } = await supabase
    .from("luoghi")
    .select("id, nome, cantine(nome), posizioni(codice, giacenze(quantita, vini(id, nome_fantasia, denominazione, produttore, annata)))")
    .eq("id", luogoId)
    .eq("cantina_id", id)
    .maybeSingle();
  if (!luogo) notFound();

  // Il disegno si legge a parte: se il campo non c'è ancora (migrazione 0003 non eseguita) la pagina funziona lo stesso.
  const disegno = await supabase.from("luoghi").select("locale").eq("id", luogoId).maybeSingle();
  const salvabile = !disegno.error;
  const locale = validaLocale((disegno.data as { locale?: unknown } | null)?.locale);

  const contenuti: Record<string, Contenuto> = {};
  for (const p of (luogo.posizioni ?? []) as unknown as RigaPosizione[]) {
    const vini = (p.giacenze ?? [])
      .filter((g) => g.quantita > 0 && g.vini)
      .map((g) => ({ id: g.vini!.id, titolo: titoloVino(g.vini!, t), produttore: g.vini!.produttore, annata: g.vini!.annata, quantita: g.quantita }))
      .sort((a, b) => a.titolo.localeCompare(b.titolo, "it"));
    contenuti[p.codice] = { bottiglie: vini.reduce((n, v) => n + v.quantita, 0), vini };
  }
  const totale = Object.values(contenuti).reduce((n, c) => n + c.bottiglie, 0);
  const cantina = luogo.cantine as unknown as { nome: string } | null;

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={`/cantine/${id}/luoghi`} className="text-sm text-vino underline">
          {t("‹ Luoghi e posizioni")}{cantina ? ` · ${cantina.nome}` : ""}
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{t("{nome} in 3D", { nome: luogo.nome })}</h1>
          <p className="text-sm text-tenue">
            {totale === 1 ? t("{n} bottiglia in questo luogo.", { n: totale }) : t("{n} bottiglie in questo luogo.", { n: totale })}
            {locale ? "" : " " + t("Disegna il locale e gli scaffali: le bottiglie compaiono da sole dove il nome della parte è quello della loro posizione.")}
          </p>
        </div>

        {parametri.salvato === "1" && <p className="rounded-xl bg-ambra/15 p-3 text-sm">{t("Disegno salvato.")}</p>}
        {errore && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {errore}
          </p>
        )}

        <LocaleCantina
          key={JSON.stringify(locale)}
          azione={salvaLocale}
          cantinaId={id}
          luogoId={luogoId}
          iniziale={locale}
          contenuti={contenuti}
          salvabile={salvabile}
        />
      </main>
    </>
  );
}

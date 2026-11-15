import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mappa3D } from "@/components/Mappa3D";
import { PulsanteConConferma } from "@/components/PulsanteConConferma";
import { VistaSpazio } from "@/components/VistaSpazio";
import { Testata } from "@/components/Testata";
import { validaDinamica } from "@/lib/degustazione";
import { traduzione } from "@/lib/i18n/server";
import { coloreDi, racconto, validaSpazio, type Parte, type Punto } from "@/lib/spazio";
import { creaClientServer } from "@/lib/supabase/server";
import { BUCKET_ETICHETTE, titoloVino } from "@/lib/vini";
import { eliminaDegustazione } from "../../azioni-degustazioni";

export default async function PaginaDegustazione({
  params,
  searchParams,
}: PageProps<"/cantine/[id]/degustazioni/[degustazioneId]">) {
  const { id, degustazioneId } = await params;
  const parametri = await searchParams;

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { t, locale } = await traduzione();

  const { data: d } = await supabase
    .from("degustazioni")
    .select("id, vino_id, vino_libero, degustato_il, dinamica, scheda, note, punteggio, trascrizione, vini(nome_fantasia, denominazione, produttore, annata)")
    .eq("id", degustazioneId)
    .eq("cantina_id", id)
    .maybeSingle();
  if (!d) notFound();

  const vino = d.vini as unknown as {
    nome_fantasia: string | null;
    denominazione: string | null;
    produttore: string | null;
    annata: number | null;
  } | null;
  const dinamica = validaDinamica(d.dinamica);
  const descrittori = ((d.scheda as { descrittori?: string[] } | null)?.descrittori ?? []).filter(Boolean);
  const spazio = validaSpazio((d.scheda as { spazio?: unknown } | null)?.spazio);
  const parti: { parte: Parte; titolo: string; punti: Punto[] }[] = [
    { parte: "olfatto" as const, titolo: t("I profumi nello spazio"), punti: spazio.olfatto },
    { parte: "bocca" as const, titolo: t("Gusti e aromi di bocca nello spazio"), punti: spazio.bocca },
  ].filter((p) => p.punti.length > 0);
  const giorno = new Date(`${d.degustato_il}T12:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const indietro = d.vino_id ? `/cantine/${id}/vini/${d.vino_id}` : "/degustazioni";
  const libero = (
    d.scheda as {
      libero?: {
        nome?: string | null;
        produttore?: string | null;
        annata?: number | null;
        evento?: string | null;
        foto_fronte?: string | null;
        foto_retro?: string | null;
      };
    } | null
  )?.libero;
  const descrizioneLibero = [libero?.nome ?? d.vino_libero, libero?.annata, libero?.produttore].filter(Boolean).join(" · ");

  // Foto dell'etichetta di un vino fuori cantina: l'archivio è privato, servono indirizzi firmati a tempo.
  const foto: { lato: string; url: string }[] = [];
  for (const [lato, percorso] of [
    [t("Etichetta frontale"), libero?.foto_fronte],
    [t("Retro etichetta"), libero?.foto_retro],
  ] as const) {
    if (!percorso || !percorso.startsWith(`${id}/`)) continue;
    const { data: firmato } = await supabase.storage.from(BUCKET_ETICHETTE).createSignedUrl(percorso, 3600);
    if (firmato?.signedUrl) foto.push({ lato, url: firmato.signedUrl });
  }

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={indietro} className="text-sm text-vino underline">
          ‹ {vino ? `${titoloVino(vino, t)}${vino.annata ? ` ${vino.annata}` : ""}` : t("Degustazioni")}
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{t("Degustazione del {giorno}", { giorno })}</h1>
          {!vino && (
            <p className="text-sm text-tenue">
              {descrizioneLibero || (libero?.evento ? t("Vino assaggiato") : t("Vino fuori cantina, senza nome"))}
              {libero?.evento ? ` — ${libero.evento}` : ""}
            </p>
          )}
          {vino && (
            <p className="text-sm text-tenue">
              {[vino.denominazione !== titoloVino(vino, t) ? vino.denominazione : null, vino.produttore]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {parametri.salvata === "1" && <p className="rounded-xl bg-ambra/15 p-3 text-sm">{t("Degustazione salvata.")}</p>}

        {foto.length > 0 && (
          <section className="grid grid-cols-2 gap-3">
            {foto.map((f) => (
              <a key={f.lato} href={f.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-bordo bg-sfondo">
                {/* eslint-disable-next-line @next/next/no-img-element -- indirizzo firmato a tempo: next/image non serve */}
                <img src={f.url} alt={f.lato} className="aspect-[3/4] w-full object-cover" />
              </a>
            ))}
          </section>
        )}

        {parti.map(({ parte, titolo, punti }) => (
          <section key={parte} className="scheda flex flex-col gap-3">
            <h2 className="text-lg font-medium">{titolo}</h2>
            <VistaSpazio punti={punti} />
            <p className="rounded-xl bg-ambra/15 p-3 text-sm">{racconto(punti, parte, t)}</p>
            <ol className="flex flex-col gap-1 text-sm">
              {punti.map((p, i) => (
                <li key={p.id} className="rounded-xl bg-sfondo px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: coloreDi(p.categoria) }} />
                    <span className="font-medium">
                      {i + 1}. {t(p.nome)}
                    </span>
                    <span className="ml-auto text-right text-xs tabular-nums text-tenue">
                      {t("persistenza {persistenza} · ampiezza {ampiezza} · intensità {intensita}", { persistenza: p.persistenza, ampiezza: p.ampiezza, intensita: p.intensita })}
                      {p.fine && (
                        <>
                          <br />→ {t("persistenza {persistenza} · ampiezza {ampiezza} · intensità {intensita}", { persistenza: p.fine.persistenza, ampiezza: p.fine.ampiezza, intensita: p.fine.intensita })}
                        </>
                      )}
                    </span>
                  </span>
                  {p.commento && <span className="mt-1 block text-tenue">❝ {p.commento}</span>}
                </li>
              ))}
            </ol>
          </section>
        ))}

        {dinamica.curve.length > 0 && (
          <section className="scheda flex flex-col gap-3">
            <h2 className="text-lg font-medium">{t("Mappa della dinamica di bocca")}</h2>
            <Mappa3D dinamica={dinamica} />
          </section>
        )}

        {(descrittori.length > 0 || d.note || d.punteggio) && (
          <section className="scheda flex flex-col gap-3">
            <h2 className="text-lg font-medium">{t("Note")}</h2>
            {d.punteggio && (
              <p>
                <span className="text-2xl font-semibold text-vino">{Number(d.punteggio)}</span>{" "}
                <span className="text-sm text-tenue">{t("punti")}</span>
              </p>
            )}
            {descrittori.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {descrittori.map((x) => (
                  <li key={x} className="rounded-lg border border-bordo bg-sfondo px-3 py-1 text-sm">
                    {x}
                  </li>
                ))}
              </ul>
            )}
            {d.note && <p className="whitespace-pre-wrap text-sm">{d.note}</p>}
          </section>
        )}

        {d.trascrizione && (
          <section className="scheda flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t("Vocale trascritto")}</h2>
            <p className="whitespace-pre-wrap text-sm text-tenue">{d.trascrizione}</p>
          </section>
        )}

        <form action={eliminaDegustazione} className="pb-6 text-center">
          <input type="hidden" name="cantina_id" value={id} />
          <input type="hidden" name="degustazione_id" value={d.id} />
          <PulsanteConConferma
            testo={t("Elimina questa degustazione")}
            domanda={t("Eliminare questa degustazione? Non si può annullare.")}
          />
        </form>
      </main>
    </>
  );
}

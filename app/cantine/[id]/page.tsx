import Link from "next/link";
import { LeggiCoda } from "@/components/LeggiCoda";
import { LinkInserimento } from "@/components/LinkInserimento";
import { notFound, redirect } from "next/navigation";
import { Testata } from "@/components/Testata";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import {
  BUCKET_ETICHETTE,
  TIPOLOGIE,
  bottiglieTotali,
  nomeTipologia,
  confrontaCodici,
  percorsoMini,
  titoloVino,
  type Vino,
} from "@/lib/vini";

const PER_PAGINA = 40;

function parametro(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function PaginaCantina({ params, searchParams }: PageProps<"/cantine/[id]">) {
  const { id } = await params;
  const { t, locale } = await traduzione();
  const parametri = await searchParams;
  const cerca = parametro(parametri.q).toLowerCase();
  const tipologia = parametro(parametri.tipologia);
  const luogo = parametro(parametri.luogo);
  const annata = parametro(parametri.annata); // un anno, oppure "senza" per i vini senza annata
  const tutte = parametro(parametri.tutte) === "1"; // comprese quelle finite (quantità 0)
  const pagina = Math.max(1, Number(parametro(parametri.pagina)) || 1);

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cantina } = await supabase
    .from("cantine")
    .select("id, nome, luoghi(id, nome)")
    .eq("id", id)
    .maybeSingle();
  if (!cantina) notFound();
  const luoghi = ((cantina.luoghi ?? []) as { id: string; nome: string }[]).sort((a, b) =>
    a.nome.localeCompare(b.nome, "it"),
  );

  // Una cantina ha qualche centinaio di etichette: si leggono tutte e si filtra qui,
  // così ricerca e filtri per luogo restano semplici.
  const { data, error } = await supabase
    .from("vini")
    .select(
      "id, cantina_id, nome_fantasia, denominazione, annata, produttore, tipologia, alcool, capacita_cl, vitigni, foto_fronte, foto_retro, stato, giacenze(id, quantita, posizioni(id, codice, luoghi(id, nome)))",
    )
    .eq("cantina_id", id)
    .order("produttore", { nullsFirst: false })
    .order("nome_fantasia", { nullsFirst: false })
    .order("annata", { nullsFirst: false })
    .limit(2000);
  const vini = (data ?? []) as unknown as Vino[];

  // Ultimo prezzo valido di ogni vino (vista "vini_valore").
  const { data: valori } = await supabase.from("vini_valore").select("vino_id, ultimo_prezzo").eq("cantina_id", id);
  const prezzi = new Map<string, number>();
  for (const r of valori ?? []) if (r.ultimo_prezzo !== null) prezzi.set(r.vino_id, Number(r.ultimo_prezzo));
  const euro = (n: number) =>
    n.toLocaleString(locale, { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });

  const annateDisponibili = [...new Set(vini.map((v) => v.annata).filter((a): a is number => a !== null))].sort(
    (a, b) => b - a,
  );

  const filtrati = vini.filter((v) => {
    if (!tutte && bottiglieTotali(v) === 0) return false;
    if (tipologia === "nessuna" ? v.tipologia !== null : tipologia && v.tipologia !== tipologia) return false;
    if (annata === "senza" ? v.annata !== null : annata && String(v.annata) !== annata) return false;
    if (luogo && !(v.giacenze ?? []).some((g) => g.quantita > 0 && g.posizioni?.luoghi?.id === luogo))
      return false;
    if (cerca) {
      const posizioni = (v.giacenze ?? []).map((g) => g.posizioni?.codice ?? "").join(" ");
      const pagliaio = [v.nome_fantasia, v.denominazione, v.produttore, v.annata, v.tipologia, posizioni]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!cerca.split(/\s+/).every((parola) => pagliaio.includes(parola))) return false;
    }
    return true;
  });

  const totaleBottiglie = filtrati.reduce((s, v) => s + bottiglieTotali(v), 0);
  const totaleValore = filtrati.reduce((s, v) => s + bottiglieTotali(v) * (prezzi.get(v.id) ?? 0), 0);
  const pagine = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const visibili = filtrati.slice((Math.min(pagina, pagine) - 1) * PER_PAGINA, Math.min(pagina, pagine) * PER_PAGINA);

  // Miniature: l'archivio è privato, servono indirizzi firmati a tempo.
  const percorsi = visibili.filter((v) => v.foto_fronte).map((v) => percorsoMini(v.foto_fronte!));
  const miniature = new Map<string, string>();
  if (percorsi.length > 0) {
    const { data: firmati } = await supabase.storage.from(BUCKET_ETICHETTE).createSignedUrls(percorsi, 3600);
    for (const f of firmati ?? []) if (f.path && f.signedUrl) miniature.set(f.path, f.signedUrl);
  }

  const collegamentoPagina = (n: number) => {
    const q = new URLSearchParams();
    if (cerca) q.set("q", cerca);
    if (tipologia) q.set("tipologia", tipologia);
    if (luogo) q.set("luogo", luogo);
    if (annata) q.set("annata", annata);
    if (tutte) q.set("tutte", "1");
    if (n > 1) q.set("pagina", String(n));
    const coda = q.toString();
    return `/cantine/${cantina.id}${coda ? `?${coda}` : ""}`;
  };

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-vino underline">
            ‹ {t("Tutte le cantine")}
          </Link>
          <span className="flex gap-4">
            <Link href={`/cantine/${cantina.id}/riepilogo`} className="text-sm text-vino underline">
              {t("Riepilogo")}
            </Link>
            <Link href={`/cantine/${cantina.id}/luoghi`} className="text-sm text-vino underline">
              {t("Luoghi")}
            </Link>
            <Link href={`/cantine/${cantina.id}/impostazioni`} className="text-sm text-vino underline">
              {t("Impostazioni")}
            </Link>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{t("Cantina {nome}", { nome: cantina.nome })}</h1>
          <LinkInserimento cantinaId={cantina.id} className="pulsante flex items-center">
            {t("+ Bottiglia")}
          </LinkInserimento>
        </div>

        <LeggiCoda ids={vini.filter((v) => (v.stato === "in_coda" || v.stato === "da_analizzare") && (v.foto_fronte || v.foto_retro)).map((v) => v.id)} />

        {parametro(parametri.fatto) === "vino_cancellato" && (
          <p className="rounded-xl bg-ambra/15 p-3 text-sm">{t("Vino eliminato.")}</p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
            {t("Non riesco a leggere i vini ({errore}).", { errore: error.message })}
          </p>
        )}

        <form method="get" className="scheda flex flex-col gap-3">
          <input
            name="q"
            defaultValue={parametro(parametri.q)}
            className="campo"
            placeholder={t("Cerca per nome, produttore, annata, posizione…")}
            aria-label={t("Cerca")}
          />
          <div className="grid grid-cols-2 gap-3">
            <select name="tipologia" defaultValue={tipologia} className="campo" aria-label={t("Tipologia")}>
              <option value="">{t("Tutte le tipologie")}</option>
              {TIPOLOGIE.map((tip) => (
                <option key={tip} value={tip}>
                  {nomeTipologia(tip, t)}
                </option>
              ))}
              <option value="nessuna">{t("Senza tipologia")}</option>
            </select>
            <select name="luogo" defaultValue={luogo} className="campo" aria-label={t("Luogo")}>
              <option value="">{t("Tutti i luoghi")}</option>
              {luoghi.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          {/* Annata e casella a fianco; il pulsante va a capo e occupa la riga su telefono: con testi lunghi (altre lingue) non esce più dallo schermo. */}
          <div className="flex flex-wrap items-center gap-3">
            <select name="annata" defaultValue={annata} className="campo w-28 shrink-0" aria-label={t("Annata")}>
              <option value="">{t("Annata")}</option>
              {annateDisponibili.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="senza">{t("Senza")}</option>
            </select>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <input type="checkbox" name="tutte" value="1" defaultChecked={tutte} className="h-5 w-5 shrink-0" />
              {t("Anche le finite")}
            </label>
            <button type="submit" className="pulsante w-full sm:ml-auto sm:w-auto">
              {t("Cerca")}
            </button>
          </div>
        </form>

        <p className="text-sm text-tenue">
          {filtrati.length === 1 ? t("{n} etichetta", { n: filtrati.length }) : t("{n} etichette", { n: filtrati.length })} ·{" "}
          {totaleBottiglie === 1 ? t("{n} bottiglia", { n: totaleBottiglie }) : t("{n} bottiglie", { n: totaleBottiglie })}
          {totaleValore > 0 && ` · ${euro(totaleValore)}`}
        </p>

        {vini.length === 0 && !error && (
          <p className="scheda text-sm text-tenue">
            {t("Questa cantina è ancora vuota. Tocca «+ Bottiglia» per inserire la prima.")}
          </p>
        )}
        {vini.length > 0 && filtrati.length === 0 && (
          <p className="scheda text-sm text-tenue">{t("Nessun vino corrisponde alla ricerca.")}</p>
        )}

        <ul className="flex flex-col gap-3">
          {visibili.map((v) => {
            const mini = v.foto_fronte ? miniature.get(percorsoMini(v.foto_fronte)) : undefined;
            const bottiglie = bottiglieTotali(v);
            const dove = (v.giacenze ?? [])
              .filter((g) => g.quantita > 0 && g.posizioni)
              .map((g) => g.posizioni!.codice)
              .sort(confrontaCodici)
              .join(", ");
            return (
              <li key={v.id}>
                <Link href={`/cantine/${cantina.id}/vini/${v.id}`} className="scheda flex gap-3 p-3">
                  <div className="h-20 w-15 shrink-0 overflow-hidden rounded-lg bg-sfondo">
                    {mini && (
                      // eslint-disable-next-line @next/next/no-img-element -- indirizzo firmato a tempo
                      <img src={mini} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {titoloVino(v, t)}
                      {v.annata ? ` ${v.annata}` : ""}
                    </span>
                    <span className="truncate text-sm text-tenue">
                      {[v.denominazione !== titoloVino(v, t) ? v.denominazione : null, v.produttore]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="mt-auto text-xs text-tenue">
                      {[v.tipologia ? nomeTipologia(v.tipologia, t) : null, dove].filter(Boolean).join(" · ")}
                      {(v.stato === "da_analizzare" || v.stato === "in_coda") && ` · ${t("dati da compilare")}`}
                      {v.stato === "da_confermare" && ` · ${t("etichetta letta, da controllare")}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-center">
                    <span className={`text-2xl font-semibold ${bottiglie === 0 ? "text-tenue" : "text-vino"}`}>
                      {bottiglie}
                    </span>
                    <span className="text-xs text-tenue">{t("bott.")}</span>
                    {prezzi.has(v.id) && <span className="mt-1 text-xs text-tenue">{euro(prezzi.get(v.id)!)}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {pagine > 1 && (
          <nav className="flex items-center justify-between text-sm" aria-label={t("Pagine")}>
            {pagina > 1 ? (
              <Link href={collegamentoPagina(pagina - 1)} className="text-vino underline">
                ‹ {t("Precedenti")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-tenue">
              {t("Pagina {n} di {totale}", { n: Math.min(pagina, pagine), totale: pagine })}
            </span>
            {pagina < pagine ? (
              <Link href={collegamentoPagina(pagina + 1)} className="text-vino underline">
                {t("Successivi")} ›
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>
    </>
  );
}

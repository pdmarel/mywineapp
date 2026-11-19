"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EditorLocale } from "./EditorLocale";
import { Locale3D } from "./Locale3D";
import { useT } from "@/lib/i18n/client";
import { LOCALE_NUOVO, partiDi, validaLocale, type Contenuto, type Locale } from "@/lib/locale";

// La pagina di un luogo, lato browser: la cantina in 3D, il dettaglio della parte toccata,
// le stesse informazioni in tabella (scaffale per scaffale) e il modulo per disegnare o modificare.
// Mentre si modifica, il 3D mostra la bozza: si vede subito che cosa si sta disegnando.

type Props = {
  azione: (formData: FormData) => void | Promise<void>;
  cantinaId: string;
  luogoId: string;
  iniziale: Locale | null;
  /** Per ogni posizione del luogo (per codice): quante bottiglie e quali vini. */
  contenuti: Record<string, Contenuto>;
  /** false finché il database non ha il campo per il disegno: si può provare, non salvare. */
  salvabile: boolean;
};

export function LocaleCantina({ azione, cantinaId, luogoId, iniziale, contenuti, salvabile }: Props) {
  const t = useT();
  const [bozza, setBozza] = useState<Locale>(iniziale ?? LOCALE_NUOVO);
  const [modifica, setModifica] = useState(!iniziale);
  const [scelta, setScelta] = useState<string | null>(null);

  // La bozza può avere campi vuoti mentre si scrive: il disegno usa sempre la versione ripulita.
  const mostrato = useMemo(() => (modifica ? (validaLocale(bozza) ?? LOCALE_NUOVO) : (iniziale ?? LOCALE_NUOVO)), [modifica, bozza, iniziale]);
  const collocate = new Set(partiDi(mostrato));
  const fuori = Object.entries(contenuti)
    .filter(([codice]) => !collocate.has(codice))
    .sort(([a], [b]) => a.localeCompare(b, "it", { numeric: true }));
  const bottiglieFuori = fuori.reduce((n, [, c]) => n + c.bottiglie, 0);
  const dettaglio = scelta ? (contenuti[scelta] ?? { bottiglie: 0, vini: [] }) : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="scheda flex flex-col gap-3">
        <Locale3D locale={mostrato} contenuti={contenuti} scelta={scelta} suScelta={setScelta} />

        {scelta && dettaglio && (
          <div className="flex flex-col gap-2 rounded-xl border border-bordo bg-carta p-3" role="status">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{t("Posizione {codice}", { codice: scelta })}</span>
              <span className="text-sm text-tenue">
                {dettaglio.bottiglie === 1 ? t("{n} bottiglia", { n: dettaglio.bottiglie }) : t("{n} bottiglie", { n: dettaglio.bottiglie })}
              </span>
            </p>
            {dettaglio.vini.length === 0 ? (
              <p className="text-sm text-tenue">{t("Qui non ci sono bottiglie.")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {dettaglio.vini.map((v) => (
                  <li key={v.id}>
                    <Link href={`/cantine/${cantinaId}/vini/${v.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-sfondo px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">
                          {v.titolo}
                          {v.annata ? ` ${v.annata}` : ""}
                        </span>
                        {/* Il produttore sotto il nome; se il titolo è già il produttore (vino senza altri dati) non si ripete. */}
                        {v.produttore && v.produttore !== v.titolo && <span className="block truncate text-xs text-tenue">{v.produttore}</span>}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-vino">× {v.quantita}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="self-start text-sm text-vino underline" onClick={() => setScelta(null)}>
              {t("Chiudi")}
            </button>
          </div>
        )}
      </section>

      {mostrato.scaffali.map((s) => {
        const totale = s.piani.reduce((n, p) => n + p.parti.reduce((m, nome) => m + (contenuti[nome]?.bottiglie ?? 0), 0), 0);
        return (
          <section key={s.id} className="scheda flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between gap-3 text-lg font-medium">
              <span>{t("Scaffale {nome}", { nome: s.nome })}</span>
              <span className="text-sm font-normal text-tenue">
                {totale === 1 ? t("{n} bottiglia", { n: totale }) : t("{n} bottiglie", { n: totale })} · {s.larghezza}×{s.altezza}×{s.profondita} cm
              </span>
            </h2>
            <div className="flex flex-col gap-1">
              {s.piani.map((p, k) => (
                <div key={k} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${p.parti.length}, minmax(0, 1fr))` }}>
                  {p.parti.map((nome, j) => {
                    const bottiglie = contenuti[nome]?.bottiglie ?? 0;
                    return (
                      <button
                        key={j}
                        type="button"
                        disabled={!nome}
                        onClick={() => setScelta(nome)}
                        aria-pressed={Boolean(nome) && nome === scelta}
                        className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-sm ${nome && nome === scelta ? "border-inchiostro bg-ambra/20" : "border-bordo bg-sfondo"}`}
                      >
                        <span className="truncate text-tenue">{nome || t("senza nome")}</span>
                        <span className={`tabular-nums ${bottiglie > 0 ? "font-semibold text-vino" : "text-tenue"}`}>{bottiglie}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {mostrato.oggetti.map((o) => {
        const bottiglie = o.parte ? (contenuti[o.parte]?.bottiglie ?? 0) : 0;
        return (
          <section key={o.id} className="scheda flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between gap-3 text-lg font-medium">
              <span>{o.nome}</span>
              <span className="text-sm font-normal text-tenue">
                {o.larghezza}×{o.altezza}×{o.profondita} cm
              </span>
            </h2>
            <p className="text-xs text-tenue">
              {t("Dalla parete sinistra {x} cm · dall'ingresso {y} cm", { x: o.x, y: o.y })}
              {o.z > 0 ? ` · ${t("da terra {z} cm", { z: o.z })}` : ""}
            </p>
            {o.parte && (
              <button
                type="button"
                onClick={() => setScelta(o.parte)}
                aria-pressed={o.parte === scelta}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-sm ${o.parte === scelta ? "border-inchiostro bg-ambra/20" : "border-bordo bg-sfondo"}`}
              >
                <span className="truncate text-tenue">{o.parte}</span>
                <span className={`tabular-nums ${bottiglie > 0 ? "font-semibold text-vino" : "text-tenue"}`}>{bottiglie}</span>
              </button>
            )}
          </section>
        );
      })}

      {fuori.length > 0 && (
        <section className="scheda flex flex-col gap-2">
          <h2 className="text-lg font-medium">{t("Posizioni non ancora nel disegno")}</h2>
          <p className="text-sm text-tenue">
            {bottiglieFuori === 1
              ? t("{n} bottiglia sta in posizioni che il disegno non mostra. Per farle comparire, dai il loro nome a una parte di uno scaffale.", { n: bottiglieFuori })
              : t("{n} bottiglie stanno in posizioni che il disegno non mostra. Per farle comparire, dai il loro nome a una parte di uno scaffale.", { n: bottiglieFuori })}
          </p>
          <ul className="flex flex-wrap gap-2">
            {fuori.map(([codice, c]) => (
              <li key={codice}>
                <button
                  type="button"
                  onClick={() => setScelta(codice)}
                  className="rounded-lg border border-bordo bg-sfondo px-3 py-1.5 text-sm"
                >
                  {codice} <span className="tabular-nums text-tenue">· {c.bottiglie}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modifica ? (
        <form action={azione} className="scheda flex flex-col gap-4">
          <h2 className="text-lg font-medium">{iniziale ? t("Modifica il disegno") : t("Disegna il locale")}</h2>
          <input type="hidden" name="cantina_id" value={cantinaId} />
          <input type="hidden" name="luogo_id" value={luogoId} />
          <input type="hidden" name="locale" value={JSON.stringify(validaLocale(bozza) ?? LOCALE_NUOVO)} />
          <EditorLocale bozza={bozza} suCambio={setBozza} codici={Object.keys(contenuti).sort((a, b) => a.localeCompare(b, "it", { numeric: true }))} />
          {!salvabile && (
            <p role="alert" className="rounded-xl bg-ambra/20 p-3 text-sm">
              {t("Puoi provare il disegno, ma per salvarlo manca ancora un passaggio nel database (il file 0003_locale.sql da eseguire in Supabase).")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="pulsante" disabled={!salvabile}>
              {t("Salva il disegno")}
            </button>
            {iniziale && (
              <button
                type="button"
                className="rounded-xl border border-bordo bg-carta px-4 text-sm"
                onClick={() => {
                  setBozza(iniziale);
                  setModifica(false);
                }}
              >
                {t("Annulla")}
              </button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" className="rounded-xl border border-bordo bg-carta px-4 py-3 text-sm font-medium" onClick={() => setModifica(true)}>
          {t("Modifica locale e scaffali")}
        </button>
      )}
    </div>
  );
}

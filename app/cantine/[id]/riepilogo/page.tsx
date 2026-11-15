import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Testata } from "@/components/Testata";
import type { Traduttore } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import { nomeTipologia } from "@/lib/vini";

// Riepilogo della cantina: totali, tre grafici e le due tabelle che nel vecchio foglio erano le pivot
// "valore" e "annate". Ogni barra e ogni riga porta all'elenco dei vini già filtrato.
// Bottiglie e valore sono calcolati posizione per posizione: lo stesso vino può stare in due luoghi.
//
// Grafici: una sola serie per grafico (le bottiglie), quindi un solo colore e nessuna legenda;
// i numeri sono scritti accanto alle barre e le tabelle sotto riportano gli stessi dati per esteso.

type Riga = { etichette: Set<string>; bottiglie: number; conPrezzo: Set<string>; valore: number; href: string };

type VinoRiepilogo = {
  id: string;
  annata: number | null;
  tipologia: string | null;
  giacenze: { quantita: number; posizioni: { luoghi: { id: string; nome: string } | null } | null }[] | null;
};

type Euro = (n: number) => string;
const SENZA_TIPOLOGIA = "nessuna";
const SENZA_ANNATA = "senza";

function aggiungi(mappa: Map<string, Riga>, chiave: string, href: string, vinoId: string, bottiglie: number, prezzo?: number) {
  let riga = mappa.get(chiave);
  if (!riga) {
    riga = { etichette: new Set(), bottiglie: 0, conPrezzo: new Set(), valore: 0, href };
    mappa.set(chiave, riga);
  }
  riga.etichette.add(vinoId);
  riga.bottiglie += bottiglie;
  if (prezzo !== undefined) {
    riga.conPrezzo.add(vinoId);
    riga.valore += bottiglie * prezzo;
  }
}

/** Barre orizzontali ordinate dalla più lunga: per confrontare categorie (tipologie, luoghi). */
function Barre({ titolo, righe, t, euro }: { titolo: string; righe: [string, Riga][]; t: Traduttore; euro: Euro }) {
  const massimo = Math.max(1, ...righe.map(([, r]) => r.bottiglie));
  return (
    <section className="scheda flex flex-col gap-3">
      <h2 className="text-lg font-medium">{titolo}</h2>
      <ul className="flex flex-col gap-2">
        {righe.map(([nome, r]) => (
          <li key={nome}>
            <Link
              href={r.href}
              title={
                r.conPrezzo.size > 0
                  ? t("{nome}: {bottiglie} bottiglie, {etichette} etichette, {valore}", { nome, bottiglie: r.bottiglie, etichette: r.etichette.size, valore: euro(r.valore) })
                  : t("{nome}: {bottiglie} bottiglie, {etichette} etichette", { nome, bottiglie: r.bottiglie, etichette: r.etichette.size })
              }
              className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 rounded-lg py-1 text-sm hover:bg-sfondo"
            >
              <span className="truncate">{nome}</span>
              <span className="block h-3">
                <span
                  className="block h-3 rounded-r-[4px] bg-vino"
                  style={{ width: `${Math.max(1.5, (r.bottiglie / massimo) * 100)}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{r.bottiglie}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-tenue">{t("Bottiglie. Tocca una barra per vedere i vini.")}</p>
    </section>
  );
}

/** Colonne in ordine di tempo, un anno per colonna (anche quelli vuoti): per vedere come si distribuiscono le annate. */
function Annate({ righe, senzaAnnata, t }: { righe: Map<string, Riga>; senzaAnnata?: Riga; t: Traduttore }) {
  const anni = [...righe.keys()].map(Number).sort((a, b) => a - b);
  if (anni.length === 0) return null;
  const tutti = Array.from({ length: anni[anni.length - 1] - anni[0] + 1 }, (_, i) => anni[0] + i);
  const massimo = Math.max(1, ...[...righe.values()].map((r) => r.bottiglie));
  const picco = [...righe.entries()].sort((a, b) => b[1].bottiglie - a[1].bottiglie)[0];

  return (
    <section className="scheda flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t("Bottiglie per annata")}</h2>
      <div className="flex flex-col gap-1">
        <div className="flex h-36 items-end gap-[2px] border-b border-bordo">
          {tutti.map((anno) => {
            const r = righe.get(String(anno));
            return r ? (
              <Link
                key={anno}
                href={r.href}
                title={t("{nome}: {bottiglie} bottiglie, {etichette} etichette", { nome: anno, bottiglie: r.bottiglie, etichette: r.etichette.size })}
                aria-label={t("{nome}: {bottiglie} bottiglie", { nome: anno, bottiglie: r.bottiglie })}
                className="min-w-[3px] flex-1 rounded-t-[4px] bg-vino hover:bg-vino-scuro"
                style={{ height: `${Math.max(3, (r.bottiglie / massimo) * 100)}%` }}
              />
            ) : (
              <span key={anno} className="min-w-[3px] flex-1" />
            );
          })}
        </div>
        <div className="flex gap-[2px] text-[10px] text-tenue" aria-hidden="true">
          {tutti.map((anno, i) => (
            <span key={anno} className="min-w-[3px] flex-1 overflow-visible whitespace-nowrap">
              {i === 0 || anno % 5 === 0 ? anno : ""}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-tenue">
        {t("Dal {inizio} al {fine}.", { inizio: tutti[0], fine: tutti[tutti.length - 1] })}{" "}
        {t("L'annata più presente è la {anno} con {n} bottiglie.", { anno: picco[0], n: picco[1].bottiglie })}{" "}
        {t("Tocca una colonna per vedere i vini.")}
        {senzaAnnata && (
          <>
            {" "}
            <Link href={senzaAnnata.href} className="text-vino underline">
              {senzaAnnata.bottiglie === 1
                ? t("{n} bottiglia senza annata", { n: senzaAnnata.bottiglie })
                : t("{n} bottiglie senza annata", { n: senzaAnnata.bottiglie })}
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}

function Tabella({ titolo, intestazione, righe, t, euro }: { titolo: string; intestazione: string; righe: [string, Riga][]; t: Traduttore; euro: Euro }) {
  return (
    <section className="scheda flex flex-col gap-3">
      <h2 className="text-lg font-medium">{titolo}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bordo text-left text-xs text-tenue">
              <th className="py-2 pr-2 font-medium">{intestazione}</th>
              <th className="px-2 py-2 text-right font-medium">{t("Etichette")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("Bottiglie")}</th>
              <th className="py-2 pl-2 text-right font-medium">{t("Valore")}</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(([nome, r]) => (
              <tr key={nome} className="border-b border-bordo last:border-0">
                <td className="py-2 pr-2">
                  <Link href={r.href} className="text-vino underline">
                    {nome}
                  </Link>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.etichette.size}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.bottiglie}</td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  {r.conPrezzo.size > 0 ? euro(r.valore) : "—"}
                  {r.conPrezzo.size > 0 && r.conPrezzo.size < r.etichette.size && (
                    <span className="block text-xs text-tenue">
                      {t("su {n} di {totale}", { n: r.conPrezzo.size, totale: r.etichette.size })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PaginaRiepilogo({ params }: PageProps<"/cantine/[id]/riepilogo">) {
  const { id } = await params;
  const { t, locale } = await traduzione();
  const euro: Euro = (n) => n.toLocaleString(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const etichettaSenzaAnnata = t("Senza annata");
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cantina } = await supabase.from("cantine").select("id, nome").eq("id", id).maybeSingle();
  if (!cantina) notFound();

  const [{ data: righeVini }, { data: valori }] = await Promise.all([
    supabase
      .from("vini")
      .select("id, annata, tipologia, giacenze(quantita, posizioni(luoghi(id, nome)))")
      .eq("cantina_id", id)
      .limit(5000),
    supabase.from("vini_valore").select("vino_id, ultimo_prezzo").eq("cantina_id", id),
  ]);
  const vini = (righeVini ?? []) as unknown as VinoRiepilogo[];
  const prezzi = new Map<string, number>();
  for (const r of valori ?? []) if (r.ultimo_prezzo !== null) prezzi.set(r.vino_id, Number(r.ultimo_prezzo));

  const elenco = `/cantine/${cantina.id}`;
  const filtro = (p: Record<string, string>) => `${elenco}?${new URLSearchParams(p).toString()}`;

  const totale = new Map<string, Riga>();
  const perTipologia = new Map<string, Riga>();
  const perLuogo = new Map<string, Riga>();
  const perLuogoTipologia = new Map<string, Riga>();
  const perAnnata = new Map<string, Riga>();
  const senzaAnnata = new Map<string, Riga>();

  for (const v of vini) {
    for (const g of v.giacenze ?? []) {
      if (g.quantita <= 0) continue; // il riepilogo conta ciò che c'è, non lo storico
      const prezzo = prezzi.get(v.id);
      const luogo = g.posizioni?.luoghi;
      const tipologia = v.tipologia ? nomeTipologia(v.tipologia, t) : t("Senza tipologia");
      const parTipologia = v.tipologia ?? SENZA_TIPOLOGIA;

      aggiungi(totale, "tutto", elenco, v.id, g.quantita, prezzo);
      aggiungi(perTipologia, tipologia, filtro({ tipologia: parTipologia }), v.id, g.quantita, prezzo);
      if (luogo) {
        aggiungi(perLuogo, luogo.nome, filtro({ luogo: luogo.id }), v.id, g.quantita, prezzo);
        aggiungi(
          perLuogoTipologia,
          `${luogo.nome} · ${tipologia}`,
          filtro({ luogo: luogo.id, tipologia: parTipologia }),
          v.id,
          g.quantita,
          prezzo,
        );
      }
      if (v.annata) aggiungi(perAnnata, String(v.annata), filtro({ annata: String(v.annata) }), v.id, g.quantita, prezzo);
      else aggiungi(senzaAnnata, etichettaSenzaAnnata, filtro({ annata: SENZA_ANNATA }), v.id, g.quantita, prezzo);
    }
  }

  const tutto = totale.get("tutto");
  const alfabetico = (m: Map<string, Riga>) =>
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "it", { numeric: true }));
  const perGrandezza = (m: Map<string, Riga>) => [...m.entries()].sort((a, b) => b[1].bottiglie - a[1].bottiglie);
  const senzaPrezzo = tutto ? tutto.etichette.size - tutto.conPrezzo.size : 0;

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link href={elenco} className="text-sm text-vino underline">
          ‹ {t("Cantina {nome}", { nome: cantina.nome })}
        </Link>
        <h1 className="text-xl font-semibold">{t("Riepilogo")}</h1>

        <section className="grid grid-cols-3 gap-3">
          <div className="scheda p-3 text-center">
            <span className="block text-2xl font-semibold text-vino">{tutto?.etichette.size ?? 0}</span>
            <span className="text-xs text-tenue">{t("etichette")}</span>
          </div>
          <div className="scheda p-3 text-center">
            <span className="block text-2xl font-semibold text-vino">{tutto?.bottiglie ?? 0}</span>
            <span className="text-xs text-tenue">{t("bottiglie")}</span>
          </div>
          <div className="scheda p-3 text-center">
            <span className="block text-2xl font-semibold text-vino">
              {tutto && tutto.conPrezzo.size > 0 ? euro(tutto.valore) : "—"}
            </span>
            <span className="text-xs text-tenue">{t("valore")}</span>
          </div>
        </section>

        {!tutto ? (
          <p className="scheda text-sm text-tenue">{t("Nessuna bottiglia in cantina.")}</p>
        ) : (
          <>
            {senzaPrezzo > 0 && (
              <p className="rounded-xl bg-ambra/15 p-3 text-sm">
                <strong>{t("Il valore è parziale.")}</strong>{" "}
                {senzaPrezzo === 1
                  ? t("{n} etichetta non ha ancora un prezzo.", { n: senzaPrezzo })
                  : t("{n} etichette non hanno ancora un prezzo.", { n: senzaPrezzo })}{" "}
                {t("Alcuni prezzi possono riferirsi a un'annata diversa: il dettaglio è nella scheda di ogni vino.")}
              </p>
            )}

            <Barre titolo={t("Bottiglie per tipologia")} righe={perGrandezza(perTipologia)} t={t} euro={euro} />
            {perLuogo.size > 1 && <Barre titolo={t("Bottiglie per luogo")} righe={perGrandezza(perLuogo)} t={t} euro={euro} />}
            <Annate righe={perAnnata} senzaAnnata={senzaAnnata.get(etichettaSenzaAnnata)} t={t} />

            <Tabella titolo={t("Per luogo e tipologia")} intestazione={t("Luogo · tipologia")} righe={alfabetico(perLuogoTipologia)} t={t} euro={euro} />
            <Tabella
              titolo={t("Per annata")}
              intestazione={t("Annata")}
              righe={[...alfabetico(perAnnata), ...senzaAnnata.entries()]}
              t={t}
              euro={euro}
            />
          </>
        )}
      </main>
    </>
  );
}

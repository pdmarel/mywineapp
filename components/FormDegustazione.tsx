"use client";

import { useState } from "react";
import { EditorSpazio } from "./EditorSpazio";
import { FotoEtichetta } from "./FotoEtichetta";
import { Mappa3D } from "./Mappa3D";
import { RegistraVocale, type ProposteDaVocale } from "./RegistraVocale";
import {
  ANDAMENTI,
  CODA_PREDEFINITA,
  FASI,
  GRUPPI,
  INTENSITA_MASSIMA,
  SENSAZIONI,
  applicaAndamento,
  idSpecifico,
  nomeCurva,
  sensazione,
  vociSpecifiche,
  type Curva,
  type Dinamica,
} from "@/lib/degustazione";
import { useT } from "@/lib/i18n/client";
import { minuscolo } from "@/lib/i18n/lingue";
import type { Punto, Spazio } from "@/lib/spazio";

// Il modulo della degustazione. Tre modi di compilarla, che si sommano:
//   - a voce: si detta, e la proposta riempie la mappa della dinamica di bocca;
//   - nello spazio 3D: profumi (olfatto) e gusti/aromi (bocca) come punti con persistenza, ampiezza, intensità;
//   - nella mappa della dinamica: per ogni sensazione un andamento dall'attacco alla persistenza.
// Nella mappa una famiglia aromatica si può lasciare generica ("Floreale") oppure dettagliare con uno o più
// aromi specifici ("Gelsomino", "Viola"), ognuno con i suoi parametri.
// Il vino può essere uno della cantina oppure uno assaggiato altrove ("libero"): in quel caso bastano le foto
// dell'etichetta (fronte e retro); nome, produttore, annata e luogo sono tutti facoltativi.

type Props = {
  azione: (formData: FormData) => void | Promise<void>;
  cantinaId: string;
  /** Presente se si degusta un vino della cantina. */
  vinoId?: string;
  /** Nome del vino della cantina, per aiutare il riconoscitore vocale. */
  vino?: string;
};

const oggi = () => new Date().toISOString().slice(0, 10);

export function FormDegustazione({ azione, cantinaId, vinoId, vino }: Props) {
  const t = useT();
  const [curve, setCurve] = useState<Curva[]>([]);
  const [aperta, setAperta] = useState<string | null>(null);
  const [olfatto, setOlfatto] = useState<Punto[]>([]);
  const [bocca, setBocca] = useState<Punto[]>([]);
  const [descrittori, setDescrittori] = useState("");
  const [note, setNote] = useState("");
  const [punteggio, setPunteggio] = useState("");
  const [vocale, setVocale] = useState<{ audio: string | null; trascrizione: string } | null>(null);
  const [libero, setLibero] = useState({ vino: "", produttore: "", annata: "", evento: "" });
  const [nuovoAroma, setNuovoAroma] = useState<Record<string, string>>({});
  // Cartella delle foto di questa degustazione nell'archivio: {cantina}/{cartella}/fronte.jpg e retro.jpg.
  const [cartellaFoto] = useState(() => crypto.randomUUID());
  const [caricamenti, setCaricamenti] = useState(0);
  const occupato = (si: boolean) => setCaricamenti((n) => Math.max(0, n + (si ? 1 : -1)));

  const spazio: Spazio = { olfatto, bocca };
  const nomeVino = vinoId ? vino : [libero.vino, libero.produttore, libero.annata].filter(Boolean).join(", ");

  const curva = (id: string) => curve.find((c) => c.id === id);
  const metti = (nuova: Curva) =>
    setCurve((prima) => (prima.some((c) => c.id === nuova.id) ? prima.map((c) => (c.id === nuova.id ? nuova : c)) : [...prima, nuova]));
  const togli = (id: string) => setCurve((prima) => prima.filter((c) => c.id !== id));

  function attiva(id: string) {
    if (!curva(id)) {
      metti({ id, valori: applicaAndamento(ANDAMENTI[0].forma, 3), coda: ANDAMENTI[0].coda, origine: "dichiarato" });
    }
    setAperta(aperta === id ? null : id);
  }

  function aggiungiSpecifico(famiglia: string) {
    const voce = (nuovoAroma[famiglia] ?? "").trim();
    if (!voce) return;
    const id = idSpecifico(famiglia, voce);
    if (!curva(id)) {
      // Parte dai valori della famiglia generica, se c'è: di solito l'aroma specifico le somiglia.
      const base = curva(famiglia);
      metti({
        id,
        valori: base ? [...base.valori] : applicaAndamento(ANDAMENTI[0].forma, 3),
        coda: base?.coda ?? ANDAMENTI[0].coda,
        origine: "dichiarato",
      });
    }
    setAperta(id);
    setNuovoAroma((prima) => ({ ...prima, [famiglia]: "" }));
  }

  // La proposta del vocale riempie il modulo senza cancellare ciò che è già stato scritto a mano.
  function daVocale(p: ProposteDaVocale) {
    setVocale({ audio: p.audio, trascrizione: p.trascrizione });
    if (p.dinamica) {
      const nuove = p.dinamica.curve;
      setCurve((prima) => [...prima.filter((c) => !nuove.some((n) => n.id === c.id)), ...nuove]);
    }
    if (p.descrittori?.length) {
      setDescrittori((prima) => [prima, p.descrittori!.join(", ")].filter(Boolean).join(", "));
    }
    // Se le curve non sono arrivate, almeno il parlato finisce negli appunti.
    const testo = p.dinamica ? p.note : p.trascrizione;
    if (testo) setNote((prima) => [prima, testo].filter(Boolean).join("\n"));
    if (p.punteggio) setPunteggio(String(p.punteggio));
  }

  // Ordine fisso delle fasce: quello dell'elenco delle sensazioni; dentro una famiglia, prima la generica.
  const posto = (id: string) => SENSAZIONI.findIndex((s) => s.id === id.split(":")[0]);
  const dinamica: Dinamica = {
    versione: 1,
    curve: [...curve].sort((a, b) => posto(a.id) - posto(b.id) || a.id.localeCompare(b.id, "it")),
  };

  /** Una riga della mappa: il nome, i valori in breve e, se aperta, i comandi per regolarla. */
  function riga(id: string, rientro = false) {
    const c = curva(id);
    const massimo = c ? Math.max(...c.valori) : 0;
    return (
      <li key={id} className={`rounded-xl bg-sfondo ${rientro ? "ml-4" : ""}`}>
        <button
          type="button"
          onClick={() => attiva(id)}
          aria-expanded={aperta === id}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left"
        >
          <span className={c ? "font-medium" : "text-tenue"}>{nomeCurva(id, t)}</span>
          <span className="text-sm text-tenue">
            {c ? `${c.valori.join(" · ")}${c.origine === "stimato" ? ` ${t("(stimato)")}` : ""}` : t("+ valuta")}
          </span>
        </button>

        {c && aperta === id && (
          <div className="flex flex-col gap-3 px-3 pb-3">
            {c.citazione && <p className="rounded-lg bg-carta px-2 py-1 text-xs text-tenue">{t("Dal vocale: «{citazione}»", { citazione: c.citazione })}</p>}
            <div className="flex flex-wrap gap-2">
              {ANDAMENTI.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="rounded-lg border border-bordo bg-carta px-3 py-2 text-sm"
                  onClick={() => metti({ ...c, valori: applicaAndamento(a.forma, massimo || 3), coda: a.coda, origine: "dichiarato" })}
                >
                  {t(a.nome)}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between">
                <span>{t("Intensità massima")}</span>
                <span className="tabular-nums">{massimo}</span>
              </span>
              <input
                type="range"
                min={0.5}
                max={INTENSITA_MASSIMA}
                step={0.5}
                value={massimo || 0.5}
                onChange={(e) => {
                  // Scala l'andamento attuale mantenendone la forma.
                  const nuovo = Number(e.target.value);
                  const base = massimo || 1;
                  metti({
                    ...c,
                    valori: c.valori.map((v) => Math.round((v / base) * nuovo * 2) / 2) as Curva["valori"],
                    origine: "dichiarato",
                  });
                }}
              />
            </label>

            <div className="grid grid-cols-4 gap-2">
              {FASI.map((f, i) => (
                <label key={f.id} className="flex flex-col items-center gap-1 text-xs">
                  <span className="text-center text-tenue">{t(f.nome)}</span>
                  <select
                    value={c.valori[i]}
                    className="campo min-h-10 px-1 text-center"
                    onChange={(e) => {
                      const valori = [...c.valori] as Curva["valori"];
                      valori[i] = Number(e.target.value);
                      metti({ ...c, valori, origine: "dichiarato" });
                    }}
                  >
                    {Array.from({ length: INTENSITA_MASSIMA * 2 + 1 }, (_, k) => k / 2).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between">
                <span>{t("Quanto dura dopo (coda)")}</span>
                <span className="tabular-nums">{c.coda} s</span>
              </span>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={c.coda}
                onChange={(e) => metti({ ...c, coda: Number(e.target.value), origine: "dichiarato" })}
              />
            </label>

            <button
              type="button"
              className="self-start text-sm text-vino underline"
              onClick={() => {
                togli(id);
                setAperta(null);
              }}
            >
              {t("Togli {nome}", { nome: minuscolo(nomeCurva(id, t), t.lingua) })}
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <form action={azione} className="flex flex-col gap-4">
      <input type="hidden" name="cantina_id" value={cantinaId} />
      <input type="hidden" name="vino_id" value={vinoId ?? ""} />
      <input type="hidden" name="dinamica" value={JSON.stringify(dinamica)} />
      <input type="hidden" name="spazio" value={JSON.stringify(spazio)} />
      <input type="hidden" name="audio" value={vocale?.audio ?? ""} />
      <input type="hidden" name="trascrizione" value={vocale?.trascrizione ?? ""} />

      {!vinoId && (
        <section className="scheda flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-medium">{t("Che vino è")}</h2>
            <p className="text-sm text-tenue">{t("Bastano le foto dell'etichetta: il resto è facoltativo.")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FotoEtichetta cantinaId={cantinaId} vinoId={cartellaFoto} lato="fronte" nomeCampo="foto_fronte" suOccupato={occupato} />
            <FotoEtichetta cantinaId={cantinaId} vinoId={cartellaFoto} lato="retro" nomeCampo="foto_retro" suOccupato={occupato} />
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("Vino (facoltativo)")}
            <input
              name="vino_libero"
              value={libero.vino}
              onChange={(e) => setLibero({ ...libero, vino: e.target.value })}
              className="campo"
              placeholder={t("es. Barbaresco Rabajà")}
              maxLength={120}
            />
          </label>
          <div className="grid grid-cols-[1fr_6rem] items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("Produttore (facoltativo)")}
              <input
                name="produttore_libero"
                value={libero.produttore}
                onChange={(e) => setLibero({ ...libero, produttore: e.target.value })}
                className="campo"
                maxLength={120}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("Annata")}
              <input
                name="annata_libera"
                placeholder={t("facolt.")}
                inputMode="numeric"
                value={libero.annata}
                onChange={(e) => setLibero({ ...libero, annata: e.target.value })}
                className="campo"
                maxLength={4}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("Dove lo assaggi (manifestazione, ristorante, enoteca…)")}
            <input
              name="evento"
              value={libero.evento}
              onChange={(e) => setLibero({ ...libero, evento: e.target.value })}
              className="campo"
              placeholder={t("es. Enoteca Rossi")}
              maxLength={120}
            />
          </label>
        </section>
      )}

      <RegistraVocale cantinaId={cantinaId} vinoId={vinoId} vino={nomeVino} suRisultato={daVocale} />

      {vocale && (
        <section className="scheda flex flex-col gap-2">
          <h2 className="text-lg font-medium">{t("Cosa ho capito dal vocale")}</h2>
          <p className="rounded-xl bg-ambra/15 p-3 text-sm">
            {t("È una proposta: controlla le sensazioni qui sotto (accanto a ognuna trovi le tue parole), correggi ciò che non torna e salva. Le voci segnate «stimato» le ho dedotte io da un giudizio generale.")}
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-vino underline">{t("Leggi la trascrizione")}</summary>
            <p className="mt-2 whitespace-pre-wrap text-tenue">{vocale.trascrizione}</p>
          </details>
        </section>
      )}

      <section className="scheda flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">{t("I profumi nello spazio")}</h2>
          <p className="text-sm text-tenue">
            {t("Ogni profumo è un punto: quanto dura (persistenza), quanto è largo (ampiezza), quanto è forte (intensità). Aggiungili nell'ordine in cui li senti.")}
          </p>
        </div>
        <EditorSpazio parte="olfatto" punti={olfatto} suCambio={setOlfatto} vino={nomeVino} />
      </section>

      <section className="scheda flex flex-col gap-3">
        <details open={bocca.length > 0}>
          <summary className="cursor-pointer text-lg font-medium">{t("Gusti e aromi di bocca nello spazio")}</summary>
          <p className="my-2 text-sm text-tenue">
            {t("Lo stesso spazio per la bocca: gusti, sensazioni tattili e aromi, uno dopo l'altro.")}
          </p>
          <EditorSpazio parte="bocca" punti={bocca} suCambio={setBocca} vino={nomeVino} />
        </details>
      </section>

      <section className="scheda flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">{t("Mappa della dinamica di bocca")}</h2>
          <p className="text-sm text-tenue">{t("Come si muove ogni sensazione dall'attacco alla persistenza.")}</p>
        </div>
        <Mappa3D dinamica={dinamica} altezza={320} />
      </section>

      {GRUPPI.map((g) => (
        <section key={g.id} className="scheda flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: g.colore }} />
            {t(g.nome)}
          </h2>
          {g.id === "aroma" && (
            <p className="text-sm text-tenue">
              {t("Puoi restare sulla famiglia («Floreale») oppure aggiungere gli aromi specifici che riconosci, ognuno con i suoi valori.")}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {SENSAZIONI.filter((s) => s.gruppo === g.id).flatMap((s) => {
              const specifiche = curve.filter((c) => c.id.startsWith(`${s.id}:`)).sort((a, b) => a.id.localeCompare(b.id, "it"));
              const righe = [riga(s.id), ...specifiche.map((c) => riga(c.id, true))];
              if (g.id === "aroma" && (aperta === s.id || specifiche.some((c) => c.id === aperta) || specifiche.length > 0)) {
                const elenco = `voci-${s.id}`;
                righe.push(
                  <li key={`${s.id}-nuovo`} className="ml-4 flex gap-2">
                    <input
                      list={elenco}
                      value={nuovoAroma[s.id] ?? ""}
                      onChange={(e) => setNuovoAroma((prima) => ({ ...prima, [s.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault(); // non deve salvare tutta la degustazione
                          aggiungiSpecifico(s.id);
                        }
                      }}
                      className="campo min-h-10"
                      placeholder={t("aroma specifico ({famiglia})", { famiglia: minuscolo(t(s.nome), t.lingua) })}
                      aria-label={t("Aroma specifico della famiglia {famiglia}", { famiglia: t(s.nome) })}
                      maxLength={40}
                    />
                    <datalist id={elenco}>
                      {vociSpecifiche(s.id).map((v) => (
                        <option key={v} value={v} label={t(v)} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      className="rounded-xl border border-bordo bg-carta px-3 text-sm"
                      onClick={() => aggiungiSpecifico(s.id)}
                      disabled={!(nuovoAroma[s.id] ?? "").trim()}
                    >
                      {t("Aggiungi")}
                    </button>
                  </li>,
                );
              }
              return righe;
            })}
          </ul>
        </section>
      ))}

      <section className="scheda flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("Note")}</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Descrittori (profumi e aromi riconosciuti)")}
          <input
            name="descrittori"
            value={descrittori}
            onChange={(e) => setDescrittori(e.target.value)}
            className="campo"
            placeholder={t("es. ciliegia sotto spirito, liquirizia, tabacco")}
            maxLength={400}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Appunti liberi")}
          <textarea
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="campo min-h-24 py-2"
            placeholder={t("Esame visivo, olfattivo, abbinamenti, impressioni…")}
            maxLength={4000}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("Data")}
            <input name="degustato_il" type="date" defaultValue={oggi()} className="campo" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("Punteggio (facoltativo)")}
            <input
              name="punteggio"
              inputMode="decimal"
              value={punteggio}
              onChange={(e) => setPunteggio(e.target.value)}
              className="campo"
              placeholder={t("es. 88")}
            />
          </label>
        </div>
      </section>

      <button type="submit" className="pulsante" disabled={caricamenti > 0}>
        {caricamenti > 0 ? t("Carico la foto…") : t("Salva la degustazione")}
      </button>
      <p className="pb-4 text-xs text-tenue">
        {t("Valuta solo ciò che hai sentito: le sensazioni non toccate non compaiono. Coda predefinita {secondi} secondi.", { secondi: CODA_PREDEFINITA })}{" "}
        {sensazione("equilibrio") ? t("Equilibrio e qualità percepita si valutano come le altre, nel tempo.") : ""}
      </p>
    </form>
  );
}

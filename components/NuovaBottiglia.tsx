"use client";

import Link from "next/link";
import { useState } from "react";
import { CampiEtichetta } from "./CampiEtichetta";
import { FotoEtichetta } from "./FotoEtichetta";
import { useT } from "@/lib/i18n/client";
import { inviaSospesi, mettiInCoda, type FotoDaInviare } from "@/lib/sospesi";
import { campiDaModulo, numeroCampo, titoloVino, type PosizioneScelta } from "@/lib/vini";

// Inserimento di una bottiglia nuova, pensato per la cantina: funziona anche senza rete.
// Al salvataggio la bottiglia viene scritta sul telefono e poi spedita; se il segnale manca resta in sospeso
// (lo mostra l'indicatore in alto) e parte da sola più tardi. Dopo ogni salvataggio il modulo si svuota,
// tenendo posizione e tipologia, per inserire in fila le bottiglie dello stesso scaffale.

type Esito = { vinoId: string; titolo: string; inviata: boolean };

function nuovoId(): string {
  return crypto.randomUUID();
}

export function NuovaBottiglia({ cantinaId, posizioni }: { cantinaId: string; posizioni: PosizioneScelta[] }) {
  const t = useT();
  const [vinoId, setVinoId] = useState(nuovoId);
  const [foto, setFoto] = useState<{ fronte?: FotoDaInviare; retro?: FotoDaInviare }>({});
  const [inPreparazione, setInPreparazione] = useState(0);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState<Esito | null>(null);
  const [ricorda, setRicorda] = useState<{ posizioneId: string; tipologia: string }>({
    posizioneId: "",
    tipologia: "",
  });

  const luoghi = Array.from(new Set(posizioni.map((p) => p.luogo)));
  const occupato = (si: boolean) => setInPreparazione((n) => Math.max(0, n + (si ? 1 : -1)));

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvataggio) return;
    const dati = new FormData(e.currentTarget);
    const campi = campiDaModulo(dati);
    const posizioneId = String(dati.get("posizione_id") ?? "");
    const haTesto = campi.nome_fantasia || campi.denominazione || campi.produttore;

    if (!haTesto && !foto.fronte && !foto.retro) {
      setErrore(t("Scatta almeno una foto oppure scrivi nome, denominazione o produttore."));
      return;
    }
    if (!posizioneId) {
      setErrore(t("Scegli la posizione in cui metti la bottiglia."));
      return;
    }

    setErrore("");
    setSalvataggio(true);
    const titolo = haTesto
      ? `${titoloVino(campi, t)}${campi.annata ? ` ${campi.annata}` : ""}`
      : t("Bottiglia con sole foto");
    try {
      // 1. Sul telefono: da qui in poi non si perde.
      await mettiInCoda({
        id: vinoId,
        cantinaId,
        titolo,
        campi,
        posizioneId,
        quantita: Math.max(0, Math.round(numeroCampo(dati, "quantita") ?? 1)),
        foto,
      });
    } catch (err) {
      setSalvataggio(false);
      setErrore(
        t("Non sono riuscito a salvare sul telefono ({errore}). Non chiudere la pagina e riprova.", {
          errore: err instanceof Error ? t(err.message) : t("errore"),
        }),
      );
      return;
    }

    // 2. Il modulo si libera subito, senza aspettare il server: con poco segnale la risposta può farsi
    //    attendere a lungo, e intanto non si potrebbe inserire la bottiglia successiva.
    const salvata = vinoId;
    setEsito({ vinoId: salvata, titolo, inviata: false });
    setRicorda({ posizioneId, tipologia: campi.tipologia ?? "" });
    setFoto({});
    setVinoId(nuovoId()); // cambia la "key" del modulo: campi e foto ripartono vuoti
    setSalvataggio(false);
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 3. L'invio parte in sottofondo. Se non va (rete assente o debole) la bottiglia resta in coda e riparte
    //    da sola: non è un errore. Se arriva, il messaggio diventa «salvata» con il collegamento alla scheda.
    void inviaSospesi()
      .then((invio) => {
        if (invio.rimasti === 0) setEsito((prima) => (prima && prima.vinoId === salvata ? { ...prima, inviata: true } : prima));
      })
      .catch(() => {});
  }

  return (
    <div className="flex flex-col gap-4">
      {esito && (
        <p className="rounded-xl bg-ambra/15 p-3 text-sm" role="status">
          <strong>{esito.titolo}</strong>
          {" · "}
          {esito.inviata ? (
            <>
              {t("Bottiglia salvata.")}{" "}
              <Link href={`/cantine/${cantinaId}/vini/${esito.vinoId}`} className="text-vino underline">
                {t("Apri la scheda")}
              </Link>
            </>
          ) : (
            <>
              {t("Bottiglia salvata sul telefono: parte da sola appena c'è abbastanza segnale. Puoi continuare a inserire.")}
            </>
          )}
        </p>
      )}
      {errore && (
        <p role="alert" className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
          {errore}
        </p>
      )}

      <form key={vinoId} onSubmit={salva} className="scheda flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <FotoEtichetta
            cantinaId={cantinaId}
            vinoId={vinoId}
            lato="fronte"
            nomeCampo="foto_fronte"
            suOccupato={occupato}
            differita={(f) => setFoto((prima) => ({ ...prima, fronte: f }))}
          />
          <FotoEtichetta
            cantinaId={cantinaId}
            vinoId={vinoId}
            lato="retro"
            nomeCampo="foto_retro"
            suOccupato={occupato}
            differita={(f) => setFoto((prima) => ({ ...prima, retro: f }))}
          />
        </div>

        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("Posizione")}
            <select name="posizione_id" defaultValue={ricorda.posizioneId} className="campo">
              <option value="" disabled>
                {t("Scegli…")}
              </option>
              {luoghi.map((luogo) => (
                <optgroup key={luogo} label={luogo}>
                  {posizioni
                    .filter((p) => p.luogo === luogo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codice}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("Bottiglie")}
            <input
              name="quantita"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={1}
              className="campo text-center"
            />
          </label>
        </div>

        <CampiEtichetta predefiniti={{ tipologia: ricorda.tipologia }} />

        <button type="submit" className="pulsante" disabled={inPreparazione > 0 || salvataggio}>
          {inPreparazione > 0 ? t("Preparo le foto…") : salvataggio ? t("Salvo…") : t("Salva la bottiglia")}
        </button>
        <p className="text-xs text-tenue">
          {t("Funziona anche senza rete: la bottiglia resta sul telefono e viene inviata quando torna il segnale. Puoi salvare anche solo con le foto e compilare i dati più tardi.")}
        </p>
      </form>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { PAUSA_SE_SATURO, PAUSA_TRA_LETTURE, aspetta, chiediLettura } from "@/lib/lettura-coda";

// Le etichette fotografate e non ancora lette (servizio saturo al momento dell'inserimento): un pulsante le
// legge adesso, una alla volta con una pausa, così il servizio gratuito non le respinge di nuovo.
// Lavora finché la pagina resta aperta; si può fermare e riprendere.

export function LeggiCoda({ ids }: { ids: string[] }) {
  const t = useT();
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [lette, setLette] = useState(0);
  const [fallite, setFallite] = useState(0);
  const [fatte, setFatte] = useState(0);
  const [saturo, setSaturo] = useState(false);
  const ferma = useRef(false);

  async function leggi() {
    ferma.current = false;
    setInCorso(true);
    setSaturo(false);
    setLette(0);
    setFallite(0);
    setFatte(0);
    for (const id of ids) {
      if (ferma.current) break;
      let esito = await chiediLettura(id, false);
      // Servizio saturo: si aspetta e si riprova due volte, poi ci si ferma (inutile insistere).
      for (let giro = 0; esito === "saturo" && giro < 2 && !ferma.current; giro++) {
        await aspetta(PAUSA_SE_SATURO);
        esito = await chiediLettura(id, false);
      }
      if (esito === "saturo") {
        setSaturo(true);
        break;
      }
      if (esito === "ok") setLette((n) => n + 1);
      else setFallite((n) => n + 1);
      setFatte((n) => n + 1);
      if (!ferma.current) await aspetta(PAUSA_TRA_LETTURE);
    }
    setInCorso(false);
    router.refresh();
  }

  if (ids.length === 0 && !inCorso && fatte === 0) return null;
  return (
    <div className="scheda flex flex-col gap-2" role="status">
      <p className="text-sm">
        {inCorso
          ? t("Leggo le etichette: {fatte} di {totale}. Tieni aperta questa pagina.", { fatte, totale: ids.length })
          : fatte > 0
            ? t("Etichette lette: {lette}. Non riuscite: {fallite}.", { lette, fallite })
            : ids.length === 1
              ? t("{n} etichetta fotografata aspetta ancora di essere letta.", { n: ids.length })
              : t("{n} etichette fotografate aspettano ancora di essere lette.", { n: ids.length })}
      </p>
      {saturo && <p className="text-sm text-vino-scuro">{t("Il servizio gratuito è saturo: mi sono fermato. Riprova tra qualche minuto.")}</p>}
      {inCorso ? (
        <button type="button" className="self-start rounded-xl border border-bordo bg-carta px-4 py-2 text-sm" onClick={() => (ferma.current = true)}>
          {t("Ferma")}
        </button>
      ) : (
        ids.length > 0 && (
          <button type="button" className="pulsante self-start" onClick={leggi}>
            {t("Leggi ora")}
          </button>
        )
      )}
      {!inCorso && fatte === 0 && ids.length > 0 && (
        <p className="text-xs text-tenue">{t("Ne leggo una ogni 10 secondi circa, per non superare il limite del servizio gratuito.")}</p>
      )}
    </div>
  );
}

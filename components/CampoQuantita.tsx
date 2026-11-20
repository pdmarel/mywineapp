"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

// Una quantità di bottiglie con i pulsanti − e +: sul telefono è più comodo che scrivere il numero.
// Il numero resta un vero campo con il suo nome, quindi i moduli lo leggono come prima, e si può ancora scrivere.

type Props = {
  name: string;
  predefinito: number;
  min?: number;
  max?: number;
  /** Il nome del campo per chi usa un lettore di schermo. */
  etichetta: string;
};

export function CampoQuantita({ name, predefinito, min = 0, max = 9999, etichetta }: Props) {
  const t = useT();
  const [valore, setValore] = useState<string>(String(predefinito));
  const numero = Number(valore);
  const attuale = valore !== "" && Number.isFinite(numero) ? numero : min;
  const entro = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const leggi = (testo: string) => (testo !== "" && Number.isFinite(Number(testo)) ? Number(testo) : min);
  // Parte sempre dal valore più recente: due tocchi veloci contano due.
  const cambia = (delta: number) => setValore((prima) => String(entro(leggi(prima) + delta)));

  return (
    <div className="flex items-center gap-1" role="group" aria-label={etichetta}>
      <button
        type="button"
        aria-label={t("Una bottiglia in meno")}
        disabled={attuale <= min}
        onClick={() => cambia(-1)}
        className="min-h-11 w-11 shrink-0 rounded-lg border border-bordo bg-carta text-lg disabled:opacity-40"
      >
        −
      </button>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valore}
        onChange={(e) => setValore(e.target.value)}
        onBlur={() => cambia(0)}
        aria-label={etichetta}
        className="campo shrink-0 px-1 text-center"
        style={{ width: "3.25rem" }}
      />
      <button
        type="button"
        aria-label={t("Una bottiglia in più")}
        disabled={attuale >= max}
        onClick={() => cambia(1)}
        className="min-h-11 w-11 shrink-0 rounded-lg border border-bordo bg-carta text-lg disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Spazio3D, type Posizione } from "./Spazio3D";
import { useT } from "@/lib/i18n/client";
import { MASSIMO, coloreDi, type Punto } from "@/lib/spazio";

// Lo spazio di una parte della degustazione in due viste, tra cui si passa con un interruttore
// il parallelepipedo 3D oppure la tabella con gli stessi dati.
// La scelta vale per questa vista finché la pagina resta aperta.

type Props = {
  punti: Punto[];
  selezionato?: string | null;
  suSelezione?: (id: string) => void;
  /** Solo per il parallelepipedo, quando si compila: posizione scelta sulla griglia e come sceglierla. */
  posizione?: Posizione | null;
  suPosizione?: (p: Posizione) => void;
  /** Punti nascosti temporaneamente nel parallelepipedo (la tabella li mostra comunque). */
  nascosti?: string[];
};

function Casella({ valore, colore }: { valore: number; colore: string }) {
  return (
    <td className="p-0 text-center">
      <span
        className="block rounded-md py-1.5 tabular-nums"
        style={{
          // Il colore della categoria, più pieno quanto più è alto il valore; il testo resta leggibile.
          background: `color-mix(in srgb, ${colore} ${Math.round(10 + (valore / MASSIMO) * 90)}%, white)`,
          color: valore / MASSIMO > 0.5 ? "#fff" : "#2b2320",
        }}
      >
        {valore}
      </span>
    </td>
  );
}

export function TabellaSpazio({ punti, selezionato, suSelezione }: Props) {
  const t = useT();
  if (punti.length === 0) {
    return <p className="rounded-xl bg-sfondo p-4 text-center text-sm text-tenue">{t("Ancora nessun punto.")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl bg-sfondo p-2">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-tenue">
            <th className="text-left font-medium">{t("In ordine")}</th>
            <th className="font-medium">{t("Persistenza")}</th>
            <th className="font-medium">{t("Ampiezza")}</th>
            <th className="font-medium">{t("Intensità")}</th>
          </tr>
        </thead>
        <tbody>
          {punti.map((p, i) => {
            const colore = coloreDi(p.categoria);
            return (
              <tr
                key={p.id}
                onClick={suSelezione ? () => suSelezione(p.id) : undefined}
                className={suSelezione ? "cursor-pointer" : undefined}
                aria-selected={p.id === selezionato}
              >
                <td className={`rounded-md px-1 py-1 ${p.id === selezionato ? "bg-ambra/30 font-medium" : ""}`}>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colore }} />
                    <span>
                      {i + 1}. {t(p.nome)}
                    </span>
                  </span>
                  {p.commento && <span className="mt-0.5 block text-tenue">❝ {p.commento}</span>}
                </td>
                <Casella valore={p.persistenza} colore={colore} />
                <Casella valore={p.ampiezza} colore={colore} />
                <Casella valore={p.intensita} colore={colore} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VistaSpazio(props: Props) {
  const t = useT();
  const [vista, setVista] = useState<"spazio" | "tabella">("spazio");
  const scelta = (id: "spazio" | "tabella", testo: string) => (
    <button
      type="button"
      onClick={() => setVista(id)}
      aria-pressed={vista === id}
      className={`min-h-10 flex-1 rounded-lg px-3 text-sm ${vista === id ? "bg-vino font-medium text-white" : "bg-carta text-inchiostro"}`}
    >
      {testo}
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-xl border border-bordo bg-sfondo p-1" role="group" aria-label={t("Tipo di vista")}>
        {scelta("spazio", t("Parallelepipedo"))}
        {scelta("tabella", t("Tabella"))}
      </div>
      {vista === "spazio" ? <Spazio3D {...props} /> : <TabellaSpazio {...props} />}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { aDito, occhio, useRotazioneDueDita, type Telecamera } from "./rotazione";
import { useT } from "@/lib/i18n/client";
import { FASI, GRUPPI, INTENSITA_MASSIMA, intensitaAl, nomeCurva, sensazione, type Dinamica } from "@/lib/degustazione";

// Mappa 3D della dinamica di bocca.
//   asse lungo  = tempo in bocca (attacco → centro bocca → finale → persistenza, poi la coda)
//   asse corto  = le sensazioni, una fascia ciascuna, colorate per famiglia (tattile, gusto, aromatica)
//   altezza     = intensità, da 0 a 5
// Ogni sensazione è una fascia separata e non una superficie unica: tra «astringenza» e «dolcezza»
// non esiste un valore intermedio, e una superficie continua lo inventerebbe.
// Le fasce «stimate» (dedotte, non dichiarate dal degustatore) sono trasparenti.
//
// La libreria (Plotly) pesa qualche megabyte: si carica solo qui, nel browser, quando la mappa serve.
// Sotto c'è sempre la «vista piana» con gli stessi dati: funziona senza grafica 3D e si legge come una tabella.

const PASSO = 0.25; // secondi tra un campione e l'altro
// Un po' lontana: su telefono le etichette delle sensazioni non devono uscire dal bordo.
const TELECAMERA: Telecamera = { azimut: -2.22, elevazione: 0.32, distanza: 3.8 };
const MEZZA_FASCIA = 0.36;

function colore(gruppo: string): string {
  return GRUPPI.find((g) => g.id === gruppo)?.colore ?? "#7a6f69";
}

export function Mappa3D({ dinamica, altezza = 380 }: { dinamica: Dinamica; altezza?: number }) {
  const t = useT();
  const contenitore = useRef<HTMLDivElement>(null);
  const [stato, setStato] = useState<"carico" | "pronta" | "errore">("carico");
  const curve = dinamica.curve;
  const chiave = JSON.stringify(curve);
  useRotazioneDueDita(contenitore, TELECAMERA, stato === "pronta");

  useEffect(() => {
    const el = contenitore.current;
    if (!el || curve.length === 0) return;
    let annullato = false;

    (async () => {
      try {
        const Plotly = (await import("plotly.js-dist-min")).default;
        if (annullato) return;

        const fine = Math.max(...curve.map((c) => FASI[FASI.length - 1].t + c.coda));
        const tempi: number[] = [];
        for (let s = 0; s <= fine + 1e-9; s += PASSO) tempi.push(Number(s.toFixed(2)));

        const tracce = curve.map((c, i) => {
          const s = sensazione(c.id);
          const riga = tempi.map((istante) => Number(intensitaAl(c, istante).toFixed(3)));
          const tinta = colore(s?.gruppo ?? "");
          return {
            type: "surface",
            name: nomeCurva(c.id, t),
            x: tempi,
            y: [i - MEZZA_FASCIA, i + MEZZA_FASCIA],
            z: [riga, riga],
            colorscale: [
              [0, tinta],
              [1, tinta],
            ],
            showscale: false,
            opacity: c.origine === "stimato" ? 0.35 : 0.95,
            contours: { x: { highlight: false }, y: { highlight: false }, z: { highlight: false } },
            hovertemplate: `<b>${nomeCurva(c.id, t)}</b>${c.origine === "stimato" ? ` ${t("(stimato)")}` : ""}<br>${t("{tempo} s · intensità {valore}", { tempo: "%{x:.1f}", valore: "%{z:.1f}" })}<extra></extra>`,
          };
        });

        await Plotly.react(
          el,
          tracce,
          {
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: "rgba(0,0,0,0)",
            font: { family: "system-ui, sans-serif", size: 11, color: "#2b2320" },
            scene: {
              aspectmode: "manual",
              aspectratio: { x: 1.6, y: Math.max(0.7, Math.min(1.4, curve.length * 0.14)), z: 0.55 },
              // Un po' più lontano di quanto servirebbe: su telefono le etichette delle sensazioni non devono uscire dal bordo.
              camera: { eye: occhio(TELECAMERA), center: { x: 0, y: 0, z: -0.3 } },
              // Sul telefono un dito scorre la pagina: la mappa si ruota con due (vedi rotazione.ts).
              dragmode: aDito() ? false : "turntable",
              xaxis: {
                title: { text: "" },
                tickvals: FASI.map((f) => f.t),
                ticktext: FASI.map((f) => t(f.nome)),
                gridcolor: "#d9d0c7",
              },
              yaxis: {
                title: { text: "" },
                tickvals: curve.map((_, i) => i),
                ticktext: curve.map((c) => nomeCurva(c.id, t)),
                gridcolor: "#eee6dd",
              },
              zaxis: { title: { text: t("Intensità") }, range: [0, INTENSITA_MASSIMA], dtick: 1, gridcolor: "#d9d0c7" },
            },
          },
          { responsive: true, displaylogo: false, displayModeBar: false },
        );
        if (!annullato) setStato("pronta");
      } catch (e) {
        console.warn("Mappa 3D non disponibile:", e);
        if (!annullato) setStato("errore");
      }
    })();

    return () => {
      annullato = true;
    };
    // "chiave" riassume le curve: ridisegna solo quando cambiano davvero i dati (o la lingua).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave, t]);

  useEffect(() => {
    const el = contenitore.current;
    return () => {
      if (el) void import("plotly.js-dist-min").then((m) => m.default.purge(el)).catch(() => {});
    };
  }, []);

  if (curve.length === 0) {
    return (
      <p className="rounded-xl bg-sfondo p-4 text-center text-sm text-tenue">
        {t("La mappa compare appena valuti almeno una sensazione.")}
      </p>
    );
  }

  const gruppiPresenti = GRUPPI.filter((g) => curve.some((c) => sensazione(c.id)?.gruppo === g.id));
  const haStimate = curve.some((c) => c.origine === "stimato");

  return (
    <div className="flex flex-col gap-3">
      {stato !== "errore" && (
        <div className="relative overflow-hidden rounded-xl bg-sfondo" style={{ height: altezza, touchAction: "pan-y" }}>
          <div ref={contenitore} className="h-full w-full" />
          {stato === "carico" && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-tenue">{t("Disegno la mappa…")}</p>
          )}
        </div>
      )}
      {stato === "errore" && (
        <p className="rounded-xl bg-ambra/15 p-3 text-sm">
          {t("Su questo dispositivo la vista 3D non è disponibile: qui sotto trovi gli stessi dati in vista piana.")}
        </p>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tenue">
        {gruppiPresenti.map((g) => (
          <li key={g.id} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: g.colore }} />
            {t(g.nome)}
          </li>
        ))}
        {haStimate && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-inchiostro opacity-30" />
            {t("trasparente = stimato, non dichiarato")}
          </li>
        )}
      </ul>
      {stato === "pronta" && (
        <p className="text-xs text-tenue">{t("Sul telefono ruota con due dita e pizzica per ingrandire; sul computer trascina.")}</p>
      )}

      <VistaPiana dinamica={dinamica} />
    </div>
  );
}

/** Gli stessi dati senza 3D: una riga per sensazione, una casella per fase, più scura = più intensa. */
export function VistaPiana({ dinamica }: { dinamica: Dinamica }) {
  const t = useT();
  if (dinamica.curve.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-vino underline">{t("Vista piana (tabella)")}</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr className="text-tenue">
              <th className="text-left font-medium">{t("Sensazione")}</th>
              {FASI.map((f) => (
                <th key={f.id} className="font-medium">
                  {t(f.nome)}
                </th>
              ))}
              <th className="font-medium">{t("Coda")}</th>
            </tr>
          </thead>
          <tbody>
            {dinamica.curve.map((c) => {
              const s = sensazione(c.id);
              if (!s) return null;
              return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap pr-2">
                    {nomeCurva(c.id, t)}
                    {c.origine === "stimato" && <span className="text-tenue"> {t("(stimato)")}</span>}
                  </td>
                  {c.valori.map((v, i) => (
                    <td key={i} className="rounded-md p-0 text-center">
                      <span
                        className="block rounded-md py-1.5 tabular-nums"
                        style={{
                          // Il colore della famiglia, più pieno quanto più è intensa la sensazione; il testo resta leggibile.
                          background: `color-mix(in srgb, ${colore(s.gruppo)} ${Math.round(10 + (v / INTENSITA_MASSIMA) * 90)}%, white)`,
                          color: v / INTENSITA_MASSIMA > 0.5 ? "#fff" : "#2b2320",
                        }}
                      >
                        {v}
                      </span>
                    </td>
                  ))}
                  <td className="text-center tabular-nums text-tenue">{c.coda} s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { NuovaBottiglia } from "./NuovaBottiglia";
import { EVENTO_CANTINE, leggiCantine, type CantinaLocale } from "@/lib/archivio-cantine";
import { useLingua } from "@/lib/i18n/client";

// L'inserimento di una bottiglia che non dipende dal server: cantine e posizioni si leggono dalla copia
// tenuta sul telefono (aggiornata a ogni apertura con il segnale), il salvataggio va nella coda sul telefono.
// Così in cantina, senza segnale o con poco, si sceglie la cantina e si inseriscono i vini lo stesso.

const ULTIMA_CANTINA = "ultimaCantina";

export function InserimentoRapido() {
  const { t, locale } = useLingua();
  const [cantine, setCantine] = useState<CantinaLocale[] | null>(null);
  const [scelta, setScelta] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      setCantine(await leggiCantine());
    } catch {
      setCantine([]); // archivio del telefono non disponibile (es. navigazione privata)
    }
  }, []);

  useEffect(() => {
    // Lettura iniziale da IndexedDB: è la sincronizzazione con un sistema esterno.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carica();
    window.addEventListener(EVENTO_CANTINE, carica);
    return () => window.removeEventListener(EVENTO_CANTINE, carica);
  }, [carica]);

  if (cantine === null) return <p className="text-sm text-tenue">{t("Carico le cantine…")}</p>;

  if (cantine.length === 0) {
    return (
      <p className="scheda text-sm">
        {t("Le cantine non sono ancora sul telefono. Apri l'app una volta con il segnale: poi potrai inserire bottiglie anche senza rete.")}
      </p>
    );
  }

  // Quale cantina: quella scelta ora, poi quella indicata dal link, poi l'ultima usata, poi la prima.
  const preferita = () => {
    const richiesta = new URLSearchParams(window.location.search).get("cantina");
    let ultima: string | null = null;
    try {
      ultima = localStorage.getItem(ULTIMA_CANTINA);
    } catch {
      // archivio del browser non disponibile
    }
    return [richiesta, ultima].find((id) => id && cantine.some((c) => c.id === id)) ?? cantine[0].id;
  };
  const attiva = cantine.find((c) => c.id === scelta) ?? cantine.find((c) => c.id === preferita()) ?? cantine[0];
  const aggiornata = new Date(attiva.aggiornata).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      {cantine.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Cantina")}
          <select
            value={attiva.id}
            className="campo"
            onChange={(e) => {
              setScelta(e.target.value);
              try {
                localStorage.setItem(ULTIMA_CANTINA, e.target.value);
              } catch {
                // archivio del browser non disponibile
              }
            }}
          >
            {cantine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm font-medium">{t("Cantina {nome}", { nome: attiva.nome })}</p>
      )}

      {attiva.posizioni.length === 0 ? (
        <p className="scheda text-sm">{t("Questa cantina non ha ancora posizioni: creale con il segnale in «Luoghi e posizioni».")}</p>
      ) : (
        <NuovaBottiglia key={attiva.id} cantinaId={attiva.id} posizioni={attiva.posizioni} />
      )}

      <p className="text-xs text-tenue">{t("Elenco di cantine e posizioni aggiornato il {data}.", { data: aggiornata })}</p>
      {/* Collegamento normale (non Link): deve funzionare anche se la pagina di destinazione va richiesta al server. */}
      <a href={`/cantine/${attiva.id}`} className="text-sm text-vino underline">
        ‹ {t("Cantina {nome}", { nome: attiva.nome })}
      </a>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

// Il pulsante «+ Bottiglia» della cantina. È un collegamento normale e non un Link di Next: va all'inserimento
// rapido caricando la pagina per intero, così funziona anche con poco segnale (la copia sul telefono la apre
// subito). Ricorda la cantina scelta, per ritrovarla anche se il browser perde "?cantina=" per strada.
export function LinkInserimento({ cantinaId, className, children }: { cantinaId: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`/inserimento?cantina=${cantinaId}`}
      className={className}
      onClick={() => {
        try {
          localStorage.setItem("ultimaCantina", cantinaId);
        } catch {
          // archivio del browser non disponibile
        }
      }}
    >
      {children}
    </a>
  );
}

"use client";

import { useState } from "react";
import { FotoEtichetta } from "./FotoEtichetta";
import { CampiEtichetta } from "./CampiEtichetta";
import { useT } from "@/lib/i18n/client";
import type { Vino } from "@/lib/vini";

// Modulo per modificare un vino già salvato: le foto si caricano subito e i dati passano dal server.
// La bottiglia nuova ha un modulo suo (NuovaBottiglia), che funziona anche senza rete.

type Props = {
  cantinaId: string;
  vinoId: string;
  azione: (formData: FormData) => void | Promise<void>;
  vino?: Vino;
  anteprime?: { fronte?: string | null; retro?: string | null };
  testoPulsante: string;
};

export function FormVino({ cantinaId, vinoId, azione, vino, anteprime, testoPulsante }: Props) {
  const t = useT();
  const [caricamenti, setCaricamenti] = useState(0);
  const occupato = (si: boolean) => setCaricamenti((n) => Math.max(0, n + (si ? 1 : -1)));

  return (
    <form action={azione} className="flex flex-col gap-4">
      <input type="hidden" name="cantina_id" value={cantinaId} />
      <input type="hidden" name="vino_id" value={vinoId} />

      <div className="grid grid-cols-2 gap-3">
        <FotoEtichetta
          cantinaId={cantinaId}
          vinoId={vinoId}
          lato="fronte"
          nomeCampo="foto_fronte"
          percorsoIniziale={vino?.foto_fronte}
          anteprimaIniziale={anteprime?.fronte}
          suOccupato={occupato}
        />
        <FotoEtichetta
          cantinaId={cantinaId}
          vinoId={vinoId}
          lato="retro"
          nomeCampo="foto_retro"
          percorsoIniziale={vino?.foto_retro}
          anteprimaIniziale={anteprime?.retro}
          suOccupato={occupato}
        />
      </div>

      <CampiEtichetta vino={vino} />

      <button type="submit" className="pulsante" disabled={caricamenti > 0}>
        {caricamenti > 0 ? t("Carico le foto…") : testoPulsante}
      </button>
    </form>
  );
}

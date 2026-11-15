"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

// Pulsante che fa leggere l'etichetta dalle foto. Il risultato è una proposta:
// la pagina si ricarica e il modulo sotto si riempie con i dati letti, da controllare e salvare.
export function LetturaEtichetta({ vinoId, giaLetta }: { vinoId: string; giaLetta: boolean }) {
  const t = useT();
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function leggi() {
    setInCorso(true);
    setErrore("");
    try {
      const risposta = await fetch(`/api/vini/${vinoId}/leggi`, { method: "POST" });
      if (!risposta.ok) {
        const corpo = (await risposta.json().catch(() => null)) as { messaggio?: string; errore?: string } | null;
        setErrore(
          corpo?.messaggio ??
            (corpo?.errore === "senza_foto"
              ? t("Servono le foto dell'etichetta: scattale e salva, poi riprova.")
              : t("La lettura non è riuscita. Riprova.")),
        );
        return;
      }
      router.refresh();
    } catch {
      setErrore(t("Manca la rete: la lettura dell'etichetta ha bisogno del segnale."));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="pulsante" onClick={leggi} disabled={inCorso}>
        {inCorso ? t("Leggo l'etichetta…") : giaLetta ? t("Rileggi l'etichetta") : t("Leggi l'etichetta dalle foto")}
      </button>
      {errore && (
        <p role="alert" className="text-sm text-vino-scuro">
          {errore}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

// Pulsante che cerca il prezzo corrente sulle enoteche online. Ogni ricerca usa un credito
// del servizio di ricerca (1.000 al mese): per questo parte solo su richiesta, una volta al giorno per vino.
export function PrezzoVino({ vinoId, haPrezzo }: { vinoId: string; haPrezzo: boolean }) {
  const t = useT();
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState("");

  async function cerca() {
    setInCorso(true);
    setMessaggio("");
    try {
      const risposta = await fetch(`/api/vini/${vinoId}/prezzo`, { method: "POST" });
      if (!risposta.ok) {
        const corpo = (await risposta.json().catch(() => null)) as { messaggio?: string } | null;
        setMessaggio(corpo?.messaggio ?? t("La ricerca non è riuscita. Riprova."));
      }
      router.refresh();
    } catch {
      setMessaggio(t("Manca la rete: la ricerca del prezzo ha bisogno del segnale."));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="pulsante" onClick={cerca} disabled={inCorso}>
        {inCorso ? t("Cerco il prezzo…") : haPrezzo ? t("Aggiorna il prezzo online") : t("Cerca il prezzo online")}
      </button>
      {messaggio && (
        <p role="alert" className="text-sm text-vino-scuro">
          {messaggio}
        </p>
      )}
    </div>
  );
}

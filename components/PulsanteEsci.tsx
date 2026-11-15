"use client";

import { svuotaArchivioCantine } from "@/lib/archivio-cantine";
import { useT } from "@/lib/i18n/client";
import { elencoSospesi } from "@/lib/sospesi";

// Uscita da questo dispositivo. Prima di uscire:
//  - avvisa se ci sono bottiglie non ancora inviate (resterebbero sul telefono in attesa del prossimo accesso);
//  - fa cancellare al service worker le pagine tenute in copia, che contengono i dati della cantina.
export function PulsanteEsci() {
  const t = useT();

  async function conferma(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const modulo = e.currentTarget;
    let inSospeso = 0;
    try {
      inSospeso = (await elencoSospesi()).length;
    } catch {
      // archivio del telefono non disponibile: si esce comunque
    }
    if (
      inSospeso > 0 &&
      !window.confirm(
        inSospeso === 1
          ? t("C'è {n} bottiglia non ancora inviata. Resta su questo telefono e partirà al prossimo accesso. Uscire lo stesso?", { n: inSospeso })
          : t("Ci sono {n} bottiglie non ancora inviate. Restano su questo telefono e partiranno al prossimo accesso. Uscire lo stesso?", { n: inSospeso }),
      )
    ) {
      return;
    }
    navigator.serviceWorker?.controller?.postMessage("svuota");
    try {
      await svuotaArchivioCantine();
    } catch {
      // archivio del telefono non disponibile: si esce comunque
    }
    modulo.submit();
  }

  return (
    <form action="/auth/esci" method="post" onSubmit={conferma}>
      <button type="submit" className="text-sm text-vino underline">
        {t("Esci")}
      </button>
    </form>
  );
}

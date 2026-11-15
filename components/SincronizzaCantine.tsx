"use client";

import { useEffect } from "react";
import { aggiornaCantine } from "@/lib/archivio-cantine";

// Non mostra nulla: tiene aggiornata sul telefono la copia di cantine e posizioni, quella da cui l'inserimento
// rapido legge quando non c'è rete. Si aggiorna all'apertura di una pagina, al ritorno del segnale e quando
// l'app torna in primo piano (al massimo una volta al minuto).
export function SincronizzaCantine() {
  useEffect(() => {
    const vai = (forza = false) => void aggiornaCantine(forza).catch(() => {});
    const tornato = () => vai(true);
    const visibile = () => {
      if (document.visibilityState === "visible") vai();
    };
    vai();
    window.addEventListener("online", tornato);
    document.addEventListener("visibilitychange", visibile);
    return () => {
      window.removeEventListener("online", tornato);
      document.removeEventListener("visibilitychange", visibile);
    };
  }, []);
  return null;
}

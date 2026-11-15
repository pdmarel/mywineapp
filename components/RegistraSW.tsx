"use client";

import { useEffect } from "react";

// Attiva il service worker (copia delle pagine per l'uso senza rete).
// Solo nella versione pubblicata: in sviluppo terrebbe in copia pagine vecchie e confonderebbe le prove.
export function RegistraSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("Service worker non attivato:", e));
  }, []);
  return null;
}

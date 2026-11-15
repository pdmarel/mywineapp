"use client";

import { useEffect, type RefObject } from "react";

// Rotazione delle viste 3D con DUE dita.
// Sul telefono un dito solo deve restare libero per scorrere la pagina e per toccare i punti;
// con due dita si ruota (trascinando) e si ingrandisce (pizzicando). Col mouse si trascina come sempre.
//
// La telecamera è descritta con tre numeri: azimut (giro attorno), elevazione (altezza dello sguardo)
// e distanza. Da questi si calcola la posizione dell'occhio che Plotly si aspetta.

export type Telecamera = { azimut: number; elevazione: number; distanza: number };

export function occhio(t: Telecamera) {
  return {
    x: t.distanza * Math.cos(t.elevazione) * Math.cos(t.azimut),
    y: t.distanza * Math.cos(t.elevazione) * Math.sin(t.azimut),
    z: t.distanza * Math.sin(t.elevazione),
  };
}

/** true su telefoni e tablet (puntatore "grossolano"): lì il trascinamento con un dito va lasciato alla pagina. */
export function aDito(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function useRotazioneDueDita(contenitore: RefObject<HTMLDivElement | null>, iniziale: Telecamera, attiva: boolean) {
  useEffect(() => {
    const el = contenitore.current;
    if (!el || !attiva) return;

    const camera = { ...iniziale };
    let partenza: { x: number; y: number; apertura: number; camera: Telecamera } | null = null;
    let inAttesa = false;

    const lettura = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        apertura: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      };
    };

    const inizio = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      partenza = { ...lettura(e), camera: { ...camera } };
    };

    const movimento = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !partenza) return;
      e.preventDefault(); // niente zoom della pagina mentre si ruota la mappa
      const ora = lettura(e);
      camera.azimut = partenza.camera.azimut - (ora.x - partenza.x) * 0.012;
      camera.elevazione = Math.min(1.45, Math.max(0.05, partenza.camera.elevazione + (ora.y - partenza.y) * 0.008));
      camera.distanza = Math.min(4.6, Math.max(1.6, partenza.camera.distanza * (partenza.apertura / Math.max(20, ora.apertura))));
      if (inAttesa) return; // un aggiornamento per fotogramma: di più non serve e rallenta
      inAttesa = true;
      requestAnimationFrame(() => {
        inAttesa = false;
        void import("plotly.js-dist-min").then((m) => m.default.relayout(el, { "scene.camera.eye": occhio(camera) })).catch(() => {});
      });
    };

    const fine = (e: TouchEvent) => {
      if (e.touches.length < 2) partenza = null;
    };

    // "passive: false" serve per poter fermare lo zoom della pagina.
    el.addEventListener("touchstart", inizio, { passive: false });
    el.addEventListener("touchmove", movimento, { passive: false });
    el.addEventListener("touchend", fine);
    el.addEventListener("touchcancel", fine);
    return () => {
      el.removeEventListener("touchstart", inizio);
      el.removeEventListener("touchmove", movimento);
      el.removeEventListener("touchend", fine);
      el.removeEventListener("touchcancel", fine);
    };
    // La telecamera iniziale è una costante del componente che usa questo gancio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenitore, attiva]);
}

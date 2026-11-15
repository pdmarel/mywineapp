"use client";

import { useEffect, useRef, useState } from "react";

// Il necessario per disegnare una vista 3D direttamente in SVG, senza librerie: la telecamera, i gesti
// e la proiezione prospettica. Lo usano il parallelepipedo della degustazione e la cantina in 3D.
//
// Gesti: sul telefono si ruota con DUE dita e si pizzica per ingrandire (un dito resta libero per scorrere
// la pagina e per toccare); sul computer si trascina col mouse e si ingrandisce con la rotellina.

export type Telecamera = { azimut: number; elevazione: number; distanza: number };
export type Vettore = [number, number, number];

const meno = (a: Vettore, b: Vettore): Vettore => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scalare = (a: Vettore, b: Vettore) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vettoriale = (a: Vettore, b: Vettore): Vettore => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unitario = (a: Vettore): Vettore => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Restituisce la funzione che porta un punto della scena sullo schermo.
 * La telecamera gira attorno a "centro" guardandolo; z nel risultato è la distanza da chi guarda.
 */
export function proiettore(t: Telecamera, larghezza: number, altezza: number, focale: number, centro: Vettore = [0, 0, 0]) {
  const occhio: Vettore = [
    centro[0] + t.distanza * Math.cos(t.elevazione) * Math.cos(t.azimut),
    centro[1] + t.distanza * Math.cos(t.elevazione) * Math.sin(t.azimut),
    centro[2] + t.distanza * Math.sin(t.elevazione),
  ];
  const avanti = unitario(meno(centro, occhio));
  const destra = unitario(vettoriale(avanti, [0, 0, 1]));
  const su = vettoriale(destra, avanti);
  return (p: Vettore) => {
    const v = meno(p, occhio);
    const z = Math.max(0.1, scalare(v, avanti));
    return { x: larghezza / 2 + (focale * scalare(v, destra)) / z, y: altezza / 2 - (focale * scalare(v, su)) / z, z };
  };
}

export function useVista3D(iniziale: Telecamera, limiti = { vicino: 1.9, lontano: 5.5, basso: -0.2 }) {
  const contenitore = useRef<HTMLDivElement>(null);
  const [larghezza, setLarghezza] = useState(340);
  const [camera, setCamera] = useState<Telecamera>(iniziale);
  const cameraOra = useRef(camera);
  const trascinato = useRef(false);
  const ultimoGesto = useRef(0);

  // La larghezza segue quella del contenitore (telefono in verticale, orizzontale, computer).
  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const misura = () => setLarghezza(Math.max(200, el.clientWidth));
    misura();
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);

  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const limita = (c: Telecamera): Telecamera => ({
      azimut: c.azimut,
      elevazione: Math.min(1.45, Math.max(limiti.basso, c.elevazione)),
      distanza: Math.min(limiti.lontano, Math.max(limiti.vicino, c.distanza)),
    });
    let inAttesa: Telecamera | null = null;
    const applica = (c: Telecamera) => {
      const prima = inAttesa;
      inAttesa = limita(c);
      cameraOra.current = inAttesa;
      if (prima) return; // un ridisegno per fotogramma
      requestAnimationFrame(() => {
        if (inAttesa) setCamera(inAttesa);
        inAttesa = null;
      });
    };

    let dita: { x: number; y: number; apertura: number; camera: Telecamera } | null = null;
    const lettura = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        apertura: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      };
    };
    const inizioDita = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      dita = { ...lettura(e), camera: { ...cameraOra.current } };
      ultimoGesto.current = Date.now();
    };
    const mossaDita = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !dita) return;
      e.preventDefault(); // niente zoom della pagina mentre si ruota
      const ora = lettura(e);
      ultimoGesto.current = Date.now();
      applica({
        azimut: dita.camera.azimut - (ora.x - dita.x) * 0.012,
        elevazione: dita.camera.elevazione + (ora.y - dita.y) * 0.008,
        distanza: dita.camera.distanza * (dita.apertura / Math.max(20, ora.apertura)),
      });
    };
    const fineDita = (e: TouchEvent) => {
      if (dita) ultimoGesto.current = Date.now();
      if (e.touches.length < 2) dita = null;
    };

    let mouse: { x: number; y: number; camera: Telecamera } | null = null;
    const giu = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      mouse = { x: e.clientX, y: e.clientY, camera: { ...cameraOra.current } };
      trascinato.current = false;
    };
    const mossa = (e: PointerEvent) => {
      if (!mouse) return;
      const dx = e.clientX - mouse.x;
      const dy = e.clientY - mouse.y;
      if (!trascinato.current && Math.hypot(dx, dy) < 5) return;
      trascinato.current = true;
      applica({ ...mouse.camera, azimut: mouse.camera.azimut - dx * 0.01, elevazione: mouse.camera.elevazione + dy * 0.007 });
    };
    const rilascio = () => {
      mouse = null;
    };
    const rotella = (e: WheelEvent) => {
      e.preventDefault();
      applica({ ...cameraOra.current, distanza: cameraOra.current.distanza * (e.deltaY > 0 ? 1.08 : 0.93) });
    };

    // "passive: false" serve per poter fermare lo zoom e lo scorrimento della pagina durante il gesto.
    el.addEventListener("touchstart", inizioDita, { passive: false });
    el.addEventListener("touchmove", mossaDita, { passive: false });
    el.addEventListener("touchend", fineDita);
    el.addEventListener("touchcancel", fineDita);
    el.addEventListener("pointerdown", giu);
    window.addEventListener("pointermove", mossa);
    window.addEventListener("pointerup", rilascio);
    el.addEventListener("wheel", rotella, { passive: false });
    return () => {
      el.removeEventListener("touchstart", inizioDita);
      el.removeEventListener("touchmove", mossaDita);
      el.removeEventListener("touchend", fineDita);
      el.removeEventListener("touchcancel", fineDita);
      el.removeEventListener("pointerdown", giu);
      window.removeEventListener("pointermove", mossa);
      window.removeEventListener("pointerup", rilascio);
      el.removeEventListener("wheel", rotella);
    };
    // I limiti sono costanti del componente che usa questo gancio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Da chiamare in un "click": dice se è un tocco vero e non la fine di un trascinamento o di una rotazione. */
  function eUnTocco(): boolean {
    if (trascinato.current) {
      trascinato.current = false;
      return false;
    }
    return Date.now() - ultimoGesto.current >= 400;
  }

  return { contenitore, larghezza, camera, eUnTocco };
}

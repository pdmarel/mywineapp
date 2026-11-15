"use client";

import { useMemo } from "react";
import { proiettore as proiettoreScena, useVista3D, type Telecamera, type Vettore } from "./vista3d";
import { useT } from "@/lib/i18n/client";
import { AMPIEZZA_MINIMA, MASSIMO, coloreDi, type Punto } from "@/lib/spazio";

// Il parallelepipedo della degustazione: lunghezza = persistenza, larghezza = ampiezza, altezza = intensità.
// Ogni profumo (o gusto/aroma) ha una partenza (pallino pieno, con il nome) e, se cambia nel tempo, un arrivo
// (rombo): una linea li unisce ed è l'andamento. Un filo tratteggiato scende da ogni estremo al "pavimento"
// per leggerne la posizione.
//
// L'ampiezza è uno spazio occupato, non una posizione: parte dal bordo (posto 1) e arriva fino al valore
// dato. Ampiezza 1 = un solo posto (un punto), ampiezza 3 = i posti da 1 a 3, ampiezza 5 = tutta la larghezza.
// Tra la partenza e l'arrivo lo spazio occupato diventa un'area colorata: ampiezza 1 → 5 disegna un triangolo.
// Il pallino dell'estremo sta sul bordo lontano dell'area, cioè proprio dove si è toccata la griglia.
//
// È disegnato direttamente (SVG e la proiezione di vista3d.ts), non con Plotly: così il tocco è
// sotto il nostro controllo. Quando si compila, lo spazio mostra una griglia di pallini toccabili
// (persistenza 0-5, ampiezza 1-5, intensità 1-5: 150 posizioni). I pallini lontani da chi guarda sono più
// piccoli e più tenui, e al tocco vince quello più vicino: per raggiungere quelli dietro si ruota.
// Si ruota con due dita sul telefono (un dito scorre la pagina e tocca), trascinando col mouse sul computer.

export type Posizione = { persistenza: number; ampiezza: number; intensita: number };
const INIZIALE: Telecamera = { azimut: -1.3, elevazione: 0.4, distanza: 3.7 };
const PROPORZIONI: Vettore = [1.5, 1.05, 0.95];
const CENTRO: Vettore = [0, 0, -0.08];
const RAGGIO_TOCCO = 26; // pixel: entro questa distanza un tocco "prende" un pallino
const M = MASSIMO;

/** Restituisce la funzione che porta un punto dello spazio (in valori 0-5) sullo schermo. z = distanza da chi guarda. */
function proiettore(t: Telecamera, larghezza: number, altezza: number) {
  const scena = proiettoreScena(t, larghezza, altezza, Math.min(larghezza * 1.62, altezza * 2.3), CENTRO);
  // L'asse dell'ampiezza ha 5 posti (da 1 a 5) e il parallelepipedo li copre tutti, da un bordo all'altro.
  return (persistenza: number, ampiezza: number, intensita: number) =>
    scena([
      (persistenza / M - 0.5) * PROPORZIONI[0],
      ((ampiezza - AMPIEZZA_MINIMA) / (M - AMPIEZZA_MINIMA) - 0.5) * PROPORZIONI[1],
      (intensita / M - 0.5) * PROPORZIONI[2],
    ]);
}

/** Le posizioni toccabili della griglia. */
const NODI: Posizione[] = [];
for (let persistenza = 0; persistenza <= M; persistenza++)
  for (let ampiezza = AMPIEZZA_MINIMA; ampiezza <= M; ampiezza++)
    for (let intensita = 1; intensita <= M; intensita++) NODI.push({ persistenza, ampiezza, intensita });

/** I dodici spigoli del parallelepipedo. */
const SPIGOLI: [Vettore, Vettore][] = (() => {
  const A = AMPIEZZA_MINIMA;
  const s: [Vettore, Vettore][] = [];
  for (const h of [0, M]) {
    s.push([[0, A, h], [M, A, h]], [[M, A, h], [M, M, h]], [[M, M, h], [0, M, h]], [[0, M, h], [0, A, h]]);
  }
  for (const [a, b] of [[0, A], [M, A], [M, M], [0, M]]) s.push([[a, b, 0], [a, b, M]]);
  return s;
})();

export function Spazio3D({
  punti,
  selezionato,
  suSelezione,
  posizione,
  suPosizione,
  estremo = "partenza",
  nascosti,
  altezza = 340,
}: {
  punti: Punto[];
  selezionato?: string | null;
  suSelezione?: (id: string) => void;
  /** Posizione scelta toccando la griglia, in attesa che si scelga il profumo. */
  posizione?: Posizione | null;
  /** Se presente, lo spazio mostra la griglia dei pallini toccabili. */
  suPosizione?: (p: Posizione) => void;
  /** Quale estremo del punto aperto si sta sistemando: le guide tratteggiate seguono quello. */
  estremo?: "partenza" | "arrivo";
  /** Id dei punti nascosti temporaneamente: restano nei dati ma non sono disegnati (il punto aperto si vede sempre). */
  nascosti?: string[];
  altezza?: number;
}) {
  const t = useT();
  const { contenitore, larghezza, camera, eUnTocco } = useVista3D(INIZIALE);

  const scena = useMemo(() => {
    const proietta = proiettore(camera, larghezza, altezza);
    const di = (p: Posizione) => proietta(p.persistenza, p.ampiezza, p.intensita);
    const nodi = suPosizione ? NODI.map((n) => ({ n, s: di(n) })) : [];
    const profondita = nodi.map((x) => x.s.z);
    const vicino = Math.min(...profondita, Infinity);
    const lontano = Math.max(...profondita, -Infinity);
    // 0 = il più vicino a chi guarda, 1 = il più lontano.
    const lontananza = (z: number) => (lontano > vicino ? (z - vicino) / (lontano - vicino) : 0);
    return {
      proietta,
      nodi: nodi.map((x) => ({ ...x, t: lontananza(x.s.z) })).sort((a, b) => b.s.z - a.s.z),
      // La numerazione resta quella dell'elenco anche se alcuni punti sono nascosti.
      punti: punti
        .map((p, i) => {
          const fine = p.fine ?? null;
          const a = di(p);
          const b = fine ? di(fine) : null;
          // L'area occupata: tra partenza e arrivo, dal bordo (ampiezza 1) fino all'ampiezza di ciascun estremo.
          const bordo = (e: Posizione) => proietta(e.persistenza, AMPIEZZA_MINIMA, e.intensita);
          const area = fine ? [bordo(p), a, b!, bordo(fine)] : p.ampiezza > AMPIEZZA_MINIMA ? [bordo(p), a] : null;
          return {
            p,
            i,
            a,
            b,
            area,
            piedeA: proietta(p.persistenza, p.ampiezza, 0),
            piedeB: fine ? proietta(fine.persistenza, fine.ampiezza, 0) : null,
            z: b ? (a.z + b.z) / 2 : a.z,
          };
        })
        .filter(({ p }) => p.id === selezionato || !nascosti?.includes(p.id)),
    };
  }, [camera, larghezza, altezza, punti, suPosizione, nascosti, selezionato]);

  function tocco(e: React.MouseEvent<HTMLDivElement>) {
    if (!eUnTocco()) return;
    const riquadro = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - riquadro.left;
    const y = e.clientY - riquadro.top;

    // Prima i punti già messi (partenza o arrivo): toccarne uno lo seleziona.
    if (suSelezione) {
      let migliore: { id: string; d: number } | null = null;
      for (const { p, a, b } of scena.punti) {
        for (const s of b ? [a, b] : [a]) {
          const d = Math.hypot(s.x - x, s.y - y);
          if (d <= RAGGIO_TOCCO && (!migliore || d < migliore.d)) migliore = { id: p.id, d };
        }
      }
      if (migliore) {
        suSelezione(migliore.id);
        return;
      }
    }
    // Poi la griglia: tra i pallini a portata di dito vince il più vicino al dito, con un vantaggio
    // per quelli davanti (un pallino in fondo si prende solo toccandolo con precisione, o ruotando).
    if (suPosizione) {
      let migliore: { n: Posizione; voto: number } | null = null;
      for (const { n, s, t } of scena.nodi) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d > RAGGIO_TOCCO) continue;
        const voto = d + t * 16;
        if (!migliore || voto < migliore.voto) migliore = { n, voto };
      }
      if (migliore) suPosizione(migliore.n);
    }
  }

  const { proietta } = scena;
  const linea = (a: Vettore, b: Vettore) => {
    const [p, q] = [proietta(...a), proietta(...b)];
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  };
  const A = AMPIEZZA_MINIMA;
  const scritte: { testo: string; dove: Vettore; forte?: boolean }[] = [
    { testo: t("Persistenza"), dove: [M / 2, A - 1.1, 0], forte: true },
    { testo: t("Ampiezza"), dove: [M + 1.1, (A + M) / 2, 0], forte: true },
    { testo: t("Intensità"), dove: [0, A - 0.2, M + 0.6], forte: true },
    ...Array.from({ length: M + 1 }, (_, i) => ({ testo: String(i), dove: [i, A - 0.4, 0] as Vettore })),
    ...Array.from({ length: M }, (_, i) => ({ testo: String(i + 1), dove: [M + 0.4, i + 1, 0] as Vettore })),
    ...Array.from({ length: M }, (_, i) => ({ testo: String(i + 1), dove: [-0.3, A - 0.3, i + 1] as Vettore })),
  ];
  /** Le guide che mostrano dove sta una posizione: giù fino al pavimento e da lì ai due bordi. */
  const guide = (p: Posizione) => [
    linea([p.persistenza, p.ampiezza, p.intensita], [p.persistenza, p.ampiezza, 0]),
    linea([p.persistenza, p.ampiezza, 0], [p.persistenza, A, 0]),
    linea([p.persistenza, p.ampiezza, 0], [M, p.ampiezza, 0]),
  ];
  const scelto = punti.find((p) => p.id === selezionato);
  // Le guide seguono l'estremo che si sta sistemando (l'arrivo, se il punto non ne ha ancora uno, non ha guide).
  const estremoGuidato = scelto ? (estremo === "arrivo" ? scelto.fine : scelto) : undefined;
  const attesa = posizione ? proietta(posizione.persistenza, posizione.ampiezza, posizione.intensita) : null;
  const poligono = (pts: { x: number; y: number }[]) => pts.map((s) => `${s.x},${s.y}`).join(" ");
  const rombo = (x: number, y: number, r: number) => `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
  const perProfondita = [...scena.punti].sort((a, b) => b.z - a.z);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={contenitore}
        onClick={tocco}
        className="relative overflow-hidden rounded-xl bg-sfondo select-none"
        style={{ height: altezza, touchAction: "pan-y", cursor: suPosizione || suSelezione ? "pointer" : "grab" }}
      >
        <svg
          width={larghezza}
          height={altezza}
          viewBox={`0 0 ${larghezza} ${altezza}`}
          role="img"
          aria-label={
            punti.length === 1
              ? t("Spazio tridimensionale con {n} punto: persistenza, ampiezza, intensità. Gli stessi dati sono nell'elenco e nella tabella.", { n: punti.length })
              : t("Spazio tridimensionale con {n} punti: persistenza, ampiezza, intensità. Gli stessi dati sono nell'elenco e nella tabella.", { n: punti.length })
          }
        >
          {SPIGOLI.map(([a, b], i) => (
            <line key={i} {...linea(a, b)} stroke="#b9aea4" strokeWidth={1.2} />
          ))}
          {scritte.map((s) => {
            const p = proietta(...s.dove);
            return (
              <text key={`${s.testo}-${s.dove.join()}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={s.forte ? 11 : 9} fill={s.forte ? "#5c524d" : "#9a8f88"}>
                {s.testo}
              </text>
            );
          })}

          {scena.nodi.map(({ n, s, t }) => (
            <circle
              key={`${n.persistenza}-${n.ampiezza}-${n.intensita}`}
              cx={s.x}
              cy={s.y}
              r={4.4 - 2.6 * t}
              fill="#6f625b"
              fillOpacity={0.8 - 0.66 * t}
            />
          ))}

          {/* Lo spazio occupato: un'area tra partenza e arrivo, o una striscia se il punto non cambia. */}
          {perProfondita.map(({ p, area }) =>
            area ? (
              area.length > 2 ? (
                <polygon
                  key={`area-${p.id}`}
                  points={poligono(area)}
                  fill={coloreDi(p.categoria)}
                  fillOpacity={p.id === selezionato ? 0.38 : 0.22}
                  stroke={coloreDi(p.categoria)}
                  strokeOpacity={0.7}
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
              ) : (
                <line key={`area-${p.id}`} x1={area[0].x} y1={area[0].y} x2={area[1].x} y2={area[1].y} stroke={coloreDi(p.categoria)} strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" />
              )
            ) : null,
          )}
          {scena.punti.map(({ p, a, piedeA, b, piedeB }) => (
            <g key={`filo-${p.id}`}>
              <line x1={a.x} y1={a.y} x2={piedeA.x} y2={piedeA.y} stroke="#9a8f88" strokeWidth={1} strokeDasharray="2 3" />
              {b && piedeB && <line x1={b.x} y1={b.y} x2={piedeB.x} y2={piedeB.y} stroke="#9a8f88" strokeWidth={1} strokeDasharray="2 3" />}
            </g>
          ))}
          {estremoGuidato && guide(estremoGuidato).map((g, i) => <line key={`guida-${i}`} {...g} stroke="#2b2320" strokeWidth={1.2} strokeDasharray="4 3" />)}
          {/* L'andamento: dalla partenza all'arrivo. */}
          {scena.punti.map(({ p, a, b }) =>
            b ? <line key={`andamento-${p.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={coloreDi(p.categoria)} strokeWidth={p.id === selezionato ? 3 : 2.2} strokeLinecap="round" /> : null,
          )}
          {perProfondita.map(({ p, i, a, b }) => {
            const attivo = p.id === selezionato;
            return (
              <g key={p.id}>
                {b && (
                  <g>
                    <polygon points={rombo(b.x, b.y, attivo ? 9 : 7)} fill={coloreDi(p.categoria)} stroke={attivo && estremo === "arrivo" ? "#2b2320" : "#ffffff"} strokeWidth={2} />
                    <text x={b.x} y={b.y - 12} textAnchor="middle" fontSize={10} fill="#2b2320" stroke="#f6f1ea" strokeWidth={3} paintOrder="stroke">
                      {i + 1}
                    </text>
                  </g>
                )}
                <circle cx={a.x} cy={a.y} r={attivo ? 10 : 7} fill={coloreDi(p.categoria)} stroke={attivo && (estremo === "partenza" || !b) ? "#2b2320" : "#ffffff"} strokeWidth={2} />
                <text
                  x={a.x}
                  y={a.y - (attivo ? 15 : 12)}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={attivo ? 600 : 400}
                  fill="#2b2320"
                  stroke="#f6f1ea"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {i + 1}. {t(p.nome)}
                  {p.commento ? " ❝" : ""}
                </text>
              </g>
            );
          })}

          {posizione && attesa && (
            <g>
              {guide(posizione).map((g, i) => (
                <line key={i} {...g} stroke="#8e3b46" strokeWidth={1.4} strokeDasharray="4 3" />
              ))}
              <circle cx={attesa.x} cy={attesa.y} r={10} fill="#ffffff" stroke="#8e3b46" strokeWidth={3} />
              <circle cx={attesa.x} cy={attesa.y} r={3.5} fill="#8e3b46" />
            </g>
          )}
        </svg>
      </div>
      <p className="text-xs text-tenue">
        {t("Sul telefono ruota con due dita e pizzica per ingrandire; sul computer trascina.")}{" "}
        {suPosizione ? `${t("I pallini più marcati sono quelli davanti: per prendere quelli dietro, ruota.")} ` : ""}
        {suSelezione ? `${t("Tocca un punto colorato per modificarlo.")} ` : ""}
        {t("❝ = c'è un commento.")}{" "}
        {t("Pallino = partenza, rombo = arrivo; l'ampiezza è lo spazio occupato dal bordo.")}
      </p>
    </div>
  );
}

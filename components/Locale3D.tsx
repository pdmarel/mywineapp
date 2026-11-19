"use client";

import { useMemo } from "react";
import { proiettore, useVista3D, type Telecamera, type Vettore } from "./vista3d";
import { useT } from "@/lib/i18n/client";
import { GEOMETRIA_PARETE as PARETE, disposizione, type Contenuto, type Locale } from "@/lib/locale";

// La cantina in 3D: il locale come una scatola a fil di ferro, gli scaffali appoggiati alle pareti.
// La faccia davanti di ogni scaffale è divisa in piani e parti: ogni casella mostra quante bottiglie
// contiene (più scura = più piena) e si può toccare per vederne il dettaglio.
// Gli oggetti liberi (tavoli, rack, casse) sono scatole nella posizione scelta: se hanno un nome di posizione,
// la faccia superiore conta le bottiglie e si può toccare come una parte di scaffale.
// Si guarda dall'ingresso; si ruota con due dita (o col mouse) come il parallelepipedo della degustazione.

const INIZIALE: Telecamera = { azimut: -1.25, elevazione: 0.5, distanza: 3.6 };

const metri = (m: number) => `${String(Math.round(m * 100) / 100).replace(".", ",")} m`;

function tinta(bottiglie: number, massimo: number) {
  if (bottiglie <= 0) return { fondo: "#fbf8f4", testo: "#9a8f88" };
  const t = Math.sqrt(bottiglie / Math.max(1, massimo));
  const misto = (a: number, b: number) => Math.round(a + (b - a) * t);
  return { fondo: `rgb(${misto(240, 122)},${misto(214, 40)},${misto(217, 54)})`, testo: t > 0.45 ? "#ffffff" : "#2b2320" };
}

type Poligono =
  | { tipo: "faccia"; punti: Vettore[] }
  | { tipo: "cella"; punti: Vettore[]; nome: string; bottiglie: number };

export function Locale3D({
  locale,
  contenuti,
  scelta,
  suScelta,
  altezza = 380,
}: {
  locale: Locale;
  contenuti: Record<string, Contenuto>;
  scelta?: string | null;
  suScelta?: (nome: string) => void;
  altezza?: number;
}) {
  const t = useT();
  const { contenitore, larghezza, camera, spostamento, ricentra, spostata, eUnTocco } = useVista3D(INIZIALE, { vicino: 1.6, lontano: 6, basso: 0.05 });

  const scena = useMemo(() => {
    const { larghezza: L, profondita: P, altezza: H } = locale;
    const scala = 1.7 / Math.max(L, P, H);
    const proietta = proiettore(camera, larghezza, altezza, Math.min(larghezza * 1.5, altezza * 2), [0, 0, -0.1], spostamento);
    /** Da metri nel locale a punto sullo schermo. */
    const p = (x: number, y: number, z: number) => proietta([(x - L / 2) * scala, (y - P / 2) * scala, (z - H / 2) * scala]);

    const poligoni: Poligono[] = [];
    const etichette: { testo: string; x: number; y: number; z: number }[] = [];
    let massimo = 1;

    const posti = disposizione(locale);
    for (const s of locale.scaffali) {
      const { o, u, n } = PARETE[s.parete](locale);
      const [da, a, fondo, alto] = [posti[s.id].inizio / 100, posti[s.id].fine / 100, s.profondita / 100, s.altezza / 100];
      /** s lungo la parete, t verso l'interno, h in altezza (metri). */
      const q = (lungo: number, dentro: number, h: number): Vettore => [o[0] + u[0] * lungo + n[0] * dentro, o[1] + u[1] * lungo + n[1] * dentro, h];
      poligoni.push(
        { tipo: "faccia", punti: [q(da, 0, alto), q(a, 0, alto), q(a, fondo, alto), q(da, fondo, alto)] }, // sopra
        { tipo: "faccia", punti: [q(da, 0, 0), q(da, fondo, 0), q(da, fondo, alto), q(da, 0, alto)] }, // fianco sinistro
        { tipo: "faccia", punti: [q(a, 0, 0), q(a, fondo, 0), q(a, fondo, alto), q(a, 0, alto)] }, // fianco destro
      );
      const altoPiano = alto / s.piani.length;
      s.piani.forEach((piano, i) => {
        const [su, giu] = [alto - i * altoPiano, alto - (i + 1) * altoPiano];
        const largoParte = (a - da) / piano.parti.length;
        piano.parti.forEach((nome, k) => {
          const [sx, dx] = [da + k * largoParte, da + (k + 1) * largoParte];
          const bottiglie = contenuti[nome]?.bottiglie ?? 0;
          massimo = Math.max(massimo, bottiglie);
          poligoni.push({ tipo: "cella", punti: [q(sx, fondo, giu), q(dx, fondo, giu), q(dx, fondo, su), q(sx, fondo, su)], nome, bottiglie });
        });
      });
      const sopra = q((da + a) / 2, fondo / 2, alto + 0.07);
      etichette.push({ testo: s.nome, ...p(...sopra) });
    }

    for (const o of locale.oggetti) {
      const [x0, x1, y0, y1, z0, z1] = [o.x / 100, (o.x + o.larghezza) / 100, o.y / 100, (o.y + o.profondita) / 100, o.z / 100, (o.z + o.altezza) / 100];
      poligoni.push(
        { tipo: "faccia", punti: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] }, // verso l'ingresso
        { tipo: "faccia", punti: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] }, // verso il fondo
        { tipo: "faccia", punti: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] }, // sinistra
        { tipo: "faccia", punti: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] }, // destra
      );
      const bottiglie = o.parte ? (contenuti[o.parte]?.bottiglie ?? 0) : 0;
      massimo = Math.max(massimo, bottiglie);
      const sopra: Vettore[] = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      poligoni.push(o.parte ? { tipo: "cella", punti: sopra, nome: o.parte, bottiglie } : { tipo: "faccia", punti: sopra });
      etichette.push({ testo: o.nome, ...p((x0 + x1) / 2, (y0 + y1) / 2, z1 + 0.07) });
    }

    const disegnati = poligoni
      .map((g) => {
        const punti = g.punti.map((v) => p(...v));
        return { g, punti, z: punti.reduce((somma, v) => somma + v.z, 0) / punti.length };
      })
      .sort((x, y) => y.z - x.z); // prima i più lontani

    const spigolo = (a: Vettore, b: Vettore) => {
      const [x, y] = [p(...a), p(...b)];
      return { x1: x.x, y1: x.y, x2: y.x, y2: y.y };
    };
    const spigoli = [
      ...[0, H].flatMap((h) => [
        spigolo([0, 0, h], [L, 0, h]),
        spigolo([L, 0, h], [L, P, h]),
        spigolo([L, P, h], [0, P, h]),
        spigolo([0, P, h], [0, 0, h]),
      ]),
      ...([[0, 0], [L, 0], [L, P], [0, P]] as const).map(([x, y]) => spigolo([x, y, 0], [x, y, H])),
    ];
    const margine = 0.14 / scala;
    return {
      disegnati,
      etichette,
      massimo,
      spigoli,
      pavimento: [p(0, 0, 0), p(L, 0, 0), p(L, P, 0), p(0, P, 0)],
      misure: [
        { testo: t("ingresso · {misura}", { misura: metri(L) }), ...p(L / 2, -margine, 0) },
        { testo: metri(P), ...p(L + margine, P / 2, 0) },
        { testo: metri(H), ...p(-margine * 0.6, -margine * 0.6, H / 2) },
      ],
    };
  }, [locale, contenuti, camera, spostamento, larghezza, altezza, t]);

  const bottiglieTotali = scena.disegnati.reduce((n, d) => n + (d.g.tipo === "cella" ? d.g.bottiglie : 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={contenitore}
        className="relative overflow-hidden rounded-xl bg-sfondo select-none"
        style={{ height: altezza, touchAction: "pan-y", cursor: "grab" }}
      >
        {spostata && (
          <button
            type="button"
            onClick={ricentra}
            className="absolute right-2 top-2 z-10 rounded-lg border border-bordo bg-carta/90 px-2 py-1 text-xs"
          >
            {t("Ricentra")}
          </button>
        )}
        <svg
          width={larghezza}
          height={altezza}
          viewBox={`0 0 ${larghezza} ${altezza}`}
          role="img"
          aria-label={t("Il locale in tre dimensioni: {scaffali} scaffali, {oggetti} oggetti, {bottiglie} bottiglie. Gli stessi dati sono nelle tabelle qui sotto.", { scaffali: locale.scaffali.length, oggetti: locale.oggetti.length, bottiglie: bottiglieTotali })}
        >
          <polygon points={scena.pavimento.map((v) => `${v.x},${v.y}`).join(" ")} fill="#efe7dc" />
          {scena.spigoli.map((s, i) => (
            <line key={i} {...s} stroke="#b9aea4" strokeWidth={1.2} />
          ))}
          {scena.misure.map((m) => (
            <text key={m.testo} x={m.x} y={m.y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#7a6f69">
              {m.testo}
            </text>
          ))}

          {scena.disegnati.map(({ g, punti }, i) => {
            const contorno = punti.map((v) => `${v.x},${v.y}`).join(" ");
            if (g.tipo === "faccia") return <polygon key={i} points={contorno} fill="#ddd2c5" stroke="#a8998c" strokeWidth={1} />;
            const colori = tinta(g.bottiglie, scena.massimo);
            const attiva = Boolean(g.nome) && g.nome === scelta;
            const cx = punti.reduce((n, v) => n + v.x, 0) / 4;
            const cy = punti.reduce((n, v) => n + v.y, 0) / 4;
            const alta = Math.hypot(punti[3].x - punti[0].x, punti[3].y - punti[0].y);
            const larga = Math.hypot(punti[1].x - punti[0].x, punti[1].y - punti[0].y);
            const conNome = alta >= 28 && larga >= 24;
            const corpo = Math.max(6, Math.min(15, alta * (conNome ? 0.42 : 0.6), larga * 0.45));
            return (
              <g
                key={i}
                onClick={suScelta && g.nome ? () => eUnTocco() && suScelta(g.nome) : undefined}
                style={{ cursor: suScelta && g.nome ? "pointer" : undefined }}
              >
                <polygon points={contorno} fill={colori.fondo} stroke={attiva ? "#2b2320" : "#a8998c"} strokeWidth={attiva ? 2.5 : 1} />
                {g.bottiglie > 0 && (
                  <text x={cx} y={cy - (conNome ? alta * 0.13 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={corpo} fontWeight={600} fill={colori.testo} pointerEvents="none">
                    {g.bottiglie}
                  </text>
                )}
                {(conNome || g.bottiglie === 0) && alta >= 12 && larga >= 16 && (
                  <text
                    x={cx}
                    y={g.bottiglie > 0 ? cy + alta * 0.3 : cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(6, Math.min(9, larga * 0.22, alta * 0.3))}
                    fill={colori.testo}
                    opacity={0.85}
                    pointerEvents="none"
                  >
                    {g.nome || "—"}
                  </text>
                )}
              </g>
            );
          })}

          {scena.etichette.map((e, i) => (
            <text key={i} x={e.x} y={e.y} textAnchor="middle" fontSize={11} fontWeight={600} fill="#2b2320" stroke="#f6f1ea" strokeWidth={3} paintOrder="stroke">
              {e.testo}
            </text>
          ))}
        </svg>
      </div>
      <p className="text-xs text-tenue">
        {suScelta
          ? t("Sul telefono ruota con due dita, pizzica per ingrandire e trascina con tre dita per spostare la vista; sul computer trascina. Il numero è quante bottiglie ci sono in quella parte del piano (più scuro = più pieno): toccala per vedere quali.")
          : t("Sul telefono ruota con due dita, pizzica per ingrandire e trascina con tre dita per spostare la vista; sul computer trascina. Il numero è quante bottiglie ci sono in quella parte del piano (più scuro = più pieno).")}
      </p>
    </div>
  );
}

"use client";

import {
  MASSIMO_OGGETTI,
  MASSIMO_PARTI,
  MASSIMO_PER_PARETE,
  MASSIMO_PIANI,
  PARETI,
  codiceParte,
  conflittiOggetti,
  disposizione,
  lunghezzaParete,
  nomeProposto,
  partiDi as tuttiINomi,
  partiDoppie,
  trovaPosto,
  type Locale,
  type Oggetto,
  type Parete,
  type Scaffale,
} from "@/lib/locale";
import { useT } from "@/lib/i18n/client";

// Il modulo con cui si disegna un luogo: le misure del locale e, per ogni scaffale, la parete a cui è
// appoggiato, le misure, il numero di piani e in quante parti (da 1 a 5) è diviso ogni piano, con i nomi.
// Poi gli oggetti liberi (tavolo, rack, cassa…): misure e posizione nello spazio del locale.
// Non salva nulla: consegna la bozza a chi lo contiene, che la mostra subito in 3D e la salva.

type Props = {
  bozza: Locale;
  suCambio: (l: Locale) => void;
  /** Le posizioni che esistono già nel luogo: si propongono come nomi delle parti. */
  codici: string[];
};

function Misura({
  nome,
  valore,
  unita,
  passo,
  suCambio,
}: {
  nome: string;
  valore: number;
  unita: string;
  passo: number;
  suCambio: (n: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="truncate">
        {nome} <span className="text-tenue">({unita})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={passo}
        value={Number.isFinite(valore) ? valore : ""}
        onChange={(e) => suCambio(e.target.value === "" ? NaN : Number(e.target.value))}
        className="campo min-h-10 px-2"
      />
    </label>
  );
}

export function EditorLocale({ bozza, suCambio, codici }: Props) {
  const t = useT();
  const scaffale = (i: number, modifiche: Partial<Scaffale>) =>
    suCambio({ ...bozza, scaffali: bozza.scaffali.map((s, k) => (k === i ? { ...s, ...modifiche } : s)) });

  const disp = disposizione(bozza);
  const quanti = (parete: Parete, tranne = -1) => bozza.scaffali.filter((x, k) => k !== tranne && x.parete === parete).length;
  const postoLibero = (parete: Parete, tranne = -1) => {
    const presi = new Set(bozza.scaffali.filter((x, k) => k !== tranne && x.parete === parete).map((x) => x.posto));
    return Array.from({ length: MASSIMO_PER_PARETE }, (_, k) => k + 1).find((p) => !presi.has(p));
  };
  const spazioRimasto = (parete: Parete) =>
    lunghezzaParete(bozza, parete) - Math.max(0, ...bozza.scaffali.filter((s) => s.parete === parete).map((s) => disp[s.id].fine));
  /**
   * Dove mettere un nuovo scaffale: la prima parete (fondo, sinistra, destra, ingresso) che ha un posto libero
   * e anche almeno 30 cm di spazio; se nessuna ne ha, la prima che ha almeno un posto libero.
   */
  const pareteConPosto =
    PARETI.find((p) => quanti(p.id) < MASSIMO_PER_PARETE && spazioRimasto(p.id) >= 30)?.id ??
    PARETI.find((p) => quanti(p.id) < MASSIMO_PER_PARETE)?.id;

  // Spostare uno scaffale su un'altra parete lo mette nel primo posto libero di quella parete.
  function cambiaParete(i: number, parete: Parete) {
    const posto = postoLibero(parete, i);
    if (posto) scaffale(i, { parete, posto, distanza: 0 });
  }

  // Sceglie un posto già preso da un altro scaffale della stessa parete: i due si scambiano.
  function cambiaPosto(i: number, nuovo: number) {
    const s = bozza.scaffali[i];
    const altro = bozza.scaffali.findIndex((x, k) => k !== i && x.parete === s.parete && x.posto === nuovo);
    suCambio({
      ...bozza,
      scaffali: bozza.scaffali.map((x, k) => (k === i ? { ...x, posto: nuovo } : k === altro ? { ...x, posto: s.posto } : x)),
    });
  }

  function aggiungi() {
    if (!pareteConPosto) return;
    const usate = new Set(bozza.scaffali.map((s) => s.nome.toUpperCase()));
    const nome = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !usate.has(l)) ?? `S${bozza.scaffali.length + 1}`;
    // Il nuovo scaffale va sulla prima parete con un posto libero, dopo quelli già presenti.
    const occupato = Math.max(0, ...bozza.scaffali.filter((s) => s.parete === pareteConPosto).map((s) => disp[s.id].fine));
    const libero = lunghezzaParete(bozza, pareteConPosto) - occupato;
    suCambio({
      ...bozza,
      scaffali: [
        ...bozza.scaffali,
        {
          id: crypto.randomUUID(),
          nome,
          parete: pareteConPosto,
          posto: postoLibero(pareteConPosto) ?? 1,
          distanza: 0,
          larghezza: libero >= 30 ? Math.min(100, libero) : 100,
          altezza: 180,
          profondita: 35,
          piani: Array.from({ length: 5 }, (_, i) => ({ parti: [nomeProposto(nome, i, 0, 1)] })),
        },
      ],
    });
  }

  function pianiDi(i: number, quanti: number) {
    const s = bozza.scaffali[i];
    const n = Math.min(MASSIMO_PIANI, Math.max(1, Math.round(quanti) || 1));
    // Un piano nuovo prende il primo nome libero (A3, A4…) e mai uno già usato: se si è tolto un piano in mezzo,
    // il numero dei piani non basta a dire quali nomi esistono, e le bottiglie comparirebbero in due punti.
    const usati = new Set(tuttiINomi(bozza));
    let prossimo = s.piani.length;
    const nomeLibero = () => {
      while (usati.has(nomeProposto(s.nome, prossimo, 0, 1))) prossimo++;
      const nome = nomeProposto(s.nome, prossimo++, 0, 1);
      usati.add(nome);
      return nome;
    };
    const piani = Array.from({ length: n }, (_, k) => s.piani[k] ?? { parti: [nomeLibero()] });
    scaffale(i, { piani });
  }

  /** Toglie un piano qualsiasi (anche uno in mezzo): gli altri restano come sono, con i loro nomi. */
  function togliPiano(i: number, piano: number) {
    const s = bozza.scaffali[i];
    if (s.piani.length <= 1) return;
    scaffale(i, { piani: s.piani.filter((_, k) => k !== piano) });
  }

  function partiDi(i: number, piano: number, quante: number) {
    const s = bozza.scaffali[i];
    const prima = s.piani[piano].parti;
    const parti = Array.from({ length: quante }, (_, k) => prima[k] || nomeProposto(s.nome, piano, k, quante));
    scaffale(i, { piani: s.piani.map((p, k) => (k === piano ? { parti } : p)) });
  }

  function nomeParte(i: number, piano: number, parte: number, nome: string) {
    const s = bozza.scaffali[i];
    scaffale(i, {
      piani: s.piani.map((p, k) => (k === piano ? { parti: p.parti.map((x, j) => (j === parte ? codiceParte(nome) : x)) } : p)),
    });
  }

  const doppie = partiDoppie(bozza);
  const conflitti = conflittiOggetti(bozza);

  const oggetto = (i: number, modifiche: Partial<Oggetto>) =>
    suCambio({ ...bozza, oggetti: bozza.oggetti.map((o, k) => (k === i ? { ...o, ...modifiche } : o)) });

  function aggiungiOggetto() {
    const [larghezza, profondita, altezza] = [80, 60, 80];
    // Nel primo posto libero sul pavimento; se non ce n'è, al centro (e il messaggio dice che si sovrappone).
    const posto = trovaPosto(bozza, larghezza, profondita) ?? {
      x: Math.max(0, Math.round((bozza.larghezza * 100 - larghezza) / 2)),
      y: Math.max(0, Math.round((bozza.profondita * 100 - profondita) / 2)),
    };
    const usati = new Set(bozza.oggetti.map((o) => o.nome.toLowerCase()));
    let n = bozza.oggetti.length + 1;
    while (usati.has(`oggetto ${n}`)) n++;
    suCambio({
      ...bozza,
      oggetti: [...bozza.oggetti, { id: crypto.randomUUID(), nome: `Oggetto ${n}`, ...posto, z: 0, larghezza, profondita, altezza, parte: "" }],
    });
  }

  function testoConflitto(c: (typeof conflitti)[number]) {
    if (c.tipo === "fuori") return t("«{nome}» esce dal locale.", { nome: c.oggetto });
    if (c.tipo === "troppo_alto") return t("«{nome}» è più alto del locale.", { nome: c.oggetto });
    return t("«{nome}» si sovrappone a «{con}».", { nome: c.oggetto, con: c.con });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("Il locale")}</legend>
        <div className="grid grid-cols-3 gap-2">
          <Misura nome={t("Larghezza")} unita="m" passo={0.1} valore={bozza.larghezza} suCambio={(n) => suCambio({ ...bozza, larghezza: n })} />
          <Misura nome={t("Profondità")} unita="m" passo={0.1} valore={bozza.profondita} suCambio={(n) => suCambio({ ...bozza, profondita: n })} />
          <Misura nome={t("Altezza")} unita="m" passo={0.1} valore={bozza.altezza} suCambio={(n) => suCambio({ ...bozza, altezza: n })} />
        </div>
        <p className="text-xs text-tenue">{t("La larghezza è quella della parete da cui si entra; la profondità va dall'ingresso al fondo.")}</p>
      </fieldset>

      <datalist id="posizioni-esistenti">
        {codici.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {bozza.scaffali.map((s, i) => {
        const parete = lunghezzaParete(bozza, s.parete);
        const esce = disp[s.id].fine > parete;
        const troppoAlto = s.altezza > bozza.altezza * 100;
        return (
          <fieldset key={s.id} className="flex flex-col gap-3 rounded-xl border border-bordo bg-sfondo p-3">
            <legend className="px-1 text-sm font-medium">{t("Scaffale {nome}", { nome: s.nome })}</legend>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <label className="flex flex-col gap-1 text-sm">
                {t("Nome")}
                <input value={s.nome} onChange={(e) => scaffale(i, { nome: e.target.value.slice(0, 20) })} className="campo min-h-10 px-2" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                {t("Appoggiato a")}
                <select value={s.parete} onChange={(e) => cambiaParete(i, e.target.value as Parete)} className="campo min-h-10 px-2">
                  {PARETI.map((p) => {
                    const piena = p.id !== s.parete && quanti(p.id, i) >= MASSIMO_PER_PARETE;
                    return (
                      <option key={p.id} value={p.id} disabled={piena}>
                        {piena ? t("{parete} (piena)", { parete: t(p.nome) }) : t(p.nome)}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                {t("Posto sulla parete")}
                <select value={s.posto} onChange={(e) => cambiaPosto(i, Number(e.target.value))} className="campo min-h-10 px-2">
                  {Array.from({ length: MASSIMO_PER_PARETE }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} / {MASSIMO_PER_PARETE}
                    </option>
                  ))}
                </select>
              </label>
              <Misura nome={t("Spazio prima")} unita="cm" passo={1} valore={s.distanza} suCambio={(n) => scaffale(i, { distanza: n })} />
            </div>
            <p className="text-xs text-tenue">
              {t("I posti vanno da sinistra a destra guardando la parete da dentro il locale (parete lunga {parete} cm). Ogni scaffale parte dove finisce il precedente, più lo spazio indicato.", { parete })}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Misura nome={t("Larghezza")} unita="cm" passo={1} valore={s.larghezza} suCambio={(n) => scaffale(i, { larghezza: n })} />
              <Misura nome={t("Altezza")} unita="cm" passo={1} valore={s.altezza} suCambio={(n) => scaffale(i, { altezza: n })} />
              <Misura nome={t("Profondità")} unita="cm" passo={1} valore={s.profondita} suCambio={(n) => scaffale(i, { profondita: n })} />
            </div>
            {(esce || troppoAlto) && (
              <p role="alert" className="rounded-lg bg-ambra/20 px-3 py-2 text-sm">
                {esce ? t("Così lo scaffale esce dalla parete, che è lunga {parete} cm.", { parete }) + " " : ""}
                {troppoAlto ? t("È più alto del locale.") : ""}
              </p>
            )}

            {/* Ogni scaffale ha i piani che ha davvero: da 1 a 12, si aggiungono e si tolgono uno alla volta. */}
            <div className="flex items-center gap-3 text-sm">
              <span>{t("Numero di piani")}</span>
              <span className="flex items-center gap-1" role="group" aria-label={t("Numero di piani")}>
                <button
                  type="button"
                  aria-label={t("Un piano in meno")}
                  disabled={s.piani.length <= 1}
                  onClick={() => pianiDi(i, s.piani.length - 1)}
                  className="min-h-10 w-10 rounded-lg border border-bordo bg-carta text-lg disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-8 text-center font-medium tabular-nums" aria-live="polite">
                  {s.piani.length}
                </span>
                <button
                  type="button"
                  aria-label={t("Un piano in più")}
                  disabled={s.piani.length >= MASSIMO_PIANI}
                  onClick={() => pianiDi(i, s.piani.length + 1)}
                  className="min-h-10 w-10 rounded-lg border border-bordo bg-carta text-lg disabled:opacity-40"
                >
                  +
                </button>
              </span>
            </div>

            <ol className="flex flex-col gap-2">
              {s.piani.map((p, k) => (
                <li key={k} className="flex flex-col gap-2 rounded-lg bg-carta p-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {t("Piano {n}", { n: k + 1 })} <span className="text-tenue">{k === 0 ? t("(in alto)") : k === s.piani.length - 1 ? t("(in basso)") : ""}</span>
                    </span>
                    <span className="flex items-center gap-1" role="group" aria-label={t("In quante parti è diviso il piano {n}", { n: k + 1 })}>
                      <span className="text-xs text-tenue">{t("parti")}</span>
                      {Array.from({ length: MASSIMO_PARTI }, (_, k) => k + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => partiDi(i, k, n)}
                          aria-pressed={p.parti.length === n}
                          className={`min-h-9 w-9 rounded-lg border text-sm ${p.parti.length === n ? "border-vino bg-vino font-medium text-white" : "border-bordo bg-sfondo"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${p.parti.length}, minmax(0, 1fr))` }}>
                    {p.parti.map((nome, j) => (
                      <input
                        key={j}
                        list="posizioni-esistenti"
                        value={nome}
                        onChange={(e) => nomeParte(i, k, j, e.target.value)}
                        className={`campo min-h-10 px-2 text-sm ${nome && doppie.includes(nome) ? "border-vino" : ""}`}
                        placeholder={t("nome")}
                        aria-label={t("Nome della parte {parte} del piano {piano} dello scaffale {scaffale}", { parte: j + 1, piano: k + 1, scaffale: s.nome })}
                        maxLength={20}
                      />
                    ))}
                  </div>
                  {s.piani.length > 1 && (
                    <button type="button" className="self-start text-xs text-vino underline" onClick={() => togliPiano(i, k)}>
                      {t("Togli il piano {n}", { n: k + 1 })}
                    </button>
                  )}
                </li>
              ))}
            </ol>

            <button
              type="button"
              className="self-start text-sm text-vino underline"
              onClick={() => suCambio({ ...bozza, scaffali: bozza.scaffali.filter((_, k) => k !== i) })}
            >
              {t("Togli lo scaffale {nome}", { nome: s.nome })}
            </button>
          </fieldset>
        );
      })}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t("Oggetti nel locale")}</legend>
        <p className="text-xs text-tenue">
          {t("Tavoli, rack, casse, botti: ogni oggetto ha le sue misure e una posizione nello spazio del locale, così puoi metterne quanti vuoi, anche staccati dalle pareti. La posizione è la distanza dalla parete sinistra e dall'ingresso (guardando verso il fondo); «da terra» serve per un oggetto appoggiato sopra un altro.")}
        </p>
        {bozza.oggetti.map((o, i) => (
          <div key={o.id} className="flex flex-col gap-3 rounded-xl border border-bordo bg-sfondo p-3">
            <label className="flex flex-col gap-1 text-sm">
              {t("Nome dell'oggetto")}
              <input value={o.nome} onChange={(e) => oggetto(i, { nome: e.target.value.slice(0, 30) })} className="campo min-h-10 px-2" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <Misura nome={t("Larghezza")} unita="cm" passo={1} valore={o.larghezza} suCambio={(n) => oggetto(i, { larghezza: n })} />
              <Misura nome={t("Profondità")} unita="cm" passo={1} valore={o.profondita} suCambio={(n) => oggetto(i, { profondita: n })} />
              <Misura nome={t("Altezza")} unita="cm" passo={1} valore={o.altezza} suCambio={(n) => oggetto(i, { altezza: n })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Misura nome={t("Dalla parete sinistra")} unita="cm" passo={1} valore={o.x} suCambio={(n) => oggetto(i, { x: n })} />
              <Misura nome={t("Dall'ingresso")} unita="cm" passo={1} valore={o.y} suCambio={(n) => oggetto(i, { y: n })} />
              <Misura nome={t("Da terra")} unita="cm" passo={1} valore={o.z} suCambio={(n) => oggetto(i, { z: n })} />
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("Nome della posizione (facoltativo)")}
              <input
                list="posizioni-esistenti"
                value={o.parte}
                onChange={(e) => oggetto(i, { parte: codiceParte(e.target.value) })}
                className={`campo min-h-10 px-2 ${o.parte && doppie.includes(o.parte) ? "border-vino" : ""}`}
                placeholder={t("nome")}
                maxLength={20}
              />
              <span className="text-xs text-tenue">{t("Se lo scrivi, l'oggetto conta le bottiglie di quella posizione, come una parte di scaffale.")}</span>
            </label>
            <button
              type="button"
              className="self-start text-sm text-vino underline"
              onClick={() => suCambio({ ...bozza, oggetti: bozza.oggetti.filter((_, k) => k !== i) })}
            >
              {t("Togli l'oggetto {nome}", { nome: o.nome })}
            </button>
          </div>
        ))}
        {conflitti.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 rounded-lg bg-ambra/20 px-3 py-2 text-sm">
            {conflitti.map((c, k) => (
              <li key={k}>{testoConflitto(c)}</li>
            ))}
          </ul>
        )}
        {bozza.oggetti.length < MASSIMO_OGGETTI ? (
          <button type="button" className="rounded-xl border border-bordo bg-carta px-4 py-3 text-sm font-medium" onClick={aggiungiOggetto}>
            {t("+ Aggiungi un oggetto")}
          </button>
        ) : (
          <p className="text-sm text-tenue">{t("Hai raggiunto il massimo di {n} oggetti.", { n: MASSIMO_OGGETTI })}</p>
        )}
      </fieldset>

      {doppie.length > 0 && (
        <p role="alert" className="rounded-lg bg-ambra/20 px-3 py-2 text-sm">
          {doppie.length === 1
            ? t("Il nome {nomi} è usato in più parti: le stesse bottiglie comparirebbero in più punti del disegno.", { nomi: doppie.join(", ") })
            : t("I nomi {nomi} sono usati in più parti: le stesse bottiglie comparirebbero in più punti del disegno.", { nomi: doppie.join(", ") })}
        </p>
      )}

      {pareteConPosto ? (
        <button type="button" className="rounded-xl border border-bordo bg-carta px-4 py-3 text-sm font-medium" onClick={aggiungi}>
          {t("+ Aggiungi uno scaffale")}
        </button>
      ) : (
        <p className="text-sm text-tenue">{t("Tutte le pareti hanno già {n} scaffali.", { n: MASSIMO_PER_PARETE })}</p>
      )}
      <p className="text-xs text-tenue">
        {t("Il nome di una parte è la posizione delle bottiglie: se scrivi una posizione che esiste già (per esempio A1) il disegno mostra subito le sue bottiglie; un nome nuovo diventa una nuova posizione di questo luogo.")}
      </p>
    </div>
  );
}

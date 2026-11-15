"use client";

import { useRef, useState } from "react";
import type { Posizione } from "./Spazio3D";
import { VistaSpazio } from "./VistaSpazio";
import { useT } from "@/lib/i18n/client";
import { ASSI, MASSIMO, categoriaDi, categorieDi, coloreDi, racconto, type Parte, type Punto } from "@/lib/spazio";

// Editor dello spazio 3D di una parte della degustazione (olfatto o bocca).
// Si aggiunge un punto scegliendo cosa si sente (dalla ruota degli aromi, o scrivendolo) e dove sta
// nello spazio con tre cursori: persistenza, ampiezza, intensità. I punti sono in ordine di percezione
// Nel parallelepipedo si può anche toccare un pallino della griglia: se un punto è aperto lo sposta lì,
// altrimenti fissa la posizione del prossimo profumo, che poi si sceglie dall'elenco.
// I punti si possono spostare su e giù nell'ordine. Ogni punto può avere un commento, scritto o dettato a voce.
// Sotto, il racconto scritto si aggiorna da solo.

type Props = {
  parte: Parte;
  punti: Punto[];
  suCambio: (punti: Punto[]) => void;
  /** Detto al riconoscitore vocale per i commenti: aiuta con i nomi propri. */
  vino?: string;
};

const NUOVO = { intensita: 3, ampiezza: 3, persistenza: 3 };

export function EditorSpazio({ parte, punti, suCambio, vino }: Props) {
  const t = useT();
  const categorie = categorieDi(parte);
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [libero, setLibero] = useState("");
  const [posizione, setPosizione] = useState<Posizione | null>(null);
  const pannelloAggiungi = useRef<HTMLDivElement>(null);
  const [microfono, setMicrofono] = useState<"fermo" | "registro" | "trascrivo">("fermo");
  const [avviso, setAvviso] = useState("");
  const registratore = useRef<MediaRecorder | null>(null);

  const attuale = punti.find((p) => p.id === selezionato) ?? null;
  const cambia = (id: string, modifiche: Partial<Punto>) =>
    suCambio(punti.map((p) => (p.id === id ? { ...p, ...modifiche } : p)));

  function aggiungi(nome: string, cat?: string) {
    const pulito = nome.trim();
    if (!pulito) return;
    const id = crypto.randomUUID();
    // Il nuovo punto parte vicino all'ultimo: di solito il profumo successivo non è lontanissimo dal precedente.
    // Se invece la posizione è stata scelta toccando la griglia, va esattamente lì.
    const base = posizione ?? punti[punti.length - 1] ?? NUOVO;
    suCambio([
      ...punti,
      {
        id,
        nome: pulito.slice(0, 60),
        categoria: cat ?? categoriaDi(pulito, parte),
        intensita: base.intensita,
        ampiezza: base.ampiezza,
        persistenza: base.persistenza,
      },
    ]);
    // Con la posizione già scelta il punto è a posto: resta chiuso, così il tocco successivo sulla griglia
    // prepara il profumo seguente invece di spostare questo.
    setSelezionato(posizione ? null : id);
    setPosizione(null);
    setLibero("");
  }

  function seleziona(id: string | null) {
    setSelezionato(id);
    setPosizione(null);
  }

  function toccoGriglia(p: Posizione) {
    if (attuale) {
      cambia(attuale.id, p);
      return;
    }
    setPosizione(p);
    pannelloAggiungi.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function sposta(id: string, verso: -1 | 1) {
    const i = punti.findIndex((p) => p.id === id);
    const j = i + verso;
    if (i < 0 || j < 0 || j >= punti.length) return;
    const copia = [...punti];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    suCambio(copia);
  }

  async function detta() {
    if (!attuale) return;
    setAvviso("");
    if (microfono === "registro") {
      registratore.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAvviso(t("Questo browser non permette di registrare: scrivi il commento."));
      return;
    }
    let flusso: MediaStream;
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setAvviso(t("Serve il permesso di usare il microfono."));
      return;
    }
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime));
    const r = new MediaRecorder(flusso, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
    const pezzi: Blob[] = [];
    const idPunto = attuale.id;
    const commentoPrima = attuale.commento ?? "";
    r.ondataavailable = (e) => {
      if (e.data.size > 0) pezzi.push(e.data);
    };
    r.onstop = async () => {
      flusso.getTracks().forEach((traccia) => traccia.stop());
      setMicrofono("trascrivo");
      try {
        const corpo = new FormData();
        corpo.append("audio", new Blob(pezzi, { type: r.mimeType || "audio/webm" }), "commento");
        corpo.append("contesto", [vino, attuale.nome].filter(Boolean).join(", "));
        const risposta = await fetch("/api/degustazioni/commento", { method: "POST", body: corpo });
        const json = (await risposta.json().catch(() => null)) as { testo?: string; messaggio?: string } | null;
        if (risposta.ok && json?.testo) {
          // Il dettato si aggiunge a ciò che c'era già, non lo sostituisce.
          cambia(idPunto, { commento: [commentoPrima, json.testo].filter(Boolean).join(" ").slice(0, 600) });
        } else {
          setAvviso(json?.messaggio ?? t("Non sono riuscito a trascrivere. Riprova o scrivi a mano."));
        }
      } catch {
        setAvviso(t("Manca la rete: scrivi il commento a mano."));
      } finally {
        setMicrofono("fermo");
      }
    };
    registratore.current = r;
    r.start();
    setMicrofono("registro");
    // Un commento è breve: dopo 30 secondi la registrazione si ferma da sola.
    window.setTimeout(() => r.state === "recording" && r.stop(), 30_000);
  }

  const testo = racconto(punti, parte, t);

  return (
    <div className="flex flex-col gap-3">
      <VistaSpazio punti={punti} selezionato={selezionato} suSelezione={seleziona} posizione={posizione} suPosizione={toccoGriglia} />
      <p className="text-sm text-tenue">
        {attuale
          ? t("Tocca un pallino della griglia per spostare lì «{nome}».", { nome: t(attuale.nome) })
          : parte === "olfatto"
            ? t("Tocca un pallino della griglia per scegliere dove mettere il prossimo profumo.")
            : t("Tocca un pallino della griglia per scegliere dove mettere il prossimo gusto o aroma.")}
      </p>

      {punti.length > 0 && (
        <ol className="flex flex-col gap-1">
          {punti.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-2 rounded-xl px-2 ${p.id === selezionato ? "bg-ambra/20" : "bg-sfondo"}`}>
              <button
                type="button"
                onClick={() => seleziona(p.id === selezionato ? null : p.id)}
                aria-expanded={p.id === selezionato}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: coloreDi(p.categoria) }} />
                <span className="truncate">
                  {i + 1}. {t(p.nome)}
                  {p.commento && (
                    <span className="text-vino" title={p.commento}>
                      {" "}
                      ❝
                    </span>
                  )}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-tenue">
                  {p.persistenza} · {p.ampiezza} · {p.intensita}
                </span>
              </button>
              <button type="button" className="px-1 text-tenue disabled:opacity-30" disabled={i === 0} onClick={() => sposta(p.id, -1)} aria-label={t("Sposta {nome} prima", { nome: t(p.nome) })}>
                ↑
              </button>
              <button type="button" className="px-1 text-tenue disabled:opacity-30" disabled={i === punti.length - 1} onClick={() => sposta(p.id, 1)} aria-label={t("Sposta {nome} dopo", { nome: t(p.nome) })}>
                ↓
              </button>
            </li>
          ))}
        </ol>
      )}
      {punti.length > 0 && <p className="text-xs text-tenue">{t("Ordine in cui li senti · numeri: persistenza · ampiezza · intensità.")}</p>}

      {attuale && (
        <div className="flex flex-col gap-3 rounded-xl border border-bordo bg-carta p-3">
          <p className="font-medium">{t(attuale.nome)}</p>
          {ASSI.map((asse) => (
            <label key={asse.id} className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between">
                <span>{t(asse.nome)}</span>
                <span className="tabular-nums">{attuale[asse.id]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={MASSIMO}
                step={0.5}
                value={attuale[asse.id]}
                onChange={(e) => cambia(attuale.id, { [asse.id]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("Commento (come una nota a margine)")}</span>
            <textarea
              value={attuale.commento ?? ""}
              onChange={(e) => cambia(attuale.id, { commento: e.target.value.slice(0, 600) })}
              className="campo min-h-16 py-2"
              placeholder={t("es. esce dopo qualche minuto nel bicchiere")}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="rounded-lg border border-bordo bg-sfondo px-3 py-2 text-sm" onClick={detta} disabled={microfono === "trascrivo"}>
              {microfono === "registro" ? t("Ferma e trascrivi") : microfono === "trascrivo" ? t("Trascrivo…") : t("Detta il commento")}
            </button>
            <button
              type="button"
              className="text-sm text-vino underline"
              onClick={() => {
                suCambio(punti.filter((p) => p.id !== attuale.id));
                setSelezionato(null);
              }}
            >
              {t("Togli il punto")}
            </button>
          </div>
          {avviso && (
            <p role="alert" className="text-sm text-vino-scuro">
              {avviso}
            </p>
          )}
        </div>
      )}

      <div ref={pannelloAggiungi} className="flex flex-col gap-2 rounded-xl bg-sfondo p-3">
        <p className="text-sm font-medium">{parte === "olfatto" ? t("Aggiungi un profumo") : t("Aggiungi un gusto o aroma")}</p>
        {posizione && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-vino/10 px-3 py-2 text-sm" role="status">
            <span>
              {parte === "olfatto"
                ? t("Posizione scelta: persistenza {persistenza} · ampiezza {ampiezza} · intensità {intensita}. Ora scegli il profumo.", posizione)
                : t("Posizione scelta: persistenza {persistenza} · ampiezza {ampiezza} · intensità {intensita}. Ora scegli il gusto o aroma.", posizione)}
            </span>
            <button type="button" className="text-vino underline" onClick={() => setPosizione(null)}>
              {t("Annulla")}
            </button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {categorie.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoria(categoria === c.id ? null : c.id)}
              aria-pressed={categoria === c.id}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${categoria === c.id ? "border-inchiostro bg-carta font-medium" : "border-bordo bg-carta"}`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.colore }} />
              {t(c.nome)}
            </button>
          ))}
        </div>
        {categoria && (
          <div className="flex flex-wrap gap-2">
            {/* Si può restare sulla famiglia ("Floreali") senza scendere al profumo specifico. */}
            <button
              type="button"
              onClick={() => aggiungi(categorie.find((c) => c.id === categoria)!.nome, categoria)}
              className="rounded-lg border border-inchiostro bg-carta px-3 py-2 text-sm font-medium"
            >
              {t("{categoria} (in generale)", { categoria: t(categorie.find((c) => c.id === categoria)!.nome) })}
            </button>
            {categorie
              .find((c) => c.id === categoria)!
              .voci.map((v) => (
                <button key={v} type="button" onClick={() => aggiungi(v, categoria)} className="rounded-lg bg-carta px-3 py-2 text-sm shadow-sm">
                  {t(v)}
                </button>
              ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={libero}
            onChange={(e) => setLibero(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // non deve salvare tutta la degustazione
                aggiungi(libero);
              }
            }}
            className="campo"
            placeholder={t("oppure scrivilo tu")}
            maxLength={60}
            aria-label={parte === "olfatto" ? t("Altro profumo") : t("Altro gusto o aroma")}
          />
          <button type="button" className="pulsante" onClick={() => aggiungi(libero)} disabled={!libero.trim()}>
            {t("Aggiungi")}
          </button>
        </div>
      </div>

      {testo && (
        <div className="rounded-xl bg-ambra/15 p-3 text-sm">
          <p className="mb-1 font-medium">{t("Il racconto")}</p>
          <p>{testo}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Dinamica } from "@/lib/degustazione";
import { useT } from "@/lib/i18n/client";

// Registra la degustazione a voce e la fa trasformare in curve. Il risultato è una proposta
// che riempie il modulo: chi degusta la controlla, corregge e salva.

export type ProposteDaVocale = {
  trascrizione: string;
  audio: string | null;
  dinamica?: Dinamica;
  descrittori?: string[];
  note?: string;
  punteggio?: number | null;
};

const DURATA_MASSIMA = 120; // secondi: oltre, il file supera il limite di invio

export function RegistraVocale({
  cantinaId,
  vinoId,
  vino,
  suRisultato,
}: {
  cantinaId: string;
  /** Assente quando si degusta un vino che non è in cantina. */
  vinoId?: string;
  /** Nome del vino, per aiutare il riconoscitore con i nomi propri. */
  vino?: string;
  suRisultato: (p: ProposteDaVocale) => void;
}) {
  const t = useT();
  const [stato, setStato] = useState<"fermo" | "registro" | "elaboro">("fermo");
  const [secondi, setSecondi] = useState(0);
  const [messaggio, setMessaggio] = useState("");
  const registratore = useRef<MediaRecorder | null>(null);
  const pezzi = useRef<Blob[]>([]);
  const orologio = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (orologio.current) window.clearInterval(orologio.current);
      registratore.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function inizia() {
    setMessaggio("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessaggio(t("Questo browser non permette di registrare. Compila a mano."));
      return;
    }
    let flusso: MediaStream;
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessaggio(t("Serve il permesso di usare il microfono: concedilo dalle impostazioni del browser e riprova."));
      return;
    }
    // Android e computer registrano in webm, iPhone in mp4: si prende ciò che il dispositivo sa fare.
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(flusso, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
    pezzi.current = [];
    r.ondataavailable = (e) => {
      if (e.data.size > 0) pezzi.current.push(e.data);
    };
    r.onstop = () => {
      flusso.getTracks().forEach((t) => t.stop());
      void invia(new Blob(pezzi.current, { type: r.mimeType || "audio/webm" }));
    };
    registratore.current = r;
    r.start();
    setSecondi(0);
    setStato("registro");
    orologio.current = window.setInterval(() => {
      setSecondi((s) => {
        if (s + 1 >= DURATA_MASSIMA) ferma();
        return s + 1;
      });
    }, 1000);
  }

  function ferma() {
    if (orologio.current) window.clearInterval(orologio.current);
    orologio.current = null;
    if (registratore.current?.state === "recording") registratore.current.stop();
  }

  async function invia(audio: Blob) {
    setStato("elaboro");
    try {
      const corpo = new FormData();
      corpo.append("audio", audio, "vocale");
      corpo.append("cantina_id", cantinaId);
      if (vinoId) corpo.append("vino_id", vinoId);
      if (vino) corpo.append("vino", vino);
      const risposta = await fetch("/api/degustazioni/vocale", { method: "POST", body: corpo });
      const json = (await risposta.json().catch(() => null)) as
        | (ProposteDaVocale & { ok?: boolean; messaggio?: string })
        | null;
      if (!json) {
        setMessaggio(t("Non sono riuscito a elaborare il vocale. Riprova."));
      } else if (!risposta.ok) {
        setMessaggio(json.messaggio ?? t("Non sono riuscito a elaborare il vocale. Riprova."));
        // Se almeno la trascrizione c'è, finisce negli appunti: nulla di ciò che è stato detto va perso.
        if (json.trascrizione) suRisultato({ trascrizione: json.trascrizione, audio: json.audio ?? null });
      } else {
        suRisultato(json);
        setMessaggio("");
      }
    } catch {
      setMessaggio(t("Manca la rete: il vocale ha bisogno del segnale per essere trascritto. Compila a mano o riprova."));
    } finally {
      setStato("fermo");
    }
  }

  const minuti = `${Math.floor(secondi / 60)}:${String(secondi % 60).padStart(2, "0")}`;

  return (
    <section className="scheda flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t("Dettala a voce")}</h2>
      {stato === "fermo" && (
        <button type="button" className="pulsante" onClick={inizia}>
          {t("Registra la degustazione")}
        </button>
      )}
      {stato === "registro" && (
        <button type="button" className="pulsante" onClick={ferma}>
          {t("Ferma ({minuti})", { minuti })}
        </button>
      )}
      {stato === "elaboro" && (
        <p className="rounded-xl bg-ambra/15 p-3 text-sm" role="status">
          {t("Trascrivo e leggo la degustazione…")}
        </p>
      )}
      {messaggio && (
        <p role="alert" className="text-sm text-vino-scuro">
          {messaggio}
        </p>
      )}
      <p className="text-xs text-tenue">
        {t("Racconta come si muove il vino in bocca: «entra morbido, a centro bocca esce l'acidità, chiude sapido e lungo», e gli aromi che senti. Al massimo due minuti. Poi controlli e correggi qui sotto.")}
      </p>
    </section>
  );
}

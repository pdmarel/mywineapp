"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLingua } from "@/lib/i18n/client";
import { daTradurre } from "@/lib/i18n/lingue";
import {
  EVENTO_SOSPESI,
  elencoSospesi,
  inviaSospesi,
  scartaSospeso,
  type EsitoInvio,
  type Sospeso,
} from "@/lib/sospesi";

// Striscia sotto la testata: dice se manca la rete e quante bottiglie aspettano di essere inviate.
// Riprova da sola quando torna il segnale, quando si riapre l'app e ogni minuto finché c'è qualcosa in coda.

const SPIEGAZIONE: Record<NonNullable<EsitoInvio["motivo"]>, string> = {
  rete: daTradurre("Manca la rete: riprovo da solo appena torna."),
  accesso: daTradurre("La sessione è scaduta: rientra con la tua email e l'invio riparte."),
  errore: daTradurre("Qualcosa non è andato: tocca «Invia ora» per riprovare."),
};

export function IndicatoreSospesi() {
  const { t, locale } = useLingua();
  const router = useRouter();
  const percorso = usePathname();
  const [coda, setCoda] = useState<Sospeso[]>([]);
  const [inRete, setInRete] = useState(true);
  const [invio, setInvio] = useState(false);
  const [motivo, setMotivo] = useState<EsitoInvio["motivo"]>();
  const [aperto, setAperto] = useState(false);
  const occupato = useRef(false);

  const rileggi = useCallback(async () => {
    try {
      setCoda(await elencoSospesi());
    } catch {
      // archivio del telefono non disponibile (es. navigazione privata): nessuna coda da mostrare
    }
  }, []);

  const prova = useCallback(async () => {
    if (occupato.current) return;
    occupato.current = true;
    setInvio(true);
    try {
      const esito = await inviaSospesi();
      setMotivo(esito.rimasti > 0 ? esito.motivo : undefined);
      // Qualcosa è arrivato al server: le pagine con elenchi vanno rilette.
      if (esito.inviati > 0) router.refresh();
    } catch {
      setMotivo("errore");
    } finally {
      occupato.current = false;
      setInvio(false);
      void rileggi();
    }
  }, [rileggi, router]);

  useEffect(() => {
    const online = () => {
      setInRete(true);
      void prova();
    };
    const offline = () => setInRete(false);
    const visibile = () => {
      if (document.visibilityState === "visible") void prova();
    };
    const cambiati = () => void rileggi();

    // Stato iniziale letto dal telefono al montaggio: è la sincronizzazione con un sistema esterno.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInRete(navigator.onLine);
    void rileggi().then(() => prova());

    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener(EVENTO_SOSPESI, cambiati);
    document.addEventListener("visibilitychange", visibile);
    const orologio = window.setInterval(() => {
      if (navigator.onLine) void prova();
    }, 60_000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener(EVENTO_SOSPESI, cambiati);
      document.removeEventListener("visibilitychange", visibile);
      window.clearInterval(orologio);
    };
  }, [prova, rileggi]);

  if (coda.length === 0 && inRete) return null;

  return (
    <div className="border-b border-bordo bg-ambra/20" role="status" aria-live="polite">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>
            {!inRete && <strong>{t("Senza rete.")} </strong>}
            {coda.length > 0 ? (
              <>
                <strong>
                  {coda.length === 1
                    ? t("{n} bottiglia in sospeso sul telefono.", { n: coda.length })
                    : t("{n} bottiglie in sospeso sul telefono.", { n: coda.length })}
                </strong>
                {invio ? ` ${t("Invio in corso…")}` : ""}
              </>
            ) : (
              t("Puoi inserire bottiglie: restano sul telefono fino al ritorno del segnale.")
            )}
          </span>
          {coda.length > 0 && (
            <span className="flex shrink-0 items-center gap-3">
              <button type="button" className="text-vino underline" onClick={() => setAperto((a) => !a)}>
                {aperto ? t("Nascondi") : t("Vedi")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-vino px-3 py-1 font-medium text-white disabled:opacity-60"
                disabled={invio}
                onClick={() => void prova()}
              >
                {t("Invia ora")}
              </button>
            </span>
          )}
        </div>

        {coda.length > 0 && motivo && !invio && <p className="text-xs">{t(SPIEGAZIONE[motivo])}</p>}

        {/* Collegamento normale (non Link): deve riuscire a aprire la pagina anche senza rete. */}
        {!inRete && percorso !== "/inserimento" && (
          <p className="text-xs">
            <a href="/inserimento" className="font-medium text-vino underline">
              {t("Inserisci una bottiglia")}
            </a>
          </p>
        )}

        {aperto && coda.length > 0 && (
          <ul className="flex flex-col gap-1">
            {coda.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 rounded-lg bg-carta px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.titolo}</span>
                  <span className="block text-xs text-tenue">
                    {t("{n} bott. · inserita alle {ora}", {
                      n: s.quantita,
                      ora: new Date(s.creatoIl).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
                    })}
                    {s.tentativi > 0 && s.errore ? ` · ${t("ultimo tentativo: {errore}", { errore: t(s.errore) })}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-vino underline"
                  onClick={() => {
                    if (window.confirm(t("Scartare «{titolo}»? Non verrà inviata e le sue foto andranno perse.", { titolo: s.titolo }))) {
                      void scartaSospeso(s.id);
                    }
                  }}
                >
                  {t("Scarta")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

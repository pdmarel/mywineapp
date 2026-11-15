"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Client Supabase per il browser: usa la sessione dell'utente (stessi cookie del server).
// Serve per caricare le foto direttamente nell'archivio, senza farle passare dal server dell'app.
//
// Ogni richiesta ha un limite di tempo. Con poco segnale una richiesta non fallisce: resta appesa, e senza
// limite tutto ciò che la aspetta (l'invio delle bottiglie in coda, il pulsante «Invia ora») resta bloccato.
// Scaduto il tempo la richiesta si interrompe e viene trattata come «manca la rete»: si riprova più tardi.

const LIMITE_MS = 25_000;
const LIMITE_ARCHIVIO_MS = 90_000; // le foto sono file da caricare: con poco segnale ci vuole di più

function fetchConLimite(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const indirizzo = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const limite = indirizzo.includes("/storage/v1/") ? LIMITE_ARCHIVIO_MS : LIMITE_MS;
  const controllo = new AbortController();
  const originale = init?.signal;
  if (originale) {
    if (originale.aborted) controllo.abort(originale.reason);
    else originale.addEventListener("abort", () => controllo.abort(originale.reason), { once: true });
  }
  let orologio: ReturnType<typeof setTimeout>;
  // Oltre ad interrompere la richiesta, si smette di aspettarla comunque: non si dipende dal fatto che
  // la rete (o un'estensione del browser) rispetti l'interruzione.
  const scaduta = new Promise<never>((_, ko) => {
    orologio = setTimeout(() => {
      const errore = new DOMException("Timeout", "TimeoutError");
      controllo.abort(errore);
      ko(errore);
    }, limite);
  });
  return Promise.race([fetch(input, { ...init, signal: controllo.signal }), scaduta]).finally(() => clearTimeout(orologio));
}

export function creaClientBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: fetchConLimite } });
}

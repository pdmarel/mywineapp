// Chiedere al server la lettura di un'etichetta, dal browser, senza accavallare le richieste.
// Il servizio gratuito ha un tetto di lavoro al minuto: se le letture partono tutte insieme (tante bottiglie
// inserite di fila) quasi tutte vengono respinte. Qui partono una alla volta, con una pausa tra l'una e l'altra.

export const PAUSA_TRA_LETTURE = 10_000;
export const PAUSA_SE_SATURO = 35_000;

export type EsitoRichiesta = "ok" | "saturo" | "errore";

export const aspetta = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

export async function chiediLettura(vinoId: string, automatica: boolean): Promise<EsitoRichiesta> {
  try {
    const r = await fetch(`/api/vini/${vinoId}/leggi${automatica ? "?auto=1" : ""}`, { method: "POST" });
    return r.ok ? "ok" : r.status === 429 ? "saturo" : "errore";
  } catch {
    return "errore";
  }
}

let fila: Promise<void> = Promise.resolve();

/** Mette in fila la lettura automatica di una bottiglia appena inserita. Non aspetta e non fallisce mai. */
export function accodaLettura(vinoId: string) {
  fila = fila
    .then(async () => {
      let esito = await chiediLettura(vinoId, true);
      if (esito === "saturo") {
        await aspetta(PAUSA_SE_SATURO);
        esito = await chiediLettura(vinoId, true);
      }
      await aspetta(PAUSA_TRA_LETTURE);
    })
    .catch(() => {});
}

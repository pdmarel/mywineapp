import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormVino } from "@/components/FormVino";
import { LetturaEtichetta } from "@/components/LetturaEtichetta";
import { PrezzoVino } from "@/components/PrezzoVino";
import { PulsanteConConferma } from "@/components/PulsanteConConferma";
import { Testata } from "@/components/Testata";
import { daTradurre } from "@/lib/i18n/lingue";
import { traduzione } from "@/lib/i18n/server";
import { creaClientServer } from "@/lib/supabase/server";
import {
  BUCKET_ETICHETTE,
  bottiglieTotali,
  confrontaCodici,
  titoloVino,
  type PosizioneScelta,
  type Vino,
} from "@/lib/vini";
import {
  aggiornaVino,
  aggiungiGiacenza,
  cambiaQuantita,
  eliminaVino,
  salvaPrezzoManuale,
  spostaBottiglie,
} from "../../azioni-vini";

const MESSAGGI: Record<string, string> = {
  posizione: daTradurre("Scegli una posizione."),
  prezzo: daTradurre("Scrivi un prezzo valido, per esempio 24,50."),
  stessa_posizione: daTradurre("Le bottiglie sono già in quella posizione."),
  niente_da_spostare: daTradurre("In quella posizione non ci sono bottiglie da spostare."),
  salvataggio: daTradurre("Non sono riuscito a salvare. Riprova."),
};

type LuogoConPosizioni = {
  nome: string;
  posizioni: { id: string; codice: string }[];
};

export default async function PaginaVino({
  params,
  searchParams,
}: PageProps<"/cantine/[id]/vini/[vinoId]">) {
  const { id, vinoId } = await params;
  const parametri = await searchParams;
  const { t, locale } = await traduzione();
  const errore =
    typeof parametri.errore === "string" && MESSAGGI[parametri.errore]
      ? t(MESSAGGI[parametri.errore])
      : undefined;
  const salvato = parametri.salvato === "1";

  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: cantina }, { data: riga }] = await Promise.all([
    supabase
      .from("cantine")
      .select("id, nome, luoghi(nome, posizioni(id, codice))")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("vini")
      .select(
        "id, cantina_id, nome_fantasia, denominazione, annata, produttore, tipologia, alcool, capacita_cl, vitigni, foto_fronte, foto_retro, stato, estrazione, errore, giacenze(id, quantita, posizioni(id, codice, luoghi(id, nome)))",
      )
      .eq("id", vinoId)
      .eq("cantina_id", id)
      .maybeSingle(),
  ]);
  if (!cantina || !riga) notFound();
  const vino = riga as unknown as Vino;

  const posizioni: PosizioneScelta[] = (
    (cantina.luoghi ?? []) as LuogoConPosizioni[]
  )
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"))
    .flatMap((luogo) =>
      [...luogo.posizioni]
        .sort((a, b) => confrontaCodici(a.codice, b.codice))
        .map((p) => ({ id: p.id, codice: p.codice, luogo: luogo.nome })),
    );
  const luoghi = Array.from(new Set(posizioni.map((p) => p.luogo)));

  // Foto: archivio privato, indirizzi firmati validi un'ora.
  const anteprime: { fronte?: string; retro?: string } = {};
  const percorsi = [vino.foto_fronte, vino.foto_retro].filter(
    Boolean,
  ) as string[];
  if (percorsi.length > 0) {
    const { data: firmati } = await supabase.storage
      .from(BUCKET_ETICHETTE)
      .createSignedUrls(percorsi, 3600);
    for (const f of firmati ?? []) {
      if (f.path === vino.foto_fronte && f.signedUrl)
        anteprime.fronte = f.signedUrl;
      if (f.path === vino.foto_retro && f.signedUrl)
        anteprime.retro = f.signedUrl;
    }
  }

  // Proposta della lettura automatica: riempie nel modulo solo i campi ancora vuoti.
  // Diventa definitiva soltanto quando l'utente salva.
  const proposta =
    vino.stato === "da_confermare" ? (vino.estrazione?.dati ?? null) : null;
  const vinoPerModulo: Vino = proposta
    ? {
        ...vino,
        nome_fantasia: vino.nome_fantasia ?? proposta.nome_fantasia ?? null,
        denominazione: vino.denominazione ?? proposta.denominazione ?? null,
        produttore: vino.produttore ?? proposta.produttore ?? null,
        annata: vino.annata ?? proposta.annata ?? null,
        tipologia: vino.tipologia ?? proposta.tipologia ?? null,
        alcool: vino.alcool ?? proposta.alcool ?? null,
        capacita_cl: vino.capacita_cl ?? proposta.capacita_cl ?? null,
        vitigni: vino.vitigni ?? proposta.vitigni ?? null,
      }
    : vino;

  // Possibili doppioni: stesso produttore, nome e annata in un'altra scheda della cantina.
  const normale = (t: string | null | undefined) =>
    (t ?? "").trim().toLowerCase();
  let doppioni: {
    id: string;
    nome_fantasia: string | null;
    annata: number | null;
    capacita_cl: number | null;
  }[] = [];
  if (
    normale(vinoPerModulo.produttore) &&
    (normale(vinoPerModulo.nome_fantasia) ||
      normale(vinoPerModulo.denominazione))
  ) {
    const { data: altri } = await supabase
      .from("vini")
      .select(
        "id, nome_fantasia, denominazione, produttore, annata, capacita_cl",
      )
      .eq("cantina_id", id)
      .neq("id", vinoId)
      .ilike("produttore", vinoPerModulo.produttore!.trim());
    doppioni = (altri ?? []).filter(
      (a) =>
        normale(a.nome_fantasia) === normale(vinoPerModulo.nome_fantasia) &&
        normale(a.denominazione) === normale(vinoPerModulo.denominazione) &&
        (a.annata ?? null) === (vinoPerModulo.annata ?? null) &&
        (a.capacita_cl ?? 75) === (vinoPerModulo.capacita_cl ?? 75),
    );
  }
  const haFoto = Boolean(vino.foto_fronte || vino.foto_retro);

  // Storico dei prezzi: l'ultimo valido fa testo; l'ultima ricerca dice se è recente o andata a vuoto.
  const { data: storico } = await supabase
    .from("prezzi")
    .select("prezzo, annata_trovata, fonte, url, metodo, rilevato_il")
    .eq("vino_id", vinoId)
    .order("rilevato_il", { ascending: false })
    .limit(10);
  const ultimoPrezzo = (storico ?? []).find((p) => p.prezzo !== null) ?? null;
  const ultimaRicerca = (storico ?? [])[0] ?? null;
  const euro = (n: number) =>
    n.toLocaleString(locale, { style: "currency", currency: "EUR" });
  const giorno = (d: string) =>
    new Date(d).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const { data: degustazioni } = await supabase
    .from("degustazioni")
    .select("id, degustato_il, punteggio, dinamica")
    .eq("vino_id", vinoId)
    .order("degustato_il", { ascending: false })
    .limit(20);

  const giacenze = [...(vino.giacenze ?? [])].sort((a, b) =>
    confrontaCodici(a.posizioni?.codice ?? "", b.posizioni?.codice ?? ""),
  );
  const totale = bottiglieTotali(vino);

  return (
    <>
      <Testata email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Link
          href={`/cantine/${cantina.id}`}
          className="text-sm text-vino underline"
        >
          {t("‹ Cantina {nome}", { nome: cantina.nome })}
        </Link>
        <div>
          <h1 className="text-xl font-semibold">
            {titoloVino(vinoPerModulo, t)}
            {vinoPerModulo.annata ? ` ${vinoPerModulo.annata}` : ""}
          </h1>
          <p className="text-sm text-tenue">
            {[
              vino.denominazione !== titoloVino(vino, t)
                ? vino.denominazione
                : null,
              vino.produttore,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {salvato && (
          <p className="rounded-xl bg-ambra/15 p-3 text-sm">{t("Salvato.")}</p>
        )}
        {errore && (
          <p
            role="alert"
            className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro"
          >
            {errore}
          </p>
        )}

        <section className="scheda flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">{t("Bottiglie")}</h2>
            <span className="text-sm text-tenue">{t("{n} in tutto", { n: totale })}</span>
          </div>

          <ul className="flex flex-col gap-2">
            {giacenze.map((g) => (
              <li
                key={g.id}
                className="flex flex-col gap-2 rounded-xl bg-sfondo p-2 pl-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium">
                      {g.posizioni?.codice ?? "—"}
                    </span>
                    <span className="ml-2 text-sm text-tenue">
                      {g.posizioni?.luoghi?.nome}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <form action={cambiaQuantita}>
                      <input
                        type="hidden"
                        name="cantina_id"
                        value={cantina.id}
                      />
                      <input type="hidden" name="vino_id" value={vino.id} />
                      <input type="hidden" name="giacenza_id" value={g.id} />
                      <input type="hidden" name="delta" value="-1" />
                      <button
                        type="submit"
                        disabled={g.quantita === 0}
                        className="pulsante w-12 px-0 text-xl"
                        aria-label={g.posizioni?.codice ? t("Togli una bottiglia da {posizione}", { posizione: g.posizioni.codice }) : t("Togli una bottiglia da questa posizione")}
                      >
                        −
                      </button>
                    </form>
                    <span className="w-10 text-center text-xl font-semibold">
                      {g.quantita}
                    </span>
                    <form action={cambiaQuantita}>
                      <input
                        type="hidden"
                        name="cantina_id"
                        value={cantina.id}
                      />
                      <input type="hidden" name="vino_id" value={vino.id} />
                      <input type="hidden" name="giacenza_id" value={g.id} />
                      <input type="hidden" name="delta" value="1" />
                      <button
                        type="submit"
                        className="pulsante w-12 px-0 text-xl"
                        aria-label={g.posizioni?.codice ? t("Aggiungi una bottiglia a {posizione}", { posizione: g.posizioni.codice }) : t("Aggiungi una bottiglia a questa posizione")}
                      >
                        +
                      </button>
                    </form>
                  </div>
                </div>
                {g.quantita > 0 && posizioni.length > 1 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-vino underline">
                      {t("Sposta")}
                    </summary>
                    <form
                      action={spostaBottiglie}
                      className="mt-2 grid grid-cols-[1fr_4.5rem_auto] items-end gap-2 pr-1"
                    >
                      <input
                        type="hidden"
                        name="cantina_id"
                        value={cantina.id}
                      />
                      <input type="hidden" name="vino_id" value={vino.id} />
                      <input type="hidden" name="giacenza_id" value={g.id} />
                      <select
                        name="posizione_id"
                        required
                        defaultValue=""
                        className="campo"
                        aria-label={t("Nuova posizione")}
                      >
                        <option value="" disabled>
                          {t("Dove…")}
                        </option>
                        {luoghi.map((luogo) => (
                          <optgroup key={luogo} label={luogo}>
                            {posizioni
                              .filter(
                                (p) =>
                                  p.luogo === luogo && p.id !== g.posizioni?.id,
                              )
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.codice}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                      <input
                        name="quantita"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={g.quantita}
                        defaultValue={g.quantita}
                        className="campo text-center"
                        aria-label={t("Quante bottiglie spostare")}
                      />
                      <button type="submit" className="pulsante">
                        {t("Sposta")}
                      </button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>

          <form
            action={aggiungiGiacenza}
            className="grid grid-cols-[1fr_5rem_auto] items-end gap-2"
          >
            <input type="hidden" name="cantina_id" value={cantina.id} />
            <input type="hidden" name="vino_id" value={vino.id} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("Metti in un'altra posizione")}
              <select
                name="posizione_id"
                required
                defaultValue=""
                className="campo"
              >
                <option value="" disabled>
                  {t("Scegli…")}
                </option>
                {luoghi.map((luogo) => (
                  <optgroup key={luogo} label={luogo}>
                    {posizioni
                      .filter((p) => p.luogo === luogo)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codice}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <input
              name="quantita"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={1}
              className="campo text-center"
              aria-label={t("Quante bottiglie")}
            />
            <button type="submit" className="pulsante">
              {t("Aggiungi")}
            </button>
          </form>
        </section>

        <section className="scheda flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">{t("Degustazioni")}</h2>
            <Link href={`/cantine/${cantina.id}/vini/${vino.id}/degustazione`} className="pulsante flex items-center">
              {t("+ Degusta")}
            </Link>
          </div>
          {(degustazioni ?? []).length === 0 ? (
            <p className="text-sm text-tenue">
              {t("Nessuna degustazione. Registra come si muovono le sensazioni in bocca e guarda la mappa 3D.")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(degustazioni ?? []).map((d) => {
                const sensazioni = ((d.dinamica as { curve?: unknown[] } | null)?.curve ?? []).length;
                return (
                  <li key={d.id}>
                    <Link
                      href={`/cantine/${cantina.id}/degustazioni/${d.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-sfondo px-3 py-2 text-sm"
                    >
                      <span>
                        {new Date(`${d.degustato_il}T12:00:00`).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-tenue">
                        {sensazioni === 1 ? t("{n} sensazione", { n: sensazioni }) : t("{n} sensazioni", { n: sensazioni })}
                        {d.punteggio ? ` · ${t("{n} punti", { n: Number(d.punteggio) })}` : ""} ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="scheda flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">{t("Prezzo")}</h2>
            {ultimoPrezzo && totale > 0 && (
              <span className="text-sm text-tenue">
                {t("valore in cantina {valore}", { valore: euro(Number(ultimoPrezzo.prezzo) * totale) })}
              </span>
            )}
          </div>

          {ultimoPrezzo ? (
            <div>
              <span className="text-2xl font-semibold text-vino">
                {euro(Number(ultimoPrezzo.prezzo))}
              </span>{" "}
              <span className="text-sm text-tenue">{t("a bottiglia")}</span>
              <span className="mt-1 block text-sm text-tenue">
                {ultimoPrezzo.metodo === "manuale" ? (
                  t("Inserito a mano")
                ) : ultimoPrezzo.url ? (
                  <a
                    href={ultimoPrezzo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-vino underline"
                  >
                    {ultimoPrezzo.fonte}
                  </a>
                ) : (
                  ultimoPrezzo.fonte
                )}{" "}
                · {giorno(ultimoPrezzo.rilevato_il)}
              </span>
              {ultimoPrezzo.annata_trovata &&
                vino.annata &&
                ultimoPrezzo.annata_trovata !== vino.annata && (
                  <span className="mt-2 block rounded-lg bg-ambra/15 px-2 py-1 text-sm">
                    <strong>{t("Prezzo dell'annata {annata}.", { annata: ultimoPrezzo.annata_trovata })}</strong>{" "}
                    {t("L'annata {annata} non è in vendita online. È un'indicazione, non il valore di questa bottiglia.", { annata: vino.annata })}
                  </span>
                )}
            </div>
          ) : (
            <p className="text-sm text-tenue">
              {ultimaRicerca
                ? t("Cercato il {giorno}: non in vendita sulle enoteche online.", { giorno: giorno(ultimaRicerca.rilevato_il) })
                : t("Nessun prezzo ancora.")}
            </p>
          )}

          <PrezzoVino vinoId={vino.id} haPrezzo={Boolean(ultimoPrezzo)} />

          <form
            action={salvaPrezzoManuale}
            className="grid grid-cols-[1fr_auto] items-end gap-2"
          >
            <input type="hidden" name="cantina_id" value={cantina.id} />
            <input type="hidden" name="vino_id" value={vino.id} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("Oppure scrivi tu il prezzo (€)")}
              <input
                name="prezzo"
                inputMode="decimal"
                className="campo"
                placeholder={t("es. 24,50")}
              />
            </label>
            <button type="submit" className="pulsante">
              {t("Salva")}
            </button>
          </form>
        </section>

        <section className="scheda flex flex-col gap-3">
          <h2 className="text-lg font-medium">{t("Etichetta e dati")}</h2>

          {proposta && (
            <p className="rounded-xl bg-ambra/15 p-3 text-sm">
              <strong>
                {vino.estrazione?.provider
                  ? t("Dati letti dall'etichetta ({provider}).", { provider: vino.estrazione.provider })
                  : t("Dati letti dall'etichetta.")}
              </strong>{" "}
              {t("Sono una proposta: controllali con le foto, correggi ciò che non torna e premi «Salva le modifiche».")}
            </p>
          )}
          {!proposta && vino.errore && (
            <p className="rounded-xl bg-vino/10 p-3 text-sm text-vino-scuro">
              {t(vino.errore)}
            </p>
          )}
          {doppioni.length > 0 && (
            <p className="rounded-xl bg-vino/10 p-3 text-sm">
              <strong>{t("Forse è già in cantina:")}</strong>{" "}
              {doppioni.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link
                    href={`/cantine/${cantina.id}/vini/${d.id}`}
                    className="text-vino underline"
                  >
                    {t("apri la scheda esistente")}
                  </Link>
                </span>
              ))}
              . {t("Se è lo stesso vino, aggiungi lì le bottiglie invece di tenere due schede.")}
            </p>
          )}
          {haFoto && (
            <LetturaEtichetta
              vinoId={vino.id}
              giaLetta={Boolean(vino.estrazione?.dati)}
            />
          )}

          <FormVino
            key={`${vino.stato}-${vino.estrazione?.quando ?? ""}`}
            cantinaId={cantina.id}
            vinoId={vino.id}
            azione={aggiornaVino}
            vino={vinoPerModulo}
            anteprime={anteprime}
            testoPulsante={t("Salva le modifiche")}
          />
        </section>

        <form action={eliminaVino} className="pb-6 text-center">
          <input type="hidden" name="cantina_id" value={cantina.id} />
          <input type="hidden" name="vino_id" value={vino.id} />
          <PulsanteConConferma
            testo={t("Elimina questo vino")}
            domanda={t("Eliminare «{titolo}» con le sue foto, le quantità e i prezzi? Non si può annullare.", { titolo: titoloVino(vinoPerModulo, t) })}
          />
        </form>
      </main>
    </>
  );
}

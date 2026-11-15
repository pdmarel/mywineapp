"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { daTradurre } from "@/lib/i18n/lingue";
import { creaClientBrowser } from "@/lib/supabase/browser";
import { BUCKET_ETICHETTE, percorsoMini } from "@/lib/vini";

// Scatta (o sceglie) la foto di un'etichetta, la riduce nel telefono e la carica nell'archivio.
// Riduzione: lato lungo 1600 px per la foto, 320 px per la miniatura degli elenchi. Lo spazio gratuito
// è 1 GB e le foto dei telefoni pesano 3-8 MB l'una: senza riduzione finirebbe in poche decine di vini.

type Props = {
  cantinaId: string;
  vinoId: string;
  lato: "fronte" | "retro";
  /** Nome del campo nascosto che porta il percorso della foto nel modulo. */
  nomeCampo: string;
  percorsoIniziale?: string | null;
  anteprimaIniziale?: string | null;
  /** Avvisa il modulo quando un caricamento inizia o finisce, per bloccare il salvataggio a metà. */
  suOccupato?: (occupato: boolean) => void;
  /**
   * Se presente, la foto NON viene caricata subito: viene solo ridotta e consegnata al modulo,
   * che la mette in coda sul telefono (bottiglia nuova, anche senza rete).
   */
  differita?: (dati: { foto: Blob; mini: Blob }) => void;
};

async function riduci(file: File, latoLungo: number, qualita: number): Promise<Blob> {
  let sorgente: ImageBitmap | HTMLImageElement;
  try {
    sorgente = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Browser senza createImageBitmap per questo formato: si passa da un elemento <img>.
    sorgente = await new Promise<HTMLImageElement>((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error(daTradurre("Immagine non leggibile")));
      img.src = URL.createObjectURL(file);
    });
  }
  const scala = Math.min(1, latoLungo / Math.max(sorgente.width, sorgente.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(sorgente.width * scala);
  tela.height = Math.round(sorgente.height * scala);
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error(daTradurre("Impossibile elaborare l'immagine"));
  ctx.drawImage(sorgente, 0, 0, tela.width, tela.height);
  return new Promise<Blob>((ok, ko) =>
    tela.toBlob((b) => (b ? ok(b) : ko(new Error(daTradurre("Riduzione fallita")))), "image/jpeg", qualita),
  );
}

export function FotoEtichetta({
  cantinaId,
  vinoId,
  lato,
  nomeCampo,
  percorsoIniziale,
  anteprimaIniziale,
  suOccupato,
  differita,
}: Props) {
  const t = useT();
  const idCampo = useId();
  const [percorso, setPercorso] = useState(percorsoIniziale ?? "");
  const [anteprima, setAnteprima] = useState(anteprimaIniziale ?? "");
  const [stato, setStato] = useState<"fermo" | "caricamento" | "errore">("fermo");
  const [messaggio, setMessaggio] = useState("");

  async function scelta(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riscattare la stessa foto
    if (!file) return;

    setStato("caricamento");
    setMessaggio("");
    suOccupato?.(true);
    try {
      const [foto, mini] = await Promise.all([riduci(file, 1600, 0.8), riduci(file, 320, 0.7)]);
      if (differita) {
        differita({ foto, mini });
        setAnteprima(URL.createObjectURL(foto));
        setStato("fermo");
        return;
      }
      const destinazione = `${cantinaId}/${vinoId}/${lato}.jpg`;
      const archivio = creaClientBrowser().storage.from(BUCKET_ETICHETTE);
      const opzioni = { contentType: "image/jpeg", upsert: true };

      const esito = await archivio.upload(destinazione, foto, opzioni);
      if (esito.error) throw new Error(esito.error.message);
      const esitoMini = await archivio.upload(percorsoMini(destinazione), mini, opzioni);
      if (esitoMini.error) throw new Error(esitoMini.error.message);

      setPercorso(destinazione);
      setAnteprima(URL.createObjectURL(foto));
      setStato("fermo");
    } catch (errore) {
      setStato("errore");
      setMessaggio(errore instanceof Error ? errore.message : daTradurre("Caricamento non riuscito"));
    } finally {
      suOccupato?.(false);
    }
  }

  const etichetta = lato === "fronte" ? t("Etichetta frontale") : t("Retro etichetta");

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={nomeCampo} value={percorso} />
      <label
        htmlFor={idCampo}
        className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-bordo bg-sfondo text-center text-sm text-tenue"
      >
        {anteprima ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmati o locali: next/image non serve
          <img src={anteprima} alt={etichetta} className="h-full w-full object-cover" />
        ) : (
          <span className="px-3">
            <span className="block text-base font-medium text-inchiostro">{etichetta}</span>
            {t("Tocca per scattare")}
          </span>
        )}
      </label>
      <input
        id={idCampo}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={scelta}
      />
      <p className="min-h-5 text-xs" aria-live="polite">
        {stato === "caricamento" && <span className="text-tenue">{t("Preparo la foto…")}</span>}
        {stato === "errore" && <span className="text-vino-scuro">{t("Foto non acquisita: {messaggio}", { messaggio: t(messaggio) })}</span>}
        {stato === "fermo" && anteprima && <span className="text-tenue">{t("Tocca la foto per rifarla")}</span>}
      </p>
    </div>
  );
}

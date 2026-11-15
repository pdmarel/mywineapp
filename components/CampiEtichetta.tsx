import { useT } from "@/lib/i18n/client";
import { TIPOLOGIE, nomeTipologia, vitigniInTesto, type Vino } from "@/lib/vini";

// I campi di testo dell'etichetta, uguali nel modulo di modifica e in quello della bottiglia nuova.
// "predefiniti" serve all'inserimento in serie: la bottiglia successiva parte con la tipologia della precedente.

export function CampiEtichetta({ vino, predefiniti }: { vino?: Vino; predefiniti?: { tipologia?: string } }) {
  const t = useT();
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Nome del vino")}
        <input
          name="nome_fantasia"
          defaultValue={vino?.nome_fantasia ?? ""}
          className="campo"
          placeholder={t("es. Rabajà")}
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Denominazione")}
        <input
          name="denominazione"
          defaultValue={vino?.denominazione ?? ""}
          className="campo"
          placeholder={t("es. Barbaresco DOCG")}
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Produttore")}
        <input
          name="produttore"
          defaultValue={vino?.produttore ?? ""}
          className="campo"
          placeholder={t("es. Produttori del Barbaresco")}
          maxLength={200}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Annata")}
          <input
            name="annata"
            type="number"
            inputMode="numeric"
            min={1800}
            max={2100}
            defaultValue={vino?.annata ?? ""}
            className="campo"
            placeholder={t("es. 2016")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Tipologia")}
          <select name="tipologia" defaultValue={vino?.tipologia ?? predefiniti?.tipologia ?? ""} className="campo">
            <option value="">—</option>
            {TIPOLOGIE.map((tipologia) => (
              <option key={tipologia} value={tipologia}>
                {nomeTipologia(tipologia, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Alcool %")}
          <input
            name="alcool"
            inputMode="decimal"
            defaultValue={vino?.alcool ?? ""}
            className="campo"
            placeholder={t("es. 14,5")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("Capacità (cl)")}
          <input
            name="capacita_cl"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={vino?.capacita_cl ?? 75}
            className="campo"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("Vitigni")}
        <input
          name="vitigni"
          defaultValue={vitigniInTesto(vino?.vitigni)}
          className="campo"
          placeholder={t("es. Sangiovese 90%, Merlot 10%")}
          maxLength={300}
        />
      </label>
    </>
  );
}

import { InserimentoRapido } from "@/components/InserimentoRapido";
import { Testata } from "@/components/Testata";
import { traduzione } from "@/lib/i18n/server";

// Inserimento rapido di una bottiglia. La pagina non legge nulla dal database: cantine e posizioni vengono
// dalla copia tenuta sul telefono, così il service worker può tenerla in copia e aprirla anche senza rete,
// o quando una pagina non si carica per il poco segnale.
export default async function PaginaInserimento() {
  const { t } = await traduzione();
  return (
    <>
      <Testata />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">{t("Nuova bottiglia")}</h1>
        <InserimentoRapido />
      </main>
    </>
  );
}

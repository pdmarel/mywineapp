import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { confermaLink } from "@/app/login/azioni";
import { traduzione } from "@/lib/i18n/server";

// Arrivo dal link dell'email spedita dall'app. La sessione si apre solo premendo "Entra":
// aprire la pagina non consuma il gettone (i programmi di posta a volte visitano i link da soli).
export default async function PaginaConferma({ searchParams }: PageProps<"/auth/conferma">) {
  const parametri = await searchParams;
  const gettone = typeof parametri.gettone === "string" ? parametri.gettone : "";
  if (!gettone) redirect("/login?errore=link");
  const { t } = await traduzione();

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form action={confermaLink} className="scheda flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl">
          <Logo />
        </h1>
        <p className="text-sm">{t("Premi il pulsante per entrare su questo dispositivo.")}</p>
        <input type="hidden" name="gettone" value={gettone} />
        <button type="submit" className="pulsante">
          {t("Entra")}
        </button>
      </form>
    </main>
  );
}

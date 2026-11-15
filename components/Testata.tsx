import Link from "next/link";
import { traduzione } from "@/lib/i18n/server";
import { IndicatoreSospesi } from "./IndicatoreSospesi";
import { Logo } from "./Logo";
import { PulsanteEsci } from "./PulsanteEsci";
import { SincronizzaCantine } from "./SincronizzaCantine";
import { SceltaLingua } from "./SceltaLingua";

export async function Testata({ email }: { email?: string | null }) {
  const { t } = await traduzione();
  return (
    <>
      <header className="border-b border-bordo bg-carta">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-xl">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            {email && <span className="hidden text-xs text-tenue sm:inline">{email}</span>}
            <SceltaLingua />
            <PulsanteEsci />
          </div>
        </div>
      </header>
      <nav className="border-b border-bordo bg-carta" aria-label={t("Menu principale")}>
        <div className="mx-auto flex w-full max-w-2xl gap-1 px-4">
          <Link href="/" className="flex min-h-11 flex-1 items-center justify-center text-sm font-medium text-vino">
            {t("Cantina")}
          </Link>
          <Link href="/degustazioni" className="flex min-h-11 flex-1 items-center justify-center text-sm font-medium text-vino">
            {t("Degustazioni")}
          </Link>
        </div>
      </nav>
      <IndicatoreSospesi />
      <SincronizzaCantine />
    </>
  );
}

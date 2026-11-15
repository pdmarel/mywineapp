"use client";

import { useRouter } from "next/navigation";
import { useLingua } from "@/lib/i18n/client";
import { BISCOTTO_LINGUA, LINGUE } from "@/lib/i18n/lingue";

// Il selettore della lingua. La scelta resta sul dispositivo (un cookie di un anno) e vale da subito:
// la pagina si ridisegna nella nuova lingua senza perdere il punto in cui si è.

export function SceltaLingua({ estesa = false }: { estesa?: boolean }) {
  const { t, lingua } = useLingua();
  const router = useRouter();
  return (
    <select
      value={lingua}
      aria-label={t("Lingua")}
      className="min-h-9 rounded-lg border border-bordo bg-carta px-1 text-sm text-inchiostro"
      onChange={(e) => {
        document.cookie = `${BISCOTTO_LINGUA}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {LINGUE.map((l) => (
        <option key={l.id} value={l.id}>
          {estesa ? l.nome : l.id.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

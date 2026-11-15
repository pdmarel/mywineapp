import { SIGLA } from "@/lib/sigla";

// Marchio dell'app: "MyWineApp" con, se configurata (NEXT_PUBLIC_SIGLA), una sigla in apice al posto di un ™.

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      MyWineApp
      {SIGLA && <sup className="ml-0.5 align-super text-[0.5em] font-bold tracking-wide text-vino">{SIGLA}</sup>}
    </span>
  );
}

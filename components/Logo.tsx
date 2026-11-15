// Marchio dell'app: "MyWineApp" con le iniziali EM in apice, al posto di un ™.

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      MyWineApp
      <sup className="ml-0.5 align-super text-[0.5em] font-bold tracking-wide text-vino">EM</sup>
    </span>
  );
}

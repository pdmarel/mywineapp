"use client";

// Pulsante di invio che chiede conferma prima di procedere: per le azioni che non si possono annullare.
export function PulsanteConConferma({
  testo,
  domanda,
  className = "text-sm text-vino underline",
}: {
  testo: string;
  domanda: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(domanda)) e.preventDefault();
      }}
    >
      {testo}
    </button>
  );
}

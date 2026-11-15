// La versione ridotta di Plotly non porta con sé le definizioni dei tipi: basta ciò che usano le mappe.
declare module "plotly.js-dist-min" {
  const Plotly: {
    react(el: HTMLElement, dati: unknown[], layout?: unknown, config?: unknown): Promise<unknown>;
    relayout(el: HTMLElement, modifiche: Record<string, unknown>): Promise<unknown>;
    purge(el: HTMLElement): void;
    toImage(el: HTMLElement, opzioni: { format: string; width: number; height: number }): Promise<string>;
  };
  export default Plotly;
}

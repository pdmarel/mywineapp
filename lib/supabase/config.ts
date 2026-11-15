// Lettura centralizzata della configurazione Supabase.
// Se manca qualcosa l'app lo dice in chiaro invece di rompersi con un errore oscuro.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseConfigurato(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Email autorizzate a entrare (variabile EMAIL_AUTORIZZATE, separate da virgola). */
export function emailAutorizzata(email: string): boolean {
  const elenco = (process.env.EMAIL_AUTORIZZATE ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return elenco.includes(email.trim().toLowerCase());
}

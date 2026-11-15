import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** Client Supabase per pagine server, azioni server e route: agisce come l'utente collegato (RLS attiva). */
export async function creaClientServer() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(daImpostare) {
        try {
          for (const { name, value, options } of daImpostare) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chiamato da una pagina server: i cookie non si possono scrivere lì.
          // Va bene: la sessione viene rinnovata da proxy.ts a ogni richiesta.
        }
      },
    },
  });
}

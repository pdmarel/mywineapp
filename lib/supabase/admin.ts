import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Client con la chiave di servizio: scavalca la RLS.
 * Solo lato server e solo dove serve davvero (creazione della cantina, cron, scrittura prezzi).
 */
export function creaClientAdmin() {
  const chiave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chiave) {
    throw new Error("Manca SUPABASE_SERVICE_ROLE_KEY nelle variabili d'ambiente.");
  }
  return createClient(SUPABASE_URL, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

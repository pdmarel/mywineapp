import "server-only";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { emailAutorizzata } from "@/lib/supabase/config";

// Chi può entrare nell'app.
//  - I proprietari: le email in EMAIL_AUTORIZZATE (variabile d'ambiente). Solo loro possono creare cantine.
//  - Gli invitati: le email che un proprietario ha aggiunto a una cantina dalla pagina «Impostazioni»
//    (tabella "inviti"). Entrano con il codice via email e vedono solo le cantine a cui sono stati aggiunti.
// La tabella "inviti" si crea con supabase/migrations/0002_inviti.sql: finché non esiste, valgono solo i proprietari.

export async function emailAbilitata(email: string): Promise<boolean> {
  const pulita = email.trim().toLowerCase();
  if (emailAutorizzata(pulita)) return true;
  try {
    const { data, error } = await creaClientAdmin().from("inviti").select("email").eq("email", pulita).limit(1);
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Dopo l'accesso: rende l'utente membro delle cantine a cui la sua email è stata invitata. */
export async function riscattaInviti(utente: { id: string; email?: string | null }): Promise<void> {
  if (!utente.email) return;
  try {
    const admin = creaClientAdmin();
    const { data, error } = await admin.from("inviti").select("cantina_id").eq("email", utente.email.toLowerCase());
    if (error || !data || data.length === 0) return;
    await admin.from("cantina_membri").upsert(
      data.map((i) => ({ cantina_id: i.cantina_id, user_id: utente.id, ruolo: "editor" })),
      { onConflict: "cantina_id,user_id", ignoreDuplicates: true },
    );
  } catch {
    // tabella non ancora creata o rete assente: l'accesso funziona comunque
  }
}

export type PersonaInvitata = { email: string; invitataIl: string; entrata: boolean };

/** Elenco degli invitati di una cantina, oppure null se la tabella "inviti" non esiste ancora. */
export async function invitatiDi(cantinaId: string): Promise<PersonaInvitata[] | null> {
  const admin = creaClientAdmin();
  const { data, error } = await admin
    .from("inviti")
    .select("email, creato_il")
    .eq("cantina_id", cantinaId)
    .order("creato_il");
  if (error) return null;

  // "Entrata" = quell'email ha già fatto almeno un accesso ed è membro della cantina.
  const [{ data: membri }, { data: utenti }] = await Promise.all([
    admin.from("cantina_membri").select("user_id").eq("cantina_id", cantinaId),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);
  const idMembri = new Set((membri ?? []).map((m) => m.user_id));
  const emailMembri = new Set(
    (utenti?.users ?? []).filter((u) => idMembri.has(u.id)).map((u) => (u.email ?? "").toLowerCase()),
  );
  return (data ?? []).map((i) => ({ email: i.email, invitataIl: i.creato_il, entrata: emailMembri.has(i.email) }));
}

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { creaClientServer } from "@/lib/supabase/server";
import { emailAbilitata } from "@/lib/persone";
import { supabaseConfigurato } from "@/lib/supabase/config";
import { inviaEmailAccesso, postaConfigurata } from "@/lib/posta";
import { traduzione } from "@/lib/i18n/server";

// Accesso senza password, solo per le email abilitate (EMAIL_AUTORIZZATE).
//
// Modalità principale — posta propria (GMAIL_UTENTE + GMAIL_PASSWORD_APP presenti):
//   Supabase genera codice e gettone senza spedire nulla; l'email la spedisce l'app via Gmail,
//   con dentro il codice numerico e un link. La pagina accetta l'uno o l'altro.
// Modalità di riserva — posta di Supabase (se la posta propria non è configurata):
//   Supabase spedisce la sua email con il solo link; pochissimi invii all'ora sul piano gratuito.
//
// L'email in attesa sta in un cookie di breve durata, non nell'indirizzo della pagina.
const COOKIE_EMAIL = "fmw_email_in_attesa";

function tornaAlLogin(errore: string): never {
  redirect(`/login?errore=${errore}`);
}

/** Indirizzo dell'app da cui arriva la richiesta (locale o Vercel), per costruire i link. */
async function origine(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Chiede a Supabase codice e gettone per questa email, senza far partire nessuna email. */
async function generaAccesso(email: string) {
  const admin = creaClientAdmin();
  let risposta = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (risposta.error) {
    // Prima volta di una persona appena abilitata: l'utente non esiste ancora. Lo creiamo e riproviamo.
    const creato = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (creato.error) throw new Error(`${risposta.error.message} / ${creato.error.message}`);
    risposta = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (risposta.error) throw new Error(risposta.error.message);
  }
  const { email_otp: codice, hashed_token: gettone } = risposta.data.properties;
  if (!codice || !gettone) throw new Error("Supabase non ha restituito codice o gettone.");
  return { codice, gettone };
}

/** Passo 1: controlla che l'email sia abilitata e fa partire l'email di accesso. */
export async function chiediAccesso(formData: FormData) {
  if (!supabaseConfigurato()) tornaAlLogin("configurazione");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) tornaAlLogin("email");
  if (!(await emailAbilitata(email))) tornaAlLogin("non_abilitata");

  const base = await origine();
  let passoSuccessivo = "codice";

  if (postaConfigurata()) {
    try {
      const { t } = await traduzione();
      const { codice, gettone } = await generaAccesso(email);
      await inviaEmailAccesso({
        t,
        a: email,
        codice,
        link: `${base}/auth/conferma?gettone=${encodeURIComponent(gettone)}`,
      });
    } catch (e) {
      console.error("Invio email di accesso (Gmail) fallito:", e instanceof Error ? e.message : e);
      tornaAlLogin("invio");
    }
  } else {
    const supabase = await creaClientServer();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${base}/auth/callback` },
    });
    if (error) {
      console.error("Invio email di accesso (Supabase) fallito:", error.message);
      tornaAlLogin(error.status === 429 ? "troppi_invii" : "invio");
    }
    passoSuccessivo = "inviata";
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_EMAIL, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
    path: "/login",
  });
  redirect(`/login?passo=${passoSuccessivo}`);
}

/** Passo 2: verifica il codice numerico e apre la sessione. */
export async function verificaCodice(formData: FormData) {
  const cookieStore = await cookies();
  const email = cookieStore.get(COOKIE_EMAIL)?.value;
  if (!email) tornaAlLogin("scaduto");

  const codice = String(formData.get("codice") ?? "").replace(/\D/g, "");
  // La lunghezza la decide Supabase (oggi 8 cifre): si accetta da 6 a 10.
  if (codice.length < 6 || codice.length > 10) redirect("/login?passo=codice&errore=codice");

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.verifyOtp({ email, token: codice, type: "email" });
  if (error) {
    console.error("Verifica codice fallita:", error.message);
    redirect("/login?passo=codice&errore=codice");
  }

  cookieStore.delete({ name: COOKIE_EMAIL, path: "/login" });
  redirect("/");
}

/**
 * Alternativa al codice: il link dell'email porta a una pagina con il pulsante "Entra", che chiama questa azione.
 * Il gettone si consuma solo al clic: così l'anteprima automatica dei programmi di posta non lo brucia.
 * Funziona in qualunque browser, non solo in quello che ha chiesto l'accesso.
 */
export async function confermaLink(formData: FormData) {
  const gettone = String(formData.get("gettone") ?? "");
  if (!gettone) tornaAlLogin("link");

  const supabase = await creaClientServer();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: gettone, type: "email" });
  if (error || !data.user) {
    console.error("Apertura sessione dal link fallita:", error?.message);
    tornaAlLogin("link");
  }
  if (!data.user.email || !(await emailAbilitata(data.user.email))) {
    await supabase.auth.signOut({ scope: "local" });
    tornaAlLogin("non_abilitata");
  }
  redirect("/");
}

/** Torna al passo 1 (email sbagliata o messaggio non arrivato). */
export async function ricomincia() {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE_EMAIL, path: "/login" });
  redirect("/login");
}

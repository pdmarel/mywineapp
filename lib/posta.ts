import "server-only";
import nodemailer from "nodemailer";
import type { Traduttore } from "@/lib/i18n/lingue";

// L'app spedisce da sola l'email di accesso, con la Gmail personale e una "password per le app".
// Così il testo dell'email (codice + link) lo decidiamo noi e non dipende dai modelli di Supabase,
// che sul piano gratuito non si possono modificare, né dal suo limite di email all'ora.

const UTENTE = process.env.GMAIL_UTENTE ?? "";
const PASSWORD = (process.env.GMAIL_PASSWORD_APP ?? "").replace(/\s+/g, "");

export function postaConfigurata(): boolean {
  return UTENTE.length > 0 && PASSWORD.length > 0;
}

/** Scrive il codice a gruppi di 3 o 4 cifre, più facile da leggere e ricopiare. */
export function codiceLeggibile(codice: string): string {
  const meta = Math.ceil(codice.length / 2);
  return `${codice.slice(0, meta)} ${codice.slice(meta)}`;
}

export async function inviaEmailAccesso(dati: { t: Traduttore; a: string; codice: string; link: string }) {
  const t = dati.t;
  const trasporto = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: UTENTE, pass: PASSWORD },
  });
  const codice = codiceLeggibile(dati.codice);

  await trasporto.sendMail({
    from: `"MyWineApp" <${UTENTE}>`,
    to: dati.a,
    subject: t("{codice} è il tuo codice MyWineApp", { codice }),
    text:
      `${t("Il tuo codice di accesso a MyWineApp: {codice}", { codice })}\n\n` +
      `${t("Oppure apri questo link e premi \"Entra\":")}\n${dati.link}\n\n` +
      t("Il codice vale circa un'ora e funziona una volta sola. Se non l'hai chiesto tu, ignora questa email."),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;color:#2b2320">
        <h2 style="margin:0 0 4px">MyWineApp<sup style="font-size:11px;color:#8e3b46">EM</sup></h2>
        <p style="margin:0 0 20px;color:#7a6f69">${t("La mia cantina e le mie degustazioni")}</p>
        <p style="margin:0 0 6px">${t("Il tuo codice di accesso:")}</p>
        <p style="margin:0 0 20px;font-size:30px;font-weight:bold;letter-spacing:4px">${codice}</p>
        <p style="margin:0 0 20px">
          <a href="${dati.link}" style="color:#8e3b46;font-weight:bold">${t("Oppure apri questo link e premi «Entra».")}</a>
        </p>
        <p style="margin:0;font-size:12px;color:#7a6f69">
          ${t("Vale circa un'ora e funziona una volta sola. Se non l'hai chiesto tu, ignora questa email.")}
        </p>
      </div>`,
  });
}

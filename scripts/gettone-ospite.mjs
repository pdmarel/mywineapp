// Strumento di prova: gettone monouso per entrare in locale come OSPITE fittizio (ospite-prova@example.com).
//   node scripts/gettone-ospite.mjs          → crea l'utente di prova se manca e stampa il gettone
//   node scripts/gettone-ospite.mjs cancella → elimina l'utente di prova
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "ospite-prova@example.com";
const { data: utenti } = await admin.auth.admin.listUsers({ perPage: 200 });
let utente = utenti.users.find((u) => u.email === EMAIL);
if (process.argv[2] === "cancella") {
  if (utente) { const d = await admin.auth.admin.deleteUser(utente.id); console.log("utente di prova cancellato:", !d.error); } else console.log("nessun utente di prova");
  await admin.from("inviti").delete().eq("email", EMAIL);
  process.exit(0);
}
if (!utente) { const c = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true }); utente = c.data.user; }
const g = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
console.log("GETTONE", g.data.properties.hashed_token);

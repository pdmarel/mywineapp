// Strumento di prova: stampa un gettone monouso per entrare nell'app in locale come primo utente abilitato
// (http://localhost:3000/auth/conferma?gettone=...). Non crea né modifica dati.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const g = await admin.auth.admin.generateLink({ type: "magiclink", email: env.EMAIL_AUTORIZZATE.split(",")[0].trim() });
console.log("GETTONE", g.data.properties.hashed_token);
const { data } = await admin.from("cantine").select("id, nome");
for (const c of data) console.log("CANTINA", c.nome, c.id);

// Strumento di prova: crea (o cancella) una cantina "PROVA-CLAUDE" e stampa un gettone monouso
// per entrare nell'app in locale come primo utente abilitato. Non tocca le cantine vere.
//   node scripts/prova-cantina.mjs crea      → crea cantina di prova + gettone
//   node scripts/prova-cantina.mjs cancella  → cancella cantina di prova, vini e foto
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NOME = "PROVA-CLAUDE";
if (process.argv[2] === "crea") {
  const email = env.EMAIL_AUTORIZZATE.split(",")[0].trim();
  const g = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: u } = await admin.auth.admin.listUsers();
  const uid = u.users.find((x) => x.email === email).id;
  const { data: c } = await admin.from("cantine").insert({ nome: NOME }).select("id").single();
  await admin.from("cantina_membri").insert({ cantina_id: c.id, user_id: uid, ruolo: "proprietario" });
  const { data: l } = await admin.from("luoghi").insert({ cantina_id: c.id, nome: "Prova" }).select("id").single();
  await admin.from("posizioni").insert([{ luogo_id: l.id, codice: "Z1" }, { luogo_id: l.id, codice: "Z2" }]);
  console.log("CANTINA", c.id);
  console.log("GETTONE", g.data.properties.hashed_token);
} else if (process.argv[2] === "cancella") {
  const { data: prove } = await admin.from("cantine").select("id").eq("nome", NOME);
  for (const c of prove ?? []) {
    const b = admin.storage.from("etichette");
    const { data: cartelle } = await b.list(c.id);
    for (const k of cartelle ?? []) {
      const { data: f } = await b.list(`${c.id}/${k.name}`);
      if (f?.length) await b.remove(f.map((x) => `${c.id}/${k.name}/${x.name}`));
    }
    const { data: vocali } = await admin.storage.from("vocali").list(c.id);
    if (vocali?.length) await admin.storage.from("vocali").remove(vocali.map((x) => `${c.id}/${x.name}`));
    const { data: vini } = await admin.from("vini").select("id, nome_fantasia, stato, foto_fronte").eq("cantina_id", c.id);
    console.log("vini di prova trovati:", JSON.stringify(vini));
    const d = await admin.from("cantine").delete().eq("id", c.id);
    console.log("cantina di prova cancellata:", !d.error);
  }
  const { data: rimaste } = await admin.from("cantine").select("nome");
  console.log("cantine nel database ora:", rimaste.map((r) => r.nome).join(", "));
} else {
  console.log("uso: node scripts/prova-cantina.mjs crea | cancella");
}

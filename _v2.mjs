import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const dir = process.argv[2];
const righe = JSON.parse(readFileSync(dir + "/importati.json", "utf8"));
const out = [];
const N = 12;
for (let i = 0; i < righe.length; i += N) {
  const lotto = righe.slice(i, i + N);
  const elenco = lotto.map((r, k) => `${k + 1}. ${[r.produttore ?? "produttore ignoto", r.nome, r.denom, r.annata ?? "s.a.", r.cl + " cl"].filter(Boolean).join(" | ")}`).join("\n");
  const richiesta = `Sei un esperto del mercato del vino. Per ciascun vino stima il prezzo al dettaglio OGGI in Italia (enoteca/enoteca online, IVA inclusa, euro, una bottiglia nel formato indicato, per QUELLA annata se indicata).\n\n${elenco}\n\nRispondi SOLO con un array JSON, un elemento per vino nello stesso ordine: [{"n":1,"min":numero,"max":numero,"conf":0-100}]. "conf" = quanto conosci questo vino specifico (alta solo se lo conosci bene; bassa se stimi dalla denominazione). Nessun altro testo.`;
  let fatto = false;
  for (let giro = 0; giro < 4 && !fatto; giro++) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + env.GEMINI_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gemini-3.5-flash-lite", temperature: 0, max_tokens: 1200, messages: [{ role: "user", content: richiesta }] }), signal: AbortSignal.timeout(60000) });
      if (!r.ok) { console.log("lotto", i, r.status); await new Promise(x => setTimeout(x, 20000)); continue; }
      const t = (await r.json()).choices[0].message.content.replace(/```(json)?/g, "");
      const arr = JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));
      lotto.forEach((x, k) => { const s = arr.find(e => e.n === k + 1) ?? arr[k]; out.push({ ...x, min: Number(s?.min), max: Number(s?.max), conf: Number(s?.conf) }); });
      fatto = true;
    } catch (e) { console.log("lotto", i, e.message); await new Promise(x => setTimeout(x, 8000)); }
  }
  if (!fatto) lotto.forEach(x => out.push({ ...x, min: null, max: null, conf: null }));
  await new Promise(x => setTimeout(x, 4500));
}
writeFileSync(dir + "/importati_stime.json", JSON.stringify(out, null, 1));
console.log("stimati", out.filter(o => o.min).length, "di", out.length);

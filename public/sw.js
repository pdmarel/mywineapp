// Service worker di MyWineApp: tiene sul telefono una copia delle pagine già aperte,
// così l'app si apre anche senza rete (in cantina). Non tocca i salvataggi: quelli li gestisce la coda in IndexedDB.
//
// Regole:
//  - file dell'app (/_next/static, icone): prima la copia, sono immutabili;
//  - pagine e dati di navigazione: prima la rete (con un limite di tempo), se non risponde la copia;
//  - mai in copia: accesso, uscita, richieste non GET, risposte che rimandano al login.
//
// Poco segnale non è assenza di segnale: la richiesta non fallisce, resta appesa. Per questo nessuna attesa
// è illimitata. Se una pagina non si carica in tempo e non ce n'è una copia, si passa all'«inserimento rapido»
// (/inserimento), una pagina che funziona da sola con i dati tenuti sul telefono. Non si resta mai davanti
// a una schermata bianca o congelata.

const VERSIONE = "v2";
const COPIA_FILE = `mywineapp-file-${VERSIONE}`;
const COPIA_PAGINE = `mywineapp-pagine-${VERSIONE}`;
const ATTESA_RETE_MS = 4000; // c'è una copia: dopo tanto si usa quella
const ATTESA_SENZA_COPIA_MS = 9000; // non c'è una copia: si aspetta di più, poi si passa all'inserimento rapido
const PAGINA_OFFLINE = "/inserimento";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomi = await caches.keys();
      await Promise.all(
        nomi.filter((n) => n.startsWith("mywineapp-") && !n.endsWith(VERSIONE)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// All'uscita l'app chiede di cancellare le pagine in copia: contengono i dati della cantina.
self.addEventListener("message", (evento) => {
  if (evento.data === "svuota") {
    evento.waitUntil(caches.delete(COPIA_PAGINE));
  }
});

function conLimite(promessa, ms) {
  return new Promise((ok, ko) => {
    const orologio = setTimeout(() => ko(new Error("rete lenta")), ms);
    promessa.then(
      (v) => {
        clearTimeout(orologio);
        ok(v);
      },
      (e) => {
        clearTimeout(orologio);
        ko(e);
      },
    );
  });
}

async function primaLaCopia(richiesta) {
  const copia = await caches.open(COPIA_FILE);
  const trovata = await copia.match(richiesta);
  if (trovata) return trovata;
  const risposta = await fetch(richiesta);
  if (risposta.ok) copia.put(richiesta, risposta.clone());
  return risposta;
}

// Una pagina in copia serve a poco se i suoi file (script, stili) non lo sono: appena si tiene una pagina,
// si tengono anche i file che cita. Per gli stili si guarda dentro, per i caratteri.
async function tieniIFile(risposta) {
  try {
    const testo = await risposta.text();
    const percorsi = new Set(testo.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []);
    const copia = await caches.open(COPIA_FILE);
    await Promise.all(
      [...percorsi].map(async (percorso) => {
        const richiesta = new Request(percorso);
        if (await copia.match(richiesta)) return;
        try {
          const r = await fetch(richiesta);
          if (!r.ok) return;
          await copia.put(richiesta, r.clone());
          if (/\.css(\?|$)/.test(percorso)) await tieniIFile(r);
        } catch {
          // un file che non arriva non deve fermare gli altri
        }
      }),
    );
  } catch {
    // niente da fare: la pagina resta in copia comunque
  }
}

const PAGINA_SENZA_RETE =
  '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>MyWineApp</title></head>" +
  '<body style="font-family:system-ui,sans-serif;background:#faf7f2;color:#2b2320;margin:0;padding:24px;line-height:1.5">' +
  '<h1 style="font-size:1.25rem">MyWineApp</h1><p>Senza rete, e questa pagina non è ancora sul telefono.</p>' +
  '<p>Appena torna il segnale riprova. Le bottiglie già inserite restano al sicuro sul telefono.</p>' +
  '<p><a href="" onclick="location.reload();return false" style="color:#8e3b46">Riprova</a></p></body></html>';

// Niente da mostrare: la pagina non è in copia e la rete non risponde (o risponde troppo piano).
async function senzaRete(richiesta, url, copia) {
  if (richiesta.mode === "navigate") {
    const inserimento = await copia.match(PAGINA_OFFLINE, { ignoreSearch: true });
    if (inserimento && url.pathname !== PAGINA_OFFLINE) {
      // Si porta all'inserimento rapido, ricordando la cantina se la pagina cercata era una cantina.
      const cantina = url.pathname.match(/^\/cantine\/([0-9a-f-]{36})/);
      const destinazione = new URL(PAGINA_OFFLINE + (cantina ? `?cantina=${cantina[1]}` : ""), self.location.origin);
      return Response.redirect(destinazione.href, 302);
    }
    if (inserimento) return inserimento;
    return new Response(PAGINA_SENZA_RETE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  // Richieste dei dati di una pagina (navigazione dentro l'app) e altro: un errore subito.
  // Chi le ha fatte (Next) ripiega su un caricamento normale della pagina, che passa da qui di nuovo.
  return new Response("", { status: 503 });
}

async function primaLaRete(evento, richiesta, url) {
  const copia = await caches.open(COPIA_PAGINE);
  const dallaRete = fetch(richiesta).then((risposta) => {
    // Le risposte arrivate dopo un reindirizzamento non si tengono: una copia così non può essere
    // riusata per aprire una pagina, e di solito è il rimando al login.
    if (risposta.ok && !risposta.redirected) {
      copia.put(richiesta, risposta.clone());
      // Anche l'inserimento rapido chiesto «in anticipo» dalla pagina (non è una navigazione) si tiene con i suoi file.
      if (richiesta.mode === "navigate" || url.pathname === PAGINA_OFFLINE) evento.waitUntil(tieniIFile(risposta.clone()));
    }
    return risposta;
  });
  dallaRete.catch(() => {}); // l'errore si gestisce sotto: qui evita il segnale di errore non gestito

  try {
    return await conLimite(dallaRete, ATTESA_RETE_MS);
  } catch {
    let trovata = await copia.match(richiesta);
    // L'inserimento rapido si apre anche con un "?cantina=..." che non era in copia.
    if (!trovata && url.pathname === PAGINA_OFFLINE) trovata = await copia.match(PAGINA_OFFLINE, { ignoreSearch: true });
    if (trovata) return trovata;
    // Nessuna copia. Per una pagina intera si aspetta ancora un po' la rete, poi ci si arrende senza congelare
    // la schermata. Per i dati di una pagina (navigazione dentro l'app) non serve: chi li chiede ripiega subito
    // su un caricamento normale della pagina, che ha la sua attesa.
    if (richiesta.mode !== "navigate") return senzaRete(richiesta, url, copia);
    try {
      return await conLimite(dallaRete, ATTESA_SENZA_COPIA_MS - ATTESA_RETE_MS);
    } catch {
      return senzaRete(richiesta, url, copia);
    }
  }
}

// L'inserimento rapido è una pagina che non cambia con i dati: se c'è la copia si apre subito, senza
// aspettare la rete (con poco segnale sarebbero secondi persi), e intanto si aggiorna in sottofondo.
async function inserimentoRapido(evento, richiesta, url) {
  const copia = await caches.open(COPIA_PAGINE);
  const trovata = await copia.match(PAGINA_OFFLINE, { ignoreSearch: true });
  if (!trovata) return primaLaRete(evento, richiesta, url);
  evento.waitUntil(
    (async () => {
      try {
        const r = await conLimite(fetch(PAGINA_OFFLINE, { credentials: "same-origin" }), 20000);
        if (r.ok && !r.redirected) {
          await copia.put(PAGINA_OFFLINE, r.clone());
          await tieniIFile(r.clone());
        }
      } catch {
        // niente rete: resta la copia che c'è
      }
    })(),
  );
  return trovata;
}

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;
  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/auth")) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname)) {
    evento.respondWith(primaLaCopia(richiesta));
    return;
  }
  if (richiesta.mode === "navigate" && url.pathname === PAGINA_OFFLINE) {
    evento.respondWith(inserimentoRapido(evento, richiesta, url));
    return;
  }
  evento.respondWith(primaLaRete(evento, richiesta, url));
});

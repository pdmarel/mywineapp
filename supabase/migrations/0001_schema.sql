-- FindMyWine — schema Supabase (Postgres)
-- STATO: scritto il 14/11/2026, NON ancora eseguito su un progetto Supabase.
-- Alla prima esecuzione leggere gli errori e correggere qui, poi togliere questa nota.
-- Applicare come migrazione: supabase/migrations/0001_schema.sql

create extension if not exists pgcrypto;

-- ───────────────────────── Cantine e accesso ─────────────────────────
-- Una "cantina" è il perimetro di condivisione (nel vecchio foglio: colonna OWNER).
create table cantine (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  creata_il   timestamptz not null default now()
);

create table cantina_membri (
  cantina_id  uuid not null references cantine(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  ruolo       text not null default 'editor' check (ruolo in ('proprietario','editor','lettore')),
  primary key (cantina_id, user_id)
);

create or replace function is_membro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cantina_membri m where m.cantina_id = c and m.user_id = auth.uid());
$$;

-- ───────────────────────── Anagrafiche ─────────────────────────
-- Luoghi fisici (vecchio foglio: Luogo = EM-home, EM-IWA, LL-Sard) e posizioni (A1, A10, B4, C7).
create table luoghi (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references cantine(id) on delete cascade,
  nome        text not null,
  unique (cantina_id, nome)
);

create table posizioni (
  id          uuid primary key default gen_random_uuid(),
  luogo_id    uuid not null references luoghi(id) on delete cascade,
  codice      text not null,            -- es. "A10"
  descrizione text,
  unique (luogo_id, codice)
);

-- Elenco chiuso ereditato dal foglio "Valori".
create type tipologia_vino as enum (
  'Bianco','Bianco frizzante','Bianco passito','Liquoroso','Rosa','Rosa frizzante',
  'Rosso','Rosso frizzante','Rosso passito','Speciale',
  'Spumante bianco','Spumante dolce','Spumante rosa','Sake'
);

-- ───────────────────────── Vini (l'etichetta) ─────────────────────────
create table vini (
  id              uuid primary key default gen_random_uuid(),
  cantina_id      uuid not null references cantine(id) on delete cascade,
  nome_fantasia   text,
  denominazione   text,                 -- sempre con sigla: "Barolo DOCG"
  annata          smallint check (annata between 1800 and 2100),   -- null = senza annata
  produttore      text,
  tipologia       tipologia_vino,
  alcool          numeric(4,1),
  capacita_cl     smallint,             -- 75, 150, 37...
  vitigni         jsonb,                -- [{"nome":"Sangiovese","pct":90}]  pct può mancare
  vitigni_fonte   text check (vitigni_fonte in ('etichetta','web','disciplinare','manuale')),
  punteggi        jsonb,                -- [{"guida":"Parker","voto":"96","anno":2019}]
  foto_fronte     text,                 -- percorso nel bucket "etichette", non URL
  foto_retro      text,
  -- stato dell'estrazione automatica, separato dai dati: mai scrivere "Non trovato" nei campi
  stato           text not null default 'da_analizzare'
                  check (stato in ('da_analizzare','in_coda','da_confermare','confermato','errore')),
  estrazione      jsonb,                -- risposta grezza del modello + provider + confidenze
  errore          text,
  id_foglio       integer,              -- ID della riga nel vecchio Google Sheet (solo righe importate)
  creato_il       timestamptz not null default now(),
  aggiornato_il   timestamptz not null default now()
);
create index on vini (cantina_id, produttore, nome_fantasia, annata);

-- ───────────────────────── Giacenze ─────────────────────────
-- Lo stesso vino può stare in più posizioni. Quantità 0 resta in archivio (storico).
create table giacenze (
  id            uuid primary key default gen_random_uuid(),
  vino_id       uuid not null references vini(id) on delete cascade,
  posizione_id  uuid not null references posizioni(id),
  quantita      integer not null default 0 check (quantita >= 0),
  aggiornato_il timestamptz not null default now(),
  unique (vino_id, posizione_id)
);

create table movimenti (
  id            uuid primary key default gen_random_uuid(),
  giacenza_id   uuid not null references giacenze(id) on delete cascade,
  delta         integer not null,       -- +6 carico, -1 bottiglia stappata
  motivo        text,                   -- 'carico','consumo','regalo','rettifica','spostamento'
  user_id       uuid references auth.users(id),
  creato_il     timestamptz not null default now()
);

-- ───────────────────────── Prezzi ─────────────────────────
-- Storico: ogni rilevazione è una riga, non si sovrascrive.
create table prezzi (
  id              uuid primary key default gen_random_uuid(),
  vino_id         uuid not null references vini(id) on delete cascade,
  prezzo          numeric(8,2) check (prezzo > 0),   -- null = cercato e non trovato
  valuta          text not null default 'EUR',
  annata_trovata  smallint,             -- se diversa dall'annata del vino, va mostrato
  fonte           text,                 -- nome del sito
  url             text,
  metodo          text,                 -- 'json-ld','snippet','ai','manuale'
  provider        text,                 -- quale API di ricerca
  rilevato_il     timestamptz not null default now()
);
create index on prezzi (vino_id, rilevato_il desc);

create view vini_valore with (security_invoker = true) as
select v.id as vino_id, v.cantina_id,
       coalesce(sum(g.quantita), 0) as bottiglie,
       p.prezzo as ultimo_prezzo, p.rilevato_il as prezzo_del,
       coalesce(sum(g.quantita), 0) * p.prezzo as valore
from vini v
left join giacenze g on g.vino_id = v.id
left join lateral (
  select prezzo, rilevato_il from prezzi
  where vino_id = v.id and prezzo is not null
  order by rilevato_il desc limit 1
) p on true
group by v.id, v.cantina_id, p.prezzo, p.rilevato_il;

-- ───────────────────────── Degustazioni ─────────────────────────
create table degustazioni (
  id            uuid primary key default gen_random_uuid(),
  cantina_id    uuid not null references cantine(id) on delete cascade,
  vino_id       uuid references vini(id) on delete set null,  -- null: vino assaggiato fuori cantina
  vino_libero   text,                   -- descrizione quando vino_id è null
  user_id       uuid not null references auth.users(id),
  degustato_il  date not null default current_date,
  audio         text,                   -- percorso nel bucket "vocali"
  trascrizione  text,
  scheda        jsonb,                  -- parametri statici (visivo, olfattivo, gusto-olfattivo)
  dinamica      jsonb,                  -- formato in references/degustazione-e-mappa3d.md
  note          text,
  punteggio     numeric(4,1),
  stato         text not null default 'bozza' check (stato in ('bozza','in_coda','da_confermare','confermata','errore')),
  creato_il     timestamptz not null default now()
);

-- ───────────────────────── Uso delle API gratuite ─────────────────────────
-- Contatore per non sforare le quote e per capire quale provider regge.
create table uso_api (
  giorno    date not null default current_date,
  provider  text not null,
  compito   text not null,              -- 'etichetta','prezzo','trascrizione','degustazione'
  ok        integer not null default 0,
  errori    integer not null default 0,
  primary key (giorno, provider, compito)
);

-- ───────────────────────── RLS ─────────────────────────
alter table cantine         enable row level security;
alter table cantina_membri  enable row level security;
alter table luoghi          enable row level security;
alter table posizioni       enable row level security;
alter table vini            enable row level security;
alter table giacenze        enable row level security;
alter table movimenti       enable row level security;
alter table prezzi          enable row level security;
alter table degustazioni    enable row level security;
alter table uso_api         enable row level security;   -- nessuna policy: solo service role

create policy cantine_membri   on cantine        for all using (is_membro(id)) with check (is_membro(id));
create policy membri_propri    on cantina_membri for select using (user_id = auth.uid() or is_membro(cantina_id));
create policy luoghi_membri    on luoghi         for all using (is_membro(cantina_id)) with check (is_membro(cantina_id));
create policy posizioni_membri on posizioni      for all
  using (exists (select 1 from luoghi l where l.id = luogo_id and is_membro(l.cantina_id)))
  with check (exists (select 1 from luoghi l where l.id = luogo_id and is_membro(l.cantina_id)));
create policy vini_membri      on vini           for all using (is_membro(cantina_id)) with check (is_membro(cantina_id));
create policy giacenze_membri  on giacenze       for all
  using (exists (select 1 from vini v where v.id = vino_id and is_membro(v.cantina_id)))
  with check (exists (select 1 from vini v where v.id = vino_id and is_membro(v.cantina_id)));
create policy movimenti_membri on movimenti      for all
  using (exists (select 1 from giacenze g join vini v on v.id = g.vino_id where g.id = giacenza_id and is_membro(v.cantina_id)))
  with check (exists (select 1 from giacenze g join vini v on v.id = g.vino_id where g.id = giacenza_id and is_membro(v.cantina_id)));
create policy prezzi_membri    on prezzi         for select
  using (exists (select 1 from vini v where v.id = vino_id and is_membro(v.cantina_id)));   -- scrive solo il server
create policy degust_membri    on degustazioni   for all using (is_membro(cantina_id)) with check (is_membro(cantina_id));

-- La prima cantina di un utente si crea dal server (service role) insieme alla riga in cantina_membri:
-- con la sola policy qui sopra un utente non potrebbe inserire una cantina di cui non è ancora membro.

-- ───────────────────────── Storage ─────────────────────────
-- Due bucket PRIVATI: "etichette" e "vocali". Percorso: {cantina_id}/{vino_id|degustazione_id}/nome.ext
-- Le policy su storage.objects controllano il primo segmento del percorso.
insert into storage.buckets (id, name, public) values ('etichette','etichette',false), ('vocali','vocali',false)
on conflict (id) do nothing;

create policy file_membri on storage.objects for all
  using  (bucket_id in ('etichette','vocali') and is_membro(((storage.foldername(name))[1])::uuid))
  with check (bucket_id in ('etichette','vocali') and is_membro(((storage.foldername(name))[1])::uuid));

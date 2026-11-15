-- MyWineApp — inviti: le persone che un proprietario fa entrare in una cantina.
-- Da eseguire una volta in Supabase → SQL Editor (incolla tutto e premi Run).
-- STATO: scritto il 14/11/2026, NON ancora eseguito. Finché non lo è, nell'app entrano solo i proprietari.

create table if not exists inviti (
  cantina_id  uuid not null references cantine(id) on delete cascade,
  email       text not null check (email = lower(email)),
  invitato_da uuid references auth.users(id) on delete set null,
  creato_il   timestamptz not null default now(),
  primary key (cantina_id, email)
);
create index if not exists inviti_email on inviti (email);

-- Nessuna policy: la tabella si legge e si scrive solo dal server dell'app (chiave di servizio),
-- dopo aver verificato che chi invita sia proprietario della cantina.
alter table inviti enable row level security;

-- MyWineApp — registro delle modifiche: chi ha cambiato cosa e quando, in ogni cantina.
-- Da eseguire una volta in Supabase → SQL Editor (incolla tutto e premi Run).
-- STATO: scritto il 16/11/2026, NON ancora eseguito. Finché non lo è, l'app funziona come prima e la pagina «Attività» lo dice.
--
-- Come funziona: dei trigger nel database scrivono una riga in `registro` ogni volta che un vino, una
-- giacenza (quantità), un luogo, una posizione o una degustazione viene inserito, cambiato o cancellato.
-- L'autore è l'utente collegato (auth.uid()); se il cambiamento lo fa il server da solo (lettura
-- automatica dell'etichetta, prezzi) l'autore resta vuoto e l'app scrive «Automatico».
-- Si leggono solo i proprietari della cantina; nessuno scrive a mano nel registro.

create table if not exists registro (
  id          bigint generated always as identity primary key,
  cantina_id  uuid not null,                       -- senza vincolo: se la cantina viene cancellata il registro non blocca nulla
  user_id     uuid,                                -- chi ha fatto la modifica (vuoto = automatico)
  email       text,                                -- copiata qui, così resta anche se l'utente sparisce
  azione      text not null check (azione in ('inserimento','modifica','cancellazione')),
  tabella     text not null,                       -- vini, giacenze, luoghi, posizioni, degustazioni
  riga_id     uuid,
  etichetta   text,                                -- nome leggibile: il vino, la posizione…
  prima       jsonb,                               -- solo i campi cambiati (valori vecchi)
  dopo        jsonb,                               -- solo i campi cambiati (valori nuovi)
  creato_il   timestamptz not null default now()
);
create index if not exists registro_cantina_data on registro (cantina_id, creato_il desc);

alter table registro enable row level security;
drop policy if exists registro_proprietari on registro;
create policy registro_proprietari on registro for select
  using (exists (select 1 from cantina_membri m
                 where m.cantina_id = registro.cantina_id and m.user_id = auth.uid() and m.ruolo = 'proprietario'));
-- Nessuna policy di scrittura: scrivono solo i trigger (security definer).

create or replace function registra_modifica() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  riga      jsonb := to_jsonb(coalesce(new, old));
  vecchia   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  nuova     jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  cant      uuid;
  nome      text;
  p         jsonb := '{}'::jsonb;
  d         jsonb := '{}'::jsonb;
  k         text;
  -- campi che cambiano da soli o che sono rumore: non fanno una riga di registro
  ignorati  text[] := array['aggiornato_il','creato_il','creata_il','estrazione','errore','stato','audio','trascrizione'];
  -- campi grandi: si scrive solo che sono cambiati
  grandi    text[] := array['locale','scheda','dinamica'];
  pos       record;
begin
  -- a quale cantina appartiene la riga
  if tg_table_name in ('vini','luoghi','degustazioni') then
    cant := (riga->>'cantina_id')::uuid;
  elsif tg_table_name = 'giacenze' then
    select cantina_id into cant from vini where id = (riga->>'vino_id')::uuid;
  elsif tg_table_name = 'posizioni' then
    select cantina_id into cant from luoghi where id = (riga->>'luogo_id')::uuid;
  end if;
  -- cancellazione a cascata di una cantina o di un vino: il genitore non c'è più, niente da registrare
  if cant is null or not exists (select 1 from cantine where id = cant) then
    return coalesce(new, old);
  end if;

  -- nome leggibile
  if tg_table_name = 'vini' then
    nome := nullif(trim(concat_ws(' ', riga->>'produttore', riga->>'nome_fantasia', riga->>'denominazione', riga->>'annata')), '');
  elsif tg_table_name = 'giacenze' then
    select nullif(trim(concat_ws(' ', produttore, nome_fantasia, denominazione, annata)), '') into nome from vini where id = (riga->>'vino_id')::uuid;
    select codice into pos from posizioni where id = (riga->>'posizione_id')::uuid;
    nome := concat_ws(' @ ', nome, pos.codice);
  elsif tg_table_name = 'luoghi' then
    nome := riga->>'nome';
  elsif tg_table_name = 'posizioni' then
    nome := riga->>'codice';
  elsif tg_table_name = 'degustazioni' then
    select nullif(trim(concat_ws(' ', produttore, nome_fantasia, denominazione, annata)), '') into nome from vini where id = nullif(riga->>'vino_id','')::uuid;
    nome := coalesce(nome, riga->>'vino_libero');
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(nuova) loop
      continue when k = any(ignorati);
      continue when vecchia->k is not distinct from nuova->k;
      if k = any(grandi) then
        p := p || jsonb_build_object(k, '(modificato)');
        d := d || jsonb_build_object(k, '(modificato)');
      else
        p := p || jsonb_build_object(k, vecchia->k);
        d := d || jsonb_build_object(k, nuova->k);
      end if;
    end loop;
    if d = '{}'::jsonb then
      return new;                                    -- cambiati solo campi di servizio
    end if;
  end if;

  insert into registro (cantina_id, user_id, email, azione, tabella, riga_id, etichetta, prima, dopo)
  values (
    cant,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    case tg_op when 'INSERT' then 'inserimento' when 'UPDATE' then 'modifica' else 'cancellazione' end,
    tg_table_name,
    (riga->>'id')::uuid,
    nome,
    case when tg_op = 'UPDATE' then p else null end,
    case when tg_op = 'UPDATE' then d else null end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['vini','giacenze','luoghi','posizioni','degustazioni'] loop
    execute format('drop trigger if exists registro_%1$s on %1$s', t);
    execute format('create trigger registro_%1$s after insert or update or delete on %1$s for each row execute function registra_modifica()', t);
  end loop;
end $$;

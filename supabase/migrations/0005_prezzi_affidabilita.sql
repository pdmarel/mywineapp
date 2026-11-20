-- MyWineApp — prezzo di riferimento con affidabilità.
-- Da eseguire una volta in Supabase → SQL Editor (incolla tutto e premi Run).
-- STATO: scritto il 20/11/2026, NON ancora eseguito. Finché non lo è, l'app funziona lo stesso: i prezzi (anche
-- quelli stimati) vengono salvati, ma senza la percentuale di affidabilità e senza la nota.
--
-- affidabilita: da 0 a 100, quanto ci si può fidare del prezzo. Alta per un prezzo letto su un'enoteca per
--   la stessa annata, più bassa per un'altra annata, ancora più bassa per una stima (metodo = 'stima').
-- nota: per le stime, la forbice e su che cosa si fonda.

alter table prezzi add column if not exists affidabilita smallint check (affidabilita between 0 and 100);
alter table prezzi add column if not exists nota text;

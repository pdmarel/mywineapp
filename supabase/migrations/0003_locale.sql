-- Raffigurazione grafica della cantina: per ogni luogo, il disegno del locale e dei suoi scaffali.
-- Un solo campo in più, facoltativo: finché è vuoto il luogo funziona come prima.
--
-- Contenuto (controllato dall'app, vedi lib/locale.ts):
--   { "larghezza": 1.5, "profondita": 2, "altezza": 2.2,            -- metri
--     "scaffali": [ { "id": "...", "nome": "A", "parete": "fondo", "posto": 1, "distanza": 0,   -- posto 1-5; distanza = spazio libero prima
--                     "larghezza": 100, "altezza": 180, "profondita": 35,   -- centimetri
--                     "piani": [ { "parti": ["A1"] }, { "parti": ["A2-1", "A2-2"] } ] } ] }   -- dall'alto
-- Il nome di ogni parte è il codice di una posizione del luogo (tabella posizioni): le bottiglie
-- si contano da lì, non vengono copiate nel disegno.

alter table luoghi add column if not exists locale jsonb;

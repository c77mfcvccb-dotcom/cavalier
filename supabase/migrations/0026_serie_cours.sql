-- ============================================================
--  0026 — Les cours répétés partagent une série
--
--  Un cours qui « se répète chaque semaine » (client, ClubCours.jsx)
--  pose une ligne par occurrence — jusqu'à 52 d'un coup. Les
--  supprimer une par une pour annuler l'année n'a pas de sens :
--  chaque lot d'occurrences porte désormais le même `serie_id`,
--  posé par le client au moment de la création. Un cours créé seul
--  n'appartient à aucune série (`serie_id` reste nul).
-- ============================================================

alter table public.cours
  add column if not exists serie_id uuid;

-- Retrouver toute une série pour la supprimer d'un coup — la
-- politique cours_delete (club_id = auth.uid()) s'applique déjà
-- ligne à ligne, quel que soit le filtre utilisé.
create index if not exists idx_cours_serie on public.cours (serie_id) where serie_id is not null;

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    insert into cours (club_id, debut, fin, discipline, serie_id)
--    values
--      ('<club>', now(), now() + interval '1 hour', 'dressage', gen_random_uuid()),
--      ('<club>', now() + interval '7 days', now() + interval '7 days 1 hour', 'dressage',
--       (select serie_id from cours order by cree_le desc limit 1));
--      -- deux lignes, même serie_id
--
--    delete from cours where serie_id = (select serie_id from cours order by cree_le desc limit 1);
--      -- les deux partent ensemble
-- ------------------------------------------------------------

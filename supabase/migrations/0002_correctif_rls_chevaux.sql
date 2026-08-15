-- ============================================================
--  Correctif : « new row violates row-level security policy
--  for table "chevaux" » à la création d'un cheval.
--
--  Cause : le client fait INSERT ... RETURNING (.insert().select()).
--  PostgreSQL applique alors AUSSI la politique SELECT à la ligne
--  renvoyée. Or à cet instant :
--    - la liaison dans cheval_cavaliers n'existe pas encore
--      (elle est créée par le trigger AFTER INSERT) ;
--    - la nouvelle ligne n'est pas visible à une sous-requête sur
--      « chevaux », donc même le test club_id échoue à travers la
--      fonction a_acces_cheval.
--
--  Correctif : tester d'abord les colonnes de la ligne elle-même
--  (cree_par, club_id), qui sont lisibles immédiatement, avant de
--  retomber sur a_acces_cheval pour tous les autres cas.
--
--  À exécuter tel quel dans le SQL Editor de Supabase.
-- ============================================================

drop policy if exists chevaux_select on public.chevaux;

create policy chevaux_select on public.chevaux for select to authenticated
  using (
    cree_par = auth.uid()
    or club_id = auth.uid()
    or a_acces_cheval(id, auth.uid())
  );

-- Filet de sécurité : cree_par est renseigné côté serveur si le client l'omet.
alter table public.chevaux alter column cree_par set default auth.uid();

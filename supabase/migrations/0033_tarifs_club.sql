-- ============================================================
-- 0033 : Tarifs du club
--
-- Le club publie librement sa grille de tarifs — pas de catégorie
-- imposée, chaque écurie a les siennes (demi-pension, pension complète,
-- pension pré, cours à l'unité…). Les cavaliers adhérents la consultent
-- en lecture seule, ligne par ligne, triée dans l'ordre choisi par le
-- club. Masquer une ligne la retire de leur vue sans effacer l'historique
-- côté club (tarif suspendu, en révision…) — la suppression reste un
-- geste séparé, volontaire.
-- ============================================================

create table if not exists public.tarifs_club (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.profils (id) on delete cascade,
  nom         text not null,
  prix        numeric(10, 2) not null check (prix >= 0),
  periodicite text not null default 'mois'
              check (periodicite in ('mois', 'seance', 'unique')),
  description text,
  visible     boolean not null default true,
  ordre       integer not null default 0,
  cree_le     timestamptz not null default now()
);

create index if not exists idx_tarifs_club_club on public.tarifs_club (club_id, ordre);

alter table public.tarifs_club enable row level security;

-- Le club voit toutes ses lignes, masquées comprises — c'est lui qui les
-- gère. Un cavalier adhérent (même relation que les cours, 0018) ne voit
-- que les lignes visibles : la sienne à consulter, pas à administrer.
drop policy if exists tarifs_club_select on public.tarifs_club;
create policy tarifs_club_select on public.tarifs_club for select to authenticated
  using (
    club_id = auth.uid()
    or (visible and est_cavalier_du_club(club_id, auth.uid()))
  );

drop policy if exists tarifs_club_insert on public.tarifs_club;
create policy tarifs_club_insert on public.tarifs_club for insert to authenticated
  with check (club_id = auth.uid());

drop policy if exists tarifs_club_update on public.tarifs_club;
create policy tarifs_club_update on public.tarifs_club for update to authenticated
  using (club_id = auth.uid());

drop policy if exists tarifs_club_delete on public.tarifs_club;
create policy tarifs_club_delete on public.tarifs_club for delete to authenticated
  using (club_id = auth.uid());

-- ------------------------------------------------------------
--  Contrôle après exécution (connecté comme le club A, une ligne posée
--  visible et une masquée ; puis connecté comme Camille, adhérente du
--  club A) :
--
--    select set_config('request.jwt.claim.sub', '<club A>', true);
--    insert into tarifs_club (club_id, nom, prix, periodicite) values
--      ('<club A>', 'Demi-pension', 180, 'mois');
--
--    select set_config('request.jwt.claim.sub', '<camille>', true);
--    select count(*) from tarifs_club where club_id = '<club A>';
--      -- 1 : seule la ligne visible
-- ------------------------------------------------------------

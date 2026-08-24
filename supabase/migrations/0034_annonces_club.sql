-- ============================================================
-- 0034 : Annonces du club
--
-- Le club n'a aujourd'hui aucun moyen de prévenir ses adhérents autrement
-- qu'en personne — une fermeture exceptionnelle, un stage à venir, une
-- actualité. Ce n'est pas un calendrier (les créneaux et cours existent
-- déjà pour ça) : juste un fil, chronologique, sans mise en scène. Une
-- annonce dépassée se supprime, elle ne se masque pas — contrairement aux
-- tarifs (0033), rien ici n'a vocation à rester en archive.
-- ============================================================

create table if not exists public.annonces_club (
  id      uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.profils (id) on delete cascade,
  titre   text not null,
  contenu text not null,
  type    text not null default 'info'
          check (type in ('info', 'fermeture', 'stage')),
  cree_le timestamptz not null default now()
);

create index if not exists idx_annonces_club_club on public.annonces_club (club_id, cree_le desc);

alter table public.annonces_club enable row level security;

-- Même relation que les cours et les tarifs : le club gère les siennes,
-- un cavalier adhérent lit celles de son club — toutes, il n'y a pas de
-- masquage ici (à la différence des tarifs, une annonce n'a pas vocation
-- à rester en coulisses : elle est publiée ou supprimée).
drop policy if exists annonces_club_select on public.annonces_club;
create policy annonces_club_select on public.annonces_club for select to authenticated
  using (
    club_id = auth.uid()
    or est_cavalier_du_club(club_id, auth.uid())
  );

drop policy if exists annonces_club_insert on public.annonces_club;
create policy annonces_club_insert on public.annonces_club for insert to authenticated
  with check (club_id = auth.uid());

drop policy if exists annonces_club_update on public.annonces_club;
create policy annonces_club_update on public.annonces_club for update to authenticated
  using (club_id = auth.uid());

drop policy if exists annonces_club_delete on public.annonces_club;
create policy annonces_club_delete on public.annonces_club for delete to authenticated
  using (club_id = auth.uid());

-- ------------------------------------------------------------
--  Contrôle après exécution (connecté comme le club A, une annonce
--  postée ; puis connecté comme Camille, adhérente du club A) :
--
--    select set_config('request.jwt.claim.sub', '<club A>', true);
--    insert into annonces_club (club_id, titre, contenu, type) values
--      ('<club A>', 'Fermeture le 15 août', 'Le club sera fermé.', 'fermeture');
--
--    select set_config('request.jwt.claim.sub', '<camille>', true);
--    select count(*) from annonces_club where club_id = '<club A>';
--      -- 1
-- ------------------------------------------------------------

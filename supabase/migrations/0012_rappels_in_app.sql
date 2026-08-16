-- ============================================================
--  Rappels de soins : abandon de l'email, passage à l'in-app.
--
--  L'envoi planifié supposait un prestataire d'emailing, un cron et
--  quatre secrets. Une cloche dans l'en-tête rend le même service
--  sans aucune de ces dépendances — et sans le risque propre à
--  l'email, où un rappel qui part de travers ne se rattrape pas.
--
--  Ce qui disparaît : le journal d'envois, la fonction de sélection
--  des destinataires, et le consentement email. Ce qui reste de
--  0011 : les périodicités par cheval, le seuil à 14 jours, et la
--  vue v_echeances — c'est précisément la logique que la cloche
--  réutilise.
--
--  À exécuter après 0011. Sans danger si 0011 n'a pas été passée :
--  tout est en `if exists`.
-- ============================================================

-- ------------------------------------------------------------
--  1. Démontage de l'envoi par email
--
--  Aucune donnée perdue : `rappels_envoyes` n'a jamais été écrite
--  faute de cron, et `rappels_email` valait `true` partout, sa
--  valeur par défaut. Supprimer plutôt que laisser dormir évite la
--  table fantôme que personne n'ose toucher trois ans plus tard.
--
--  L'ordre compte : la fonction avant la table, sinon la
--  dépendance bloque.
-- ------------------------------------------------------------
drop function if exists public.rappels_du_jour();
drop table if exists public.rappels_envoyes;

alter table public.profils
  drop column if exists rappels_email;

-- ------------------------------------------------------------
--  2. Marquage « lu »
--
--  La clé porte l'échéance elle-même, et non le seul soin : quand
--  une ferrure est refaite, la nouvelle échéance n'a jamais été
--  lue, et la cloche redevient légitimement active. C'est le même
--  raisonnement que pour le journal d'envois qu'elle remplace.
--
--  Le marquage est PERSONNEL, contrairement aux périodicités qui
--  appartiennent au cheval : sur un cheval en demi-pension, que
--  l'un ait pris connaissance du rappel ne dit rien de l'autre.
-- ------------------------------------------------------------
create table if not exists public.rappels_lus (
  profil_id uuid not null references public.profils (id) on delete cascade,
  soin_id   uuid not null references public.soins (id) on delete cascade,
  echeance  date not null,
  lu_le     timestamptz not null default now(),
  primary key (profil_id, soin_id, echeance)
);

alter table public.rappels_lus enable row level security;

-- Chacun ne marque et ne lit que ses propres accusés de lecture.
-- Pas de politique d'UPDATE : un rappel se marque ou se démarque,
-- il ne se modifie pas.
drop policy if exists rappels_lus_select on public.rappels_lus;
create policy rappels_lus_select on public.rappels_lus for select to authenticated
  using (profil_id = auth.uid());

drop policy if exists rappels_lus_insert on public.rappels_lus;
create policy rappels_lus_insert on public.rappels_lus for insert to authenticated
  with check (profil_id = auth.uid() and est_premium(auth.uid()));

drop policy if exists rappels_lus_delete on public.rappels_lus;
create policy rappels_lus_delete on public.rappels_lus for delete to authenticated
  using (profil_id = auth.uid());

-- ------------------------------------------------------------
--  3. Ce que la cloche affiche
--
--  Bâtie sur `v_echeances` plutôt qu'en refaisant le calcul : le
--  seuil des 14 jours, le dédoublonnage par type et le respect des
--  rappels coupés y vivent déjà. Deux définitions de « ce qui est
--  urgent » auraient divergé au premier ajustement.
--
--  `security_invoker` : la vue n'ouvre aucun accès. Un cavalier n'y
--  voit que les chevaux auxquels il a droit, et que ses propres
--  accusés de lecture.
-- ------------------------------------------------------------
create or replace view public.v_rappels
with (security_invoker = on)
as
select
  e.id,
  e.cheval_id,
  e.cheval_nom,
  e.cheval_photo,
  e.type,
  e.prochaine_echeance,
  e.jours_restants,
  e.statut,
  (l.profil_id is not null) as lu,
  l.lu_le
from public.v_echeances e
left join public.rappels_lus l
  on l.soin_id = e.id
 and l.echeance = e.prochaine_echeance
 and l.profil_id = auth.uid()
-- Une échéance à jour n'est pas un rappel : elle reste visible sur
-- l'accueil, en vert, mais n'a rien à faire dans la cloche.
where e.statut in ('retard', 'urgent');

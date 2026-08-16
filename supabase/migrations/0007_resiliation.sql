-- ============================================================
--  Résiliation depuis l'application
--
--  1. Un abonnement résilié garde l'accès jusqu'à l'échéance déjà
--     payée. Ce n'était PAS le cas : est_premium() excluait le
--     statut « annule », si bien qu'une résiliation coupait l'accès
--     sur-le-champ, alors que la période est due.
--  2. L'URL du portail client RevenueCat est conservée, pour offrir
--     un bouton de résiliation direct dans le profil.
--
--  À exécuter après 0006.
-- ============================================================

-- ------------------------------------------------------------
--  1. Portail de gestion RevenueCat
--
--  Renseignée par le webhook quand RevenueCat la transmet. Le
--  client ne peut que la lire, comme le reste de la table.
-- ------------------------------------------------------------
alter table public.abonnements
  add column if not exists url_gestion text;

-- ------------------------------------------------------------
--  2. « Résilié » n'est pas « expiré »
--
--  RevenueCat émet CANCELLATION dès que le renouvellement est
--  coupé, mais la période en cours reste due : l'accès doit courir
--  jusqu'à expire_le. C'est EXPIRATION qui met réellement fin au
--  service, et la date fait foi dans tous les cas.
-- ------------------------------------------------------------
create or replace function public.est_premium(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = auth.uid()
     and exists (
       select 1 from abonnements a
       where a.profil_id = p_user
         and a.statut in ('actif', 'essai', 'annule')
         and (a.expire_le is null or a.expire_le > now())
     );
$$;

create or replace function public.premium_actif(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from abonnements a
    where a.profil_id = p_user
      and a.statut in ('actif', 'essai', 'annule')
      and (a.expire_le is null or a.expire_le > now())
  );
$$;

revoke all on function public.premium_actif(uuid) from public, anon, authenticated;

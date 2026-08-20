-- ============================================================
--  0023 — Les rôles de pension : demi, tiers, complète
--
--  Une écurie ne loge pas ses cavaliers sur deux cases : entre la
--  demi-pension et le cheval de club, il y a le tiers de pension
--  (trois cavaliers se partagent le cheval) et la pension complète
--  (le cheval est à lui seul). Le rôle posé à l'attribution doit
--  dire la réalité — c'est lui qui s'affiche sur la fiche, dans
--  « Mes cavaliers » et sur le calendrier.
--
--  Deux nouveaux rôles donc, partout où un rôle se contrôle :
--  la contrainte de la table, et la fonction d'attribution du club.
--  « propriétaire » ne s'attribue toujours pas : il se constate à
--  la création du cheval, rien d'autre ne le confère.
-- ============================================================

-- ------------------------------------------------------------
--  1. La contrainte de la table
--
--  Le nom vient de la déclaration en ligne de 0001 :
--  cheval_cavaliers_role_check. On la repose élargie ; les lignes
--  existantes portent toutes un des trois anciens rôles, rien à
--  reprendre.
-- ------------------------------------------------------------
alter table public.cheval_cavaliers
  drop constraint if exists cheval_cavaliers_role_check;
alter table public.cheval_cavaliers
  add constraint cheval_cavaliers_role_check
  check (role in (
    'proprietaire', 'demi_pension', 'tiers_pension', 'pension_complete', 'cavalier_club'
  ));

-- ------------------------------------------------------------
--  2. L'attribution par le club accepte les nouveaux rôles
--
--  Même corps que la 0020, seule la liste des rôles admis change —
--  et le message d'erreur avec elle.
-- ------------------------------------------------------------
create or replace function public.lier_membre_au_cheval(
  p_cheval uuid,
  p_cavalier uuid,
  p_remplace uuid default null,
  p_role text default 'cavalier_club'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheval chevaux%rowtype;
begin
  select * into v_cheval from chevaux where id = p_cheval;

  if not found or not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le gestionnaire du cheval peut lier un cavalier';
  end if;
  if v_cheval.club_id is null then
    raise exception 'CHEVAL_SANS_CLUB'
      using hint = 'La liaison directe sert aux chevaux de club — pour un cheval de particulier, générez un code d''invitation.';
  end if;
  if not est_cavalier_du_club(v_cheval.club_id, p_cavalier) then
    raise exception 'CAVALIER_HORS_CLUB'
      using hint = 'Ce cavalier n''est pas membre de l''écurie.';
  end if;
  -- « propriétaire » ne s'attribue pas, il se constate à la
  -- création du cheval.
  if p_role not in ('cavalier_club', 'demi_pension', 'tiers_pension', 'pension_complete') then
    raise exception 'ROLE_INVALIDE'
      using hint = 'Une attribution est en demi-pension, tiers de pension, pension complète ou cheval de club.';
  end if;
  if p_remplace is not null and not exists (
    select 1 from chevaux where id = p_remplace and club_id = v_cheval.club_id
  ) then
    p_remplace := null;
  end if;

  if exists (
    select 1 from cheval_cavaliers
    where cheval_id = p_cheval and cavalier_id = p_cavalier
  ) then
    -- Déjà liée : on ajuste le rôle plutôt que d'échouer — c'est le
    -- geste « passer la cavalière en DP » sans tout refaire.
    update cheval_cavaliers set role = p_role
    where cheval_id = p_cheval and cavalier_id = p_cavalier and role <> p_role
      and role <> 'proprietaire';
    return jsonb_build_object('deja_lie', true);
  end if;

  insert into cheval_cavaliers (cheval_id, cavalier_id, role, couleur, remplacement_de)
  values (p_cheval, p_cavalier, p_role, couleur_libre(p_cheval), p_remplace);

  return jsonb_build_object('deja_lie', false);
end;
$$;

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    -- connecté en club, sur un cheval de la cavalerie et un
--    -- membre de l'écurie :
--    select lier_membre_au_cheval('<cheval>', '<cavalier>', null, 'tiers_pension');
--      -- {"deja_lie": false} — et la fiche affiche « Tiers de pension »
--
--    select lier_membre_au_cheval('<cheval>', '<cavalier>', null, 'stagiaire');
--      -- ROLE_INVALIDE
-- ------------------------------------------------------------

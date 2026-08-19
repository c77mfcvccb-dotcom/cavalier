-- ============================================================
--  « Mes cavaliers » : l'écurie voit les chevaux en pension chez
--  elle, et attribue une monture avec son vrai rôle.
--
--  Deux retouches au service du même écran — celui où le gérant
--  tient ses cavaliers : qui monte quoi, en demi-pension ou en
--  cheval de club, et quels chevaux de propriétaires sont en
--  pension à l'écurie.
--
--  À exécuter après 0019.
-- ============================================================

-- ------------------------------------------------------------
--  1. Un cheval en pension est VISIBLE de son écurie
--
--  `ecurie_id` (0018) donnait le périmètre premium sans aucune
--  visibilité : l'écurie ne pouvait même pas lister les chevaux
--  stationnés chez elle — son écran « Mes cavaliers » aurait
--  affiché des pensions fantômes.
--
--  La lecture de la FICHE s'ouvre donc à l'écurie de pension.
--  Rien d'autre : a_acces_cheval() ne change pas, donc calendrier,
--  séances, soins et documents du cheval restent l'affaire du
--  propriétaire et des cavaliers qu'il a invités. La pension dit
--  « ce cheval vit ici », pas « ce cheval se gère d'ici ».
-- ------------------------------------------------------------
drop policy if exists chevaux_select on public.chevaux;
create policy chevaux_select on public.chevaux for select to authenticated
  using (
    cree_par = auth.uid()
    or club_id = auth.uid()
    or ecurie_id = auth.uid()
    or a_acces_cheval(id, auth.uid())
  );

-- ------------------------------------------------------------
--  2. L'attribution porte son rôle : demi-pension ou cheval de club
--
--  « C'est le club qui sélectionne le cheval pour l'attribuer au
--  cavalier en DP » : la liaison directe (0019) apprend donc à
--  poser le bon rôle. Le rôle est un libellé de réalité — la
--  demi-pensionnaire paye sa DP, la cavalière de club tourne sur
--  la cavalerie — et il s'affiche partout où la liaison apparaît.
--
--  La fonction change de signature : l'ancienne est supprimée
--  d'abord, sinon les deux coexisteraient et l'appel à trois
--  arguments deviendrait ambigu pour PostgREST.
-- ------------------------------------------------------------
drop function if exists public.lier_membre_au_cheval(uuid, uuid, uuid);

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
  -- Deux rôles et pas un de plus : « propriétaire » ne s'attribue
  -- pas, il se constate à la création du cheval.
  if p_role not in ('cavalier_club', 'demi_pension') then
    raise exception 'ROLE_INVALIDE'
      using hint = 'Une attribution est en demi-pension ou en cheval de club.';
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
--    select nom from chevaux where ecurie_id = auth.uid();
--      -- connecté en club : les chevaux en pension chez vous
--    select lier_membre_au_cheval(null, null);
--      -- « Seul le gestionnaire… » : la nouvelle signature répond
-- ------------------------------------------------------------

-- ============================================================
--  0029 — Un rôle « propriétaire » distinct du créateur
--
--  Jusqu'ici, sur un cheval de club, seul le club (club_id) gérait
--  la fiche : modification, suppression, accès, partage. Cette
--  migration permet au club de désigner un cavalier déjà lié au
--  cheval comme propriétaire — le rôle 'proprietaire' existe déjà
--  dans cheval_cavaliers (0023), il ne servait jusqu'ici qu'aux
--  chevaux personnels, posé automatiquement à la création (0001).
--
--  Une fois désignée, la propriétaire obtient l'EXCLUSIVITÉ des
--  droits de gestion : modifier la fiche, gérer les accès
--  (inviter, attribuer, retirer), partager/révoquer le lien
--  public, supprimer la fiche, retirer le cheval du club. Le club
--  passe alors en simple « écurie » : le cheval reste dans sa
--  cavalerie, il garde SANS CONDITION l'accès au planning du
--  cheval (créneaux, séances, cours, indisponibilités) et peut
--  toujours créer/voir les entrées partagées (soins non privés,
--  documents) — c'est déjà le comportement de a_acces_cheval(),
--  qui ne bouge pas. Ce qu'il perd, c'est la gestion de la fiche
--  elle-même.
--
--  Si aucune propriétaire n'est désignée, rien ne change : le
--  club (ou la cavalière propriétaire d'un cheval personnel, déjà
--  posée par le trigger de 0001) garde tous les droits, exactement
--  comme avant cette migration.
--
--  Conception : une nouvelle fonction est_proprietaire_cheval()
--  s'ajoute À CÔTÉ de est_gestionnaire_cheval(), qui ne bouge pas
--  du tout — elle reste la porte du planning (créneaux, séances,
--  indisponibilités), volontairement partagée club+propriétaire.
--  Seuls les points qui doivent devenir EXCLUSIFS à la propriétaire
--  quand elle existe basculent sur la nouvelle fonction.
--
--  À exécuter dans le SQL Editor de Supabase, après 0028.
-- ============================================================

-- ------------------------------------------------------------
--  est_proprietaire_cheval() : si une propriétaire est désignée
--  pour ce cheval (un rôle 'proprietaire' existe dans
--  cheval_cavaliers), SEULE elle qualifie. Sinon, on retombe
--  exactement sur est_gestionnaire_cheval() — le club d'un cheval
--  de club, ou la cavalière d'un cheval personnel (déjà propriétaire
--  via le trigger de 0001, donc jamais dans la branche de repli).
-- ------------------------------------------------------------
create or replace function public.est_proprietaire_cheval(p_cheval uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from cheval_cavaliers cc
      where cc.cheval_id = p_cheval and cc.role = 'proprietaire'
    )
    then exists (
      select 1 from cheval_cavaliers cc
      where cc.cheval_id = p_cheval and cc.cavalier_id = p_user and cc.role = 'proprietaire'
    )
    else est_gestionnaire_cheval(p_cheval, p_user)
  end;
$$;

-- --- chevaux : modifier / supprimer la fiche ---
drop policy if exists chevaux_update on public.chevaux;
create policy chevaux_update on public.chevaux for update to authenticated
  using (est_proprietaire_cheval(id, auth.uid()))
  with check (est_proprietaire_cheval(id, auth.uid()));

drop policy if exists chevaux_delete on public.chevaux;
create policy chevaux_delete on public.chevaux for delete to authenticated
  using (est_proprietaire_cheval(id, auth.uid()));

-- --- cheval_cavaliers : gérer les accès (quitter soi-même reste ouvert) ---
drop policy if exists cc_insert on public.cheval_cavaliers;
create policy cc_insert on public.cheval_cavaliers for insert to authenticated
  with check (est_proprietaire_cheval(cheval_id, auth.uid()));

drop policy if exists cc_update on public.cheval_cavaliers;
create policy cc_update on public.cheval_cavaliers for update to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()) or cavalier_id = auth.uid());

drop policy if exists cc_delete on public.cheval_cavaliers;
create policy cc_delete on public.cheval_cavaliers for delete to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()) or cavalier_id = auth.uid());

-- --- invitations ---
drop policy if exists inv_select on public.invitations;
create policy inv_select on public.invitations for select to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()));

drop policy if exists inv_update on public.invitations;
create policy inv_update on public.invitations for update to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()));

drop policy if exists inv_delete on public.invitations;
create policy inv_delete on public.invitations for delete to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()));

-- --- partages_publics : créer/révoquer le lien public ---
drop policy if exists partages_select on public.partages_publics;
create policy partages_select on public.partages_publics for select to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()));

drop policy if exists partages_update on public.partages_publics;
create policy partages_update on public.partages_publics for update to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()));

drop policy if exists partages_delete on public.partages_publics;
create policy partages_delete on public.partages_publics for delete to authenticated
  using (est_proprietaire_cheval(cheval_id, auth.uid()));

-- --- RPC déjà existantes : même redirection ---
create or replace function public.generer_code_invitation(
  p_cheval uuid,
  p_role text default 'demi_pension'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_essais int := 0;
  v_max integer;
begin
  if not est_proprietaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seule la propriétaire ou le club peut inviter un cavalier';
  end if;

  v_max := participants_max(p_cheval);
  if v_max is not null and nb_participants(p_cheval) >= v_max then
    raise exception 'CHEVAL_COMPLET'
      using hint = 'Ce cheval a atteint le nombre maximal de cavaliers.';
  end if;

  loop
    v_code := nouveau_code();
    exit when not exists (select 1 from invitations where code = v_code);
    v_essais := v_essais + 1;
    if v_essais > 20 then
      raise exception 'Impossible de générer un code, réessayez';
    end if;
  end loop;

  insert into invitations (cheval_id, code, role_propose, cree_par)
  values (p_cheval, v_code, p_role, auth.uid());

  return v_code;
end;
$$;

create or replace function public.creer_lien_public(p_cheval uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not est_proprietaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seule la propriétaire ou le club peut partager cette fiche';
  end if;

  -- Un seul lien actif à la fois : régénérer révoque le précédent.
  update partages_publics
     set actif = false, revoque_le = now()
   where cheval_id = p_cheval and actif;

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into partages_publics (cheval_id, token, cree_par)
  values (p_cheval, v_token, auth.uid());

  return v_token;
end;
$$;

create or replace function public.revoquer_lien_public(p_cheval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_proprietaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seule la propriétaire ou le club peut révoquer ce lien';
  end if;

  update partages_publics
     set actif = false, revoque_le = now()
   where cheval_id = p_cheval and actif;
end;
$$;

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

  if not found or not est_proprietaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seule la propriétaire du cheval peut lier un cavalier';
  end if;
  if v_cheval.club_id is null then
    raise exception 'CHEVAL_SANS_CLUB'
      using hint = 'La liaison directe sert aux chevaux de club — pour un cheval de particulier, générez un code d''invitation.';
  end if;
  if not est_cavalier_du_club(v_cheval.club_id, p_cavalier) then
    raise exception 'CAVALIER_HORS_CLUB'
      using hint = 'Ce cavalier n''est pas membre de l''écurie.';
  end if;
  -- « propriétaire » ne s'attribue pas ici, elle se désigne via
  -- designer_proprietaire().
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
--  designer_proprietaire() : geste réservé au club, sur un
--  cavalier déjà lié au cheval (« ayant rejoint le cheval »). Une
--  propriétaire déjà en place est rétrogradée en cavalier_club —
--  la désignation se réattribue, elle ne s'additionne pas.
-- ------------------------------------------------------------
create or replace function public.designer_proprietaire(p_cheval uuid, p_cavalier uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from chevaux where id = p_cheval;

  if v_club_id is null or v_club_id <> auth.uid() then
    raise exception 'Seul le club gérant ce cheval peut désigner une propriétaire';
  end if;
  if not exists (
    select 1 from cheval_cavaliers where cheval_id = p_cheval and cavalier_id = p_cavalier
  ) then
    raise exception 'CAVALIER_NON_LIE'
      using hint = 'Ce cavalier n''a pas encore rejoint ce cheval.';
  end if;

  update cheval_cavaliers set role = 'cavalier_club'
  where cheval_id = p_cheval and role = 'proprietaire' and cavalier_id <> p_cavalier;

  update cheval_cavaliers set role = 'proprietaire'
  where cheval_id = p_cheval and cavalier_id = p_cavalier;
end;
$$;

-- ------------------------------------------------------------
--  retirer_du_club() : ne sait QUE détacher un cheval de son club
--  (club_id → null), comme detacher_de_ecurie (0018) pour la
--  pension. Réservé à la propriétaire réellement désignée — pas au
--  repli « pas de propriétaire, le club garde tout », sans quoi le
--  club pourrait se détacher lui-même de son propre cheval.
-- ------------------------------------------------------------
create or replace function public.retirer_du_club(p_cheval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from cheval_cavaliers
    where cheval_id = p_cheval and cavalier_id = auth.uid() and role = 'proprietaire'
  ) then
    raise exception 'Seule la propriétaire désignée peut retirer ce cheval du club';
  end if;

  update chevaux set club_id = null where id = p_cheval;
end;
$$;

-- ------------------------------------------------------------
--  Contrôle après exécution (connecté en club, sur un cheval de
--  la cavalerie avec un cavalier déjà lié) :
--
--    select designer_proprietaire('<cheval>', '<cavalier>');
--
--    -- reconnecté en club : la fiche ne se modifie plus
--    update chevaux set nom = 'x' where id = '<cheval>';
--      -- 0 ligne affectée (RLS silencieuse)
--
--    -- le club garde le planning
--    select count(*) from creneaux where cheval_id = '<cheval>';
--      -- toujours visible
--
--    -- reconnecté comme la propriétaire désignée :
--    update chevaux set nom = 'x' where id = '<cheval>';
--      -- 1 ligne affectée
--    select retirer_du_club('<cheval>');
--      -- club_id devient null
-- ------------------------------------------------------------

-- ============================================================
--  Plusieurs cavaliers par cheval : borne haute, et message clair
--
--  Rien ne limitait le nombre de participants — un cheval pouvait
--  déjà être partagé entre six cavaliers, chacun voyant la fiche,
--  le calendrier et le carnet. Cette migration ne « débloque »
--  donc rien : elle pose une borne haute là où il n'y en avait
--  aucune, et fait remonter un refus que l'application sait dire.
--
--  Dix, parce que la palette du calendrier compte dix couleurs :
--  au-delà, deux cavaliers porteraient la même et le repère
--  visuel se perdrait. Et parce qu'un code d'invitation qui
--  circule dans un groupe de messagerie n'a, sans borne, plus
--  aucun garde-fou.
--
--  Un cheval de club en est exempté : une cavalerie d'école
--  tourne couramment avec vingt cavaliers, et c'est son usage
--  normal, pas un débordement.
--
--  ⚠ Le plan gratuit n'est pas touché : il reste à UN cheval par
--  compte, créé ou rejoint (migration 0006). Les deux règles sont
--  indépendantes — l'une compte les chevaux d'un compte, l'autre
--  les cavaliers d'un cheval.
--
--  À exécuter après 0012.
-- ============================================================

-- ------------------------------------------------------------
--  1. La borne, en un seul endroit
-- ------------------------------------------------------------
create or replace function public.participants_max(p_cheval uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when c.club_id is null then 10 else null end
  from chevaux c
  where c.id = p_cheval;
$$;

create or replace function public.nb_participants(p_cheval uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from cheval_cavaliers where cheval_id = p_cheval;
$$;

-- ------------------------------------------------------------
--  2. Le verrou : un trigger, pas une politique
--
--  Même raison qu'en 0006 : rejoindre_par_code() est en security
--  definer et passe outre le RLS de cheval_cavaliers. Seul un
--  trigger BEFORE INSERT couvre tous les chemins d'écriture.
--
--  Il s'ajoute à trg_quota_liaison sans le remplacer : celui-ci
--  regarde le compte du cavalier qui arrive, celui-ci regarde le
--  cheval qu'il rejoint.
-- ------------------------------------------------------------
create or replace function public.verifier_participants_cheval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer := participants_max(new.cheval_id);
begin
  if v_max is not null and nb_participants(new.cheval_id) >= v_max then
    raise exception 'CHEVAL_COMPLET'
      using hint = 'Ce cheval a atteint le nombre maximal de cavaliers.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_participants_cheval on public.cheval_cavaliers;
create trigger trg_participants_cheval
  before insert on public.cheval_cavaliers
  for each row execute function public.verifier_participants_cheval();

-- ------------------------------------------------------------
--  3. Refuser avant d'écrire, côté invitation
--
--  Le trigger protège de toute façon. Mais sans ce contrôle
--  explicite, le code d'invitation serait consommé par une
--  tentative vouée à échouer, et son porteur se retrouverait avec
--  un code brûlé pour rien.
--
--  L'ordre des vérifications compte : « déjà lié » d'abord — un
--  cavalier déjà présent ne doit buter ni sur le plafond du
--  cheval ni sur son propre quota.
-- ------------------------------------------------------------
create or replace function public.rejoindre_par_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invitations%rowtype;
  v_cheval chevaux%rowtype;
  v_max integer;
begin
  select * into v_inv
  from invitations
  where upper(trim(code)) = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Code introuvable';
  end if;
  if not v_inv.actif then
    raise exception 'Ce code n''est plus valable';
  end if;
  if v_inv.expire_le < now() then
    raise exception 'Ce code a expiré';
  end if;
  if v_inv.utilisations >= v_inv.utilisations_max then
    raise exception 'Ce code a déjà été utilisé';
  end if;

  select * into v_cheval from chevaux where id = v_inv.cheval_id;

  -- Déjà lié : on ne consomme pas le code et on ne bute sur aucune limite.
  if exists (
    select 1 from cheval_cavaliers
    where cheval_id = v_inv.cheval_id and cavalier_id = auth.uid()
  ) then
    return jsonb_build_object('cheval_id', v_cheval.id, 'nom', v_cheval.nom, 'deja_lie', true);
  end if;

  v_max := participants_max(v_inv.cheval_id);
  if v_max is not null and nb_participants(v_inv.cheval_id) >= v_max then
    raise exception 'CHEVAL_COMPLET'
      using hint = 'Ce cheval a atteint le nombre maximal de cavaliers.';
  end if;

  if not premium_actif(auth.uid()) and nb_chevaux_du_compte(auth.uid()) >= 1 then
    raise exception 'PLAN_GRATUIT_UN_CHEVAL'
      using hint = 'Le plan gratuit est limité à un cheval.';
  end if;

  insert into cheval_cavaliers (cheval_id, cavalier_id, role, couleur)
  values (v_inv.cheval_id, auth.uid(), v_inv.role_propose, couleur_libre(v_inv.cheval_id));

  update invitations
  set utilisations = utilisations + 1,
      actif = (utilisations + 1) < utilisations_max
  where id = v_inv.id;

  return jsonb_build_object('cheval_id', v_cheval.id, 'nom', v_cheval.nom, 'deja_lie', false);
end;
$$;

-- ------------------------------------------------------------
--  4. Refuser aussi à la génération du code
--
--  Distribuer un code pour un cheval complet ne peut que décevoir
--  celui qui le reçoit : autant le dire au propriétaire.
-- ------------------------------------------------------------
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
  if not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le propriétaire ou le club peut inviter un cavalier';
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

-- ------------------------------------------------------------
--  Note sur cheval_cavaliers.couleur
--
--  La colonne est encore écrite par couleur_libre(), mais plus
--  lue : depuis src/lib/couleurs.js, la couleur d'un cavalier se
--  déduit de son identifiant, ce qui la rend identique d'un cheval
--  à l'autre. Elle est laissée en place — la supprimer imposerait
--  de toucher aux triggers de création sans rien apporter.
-- ------------------------------------------------------------

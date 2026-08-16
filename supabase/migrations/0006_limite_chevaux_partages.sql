-- ============================================================
--  Le plan gratuit est limité à UN cheval au total, qu'il soit
--  créé par le compte ou rejoint avec un code de partage.
--
--  0005 ne comptait que les chevaux créés : un compte gratuit
--  pouvait donc rejoindre autant de chevaux qu'il voulait avec
--  des codes d'invitation.
--
--  À exécuter après 0005.
-- ============================================================

-- ------------------------------------------------------------
--  1. Compter les chevaux d'un compte, quelle que soit la voie
--
--  Un cavalier accède à ses chevaux par cheval_cavaliers, un club
--  par chevaux.club_id : les deux comptent.
-- ------------------------------------------------------------
create or replace function public.nb_chevaux_du_compte(p_user uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from cheval_cavaliers where cavalier_id = p_user)::int
       + (select count(*) from chevaux where club_id = p_user)::int;
$$;

-- ------------------------------------------------------------
--  2. Contrôle d'abonnement utilisable sur un tiers
--
--  est_premium() refuse volontairement de renseigner sur autrui.
--  Le trigger ci-dessous doit pourtant vérifier le compte du
--  cavalier ajouté, qui n'est pas forcément l'appelant : d'où
--  cette variante, dont l'exécution est retirée aux rôles client.
--  Elle n'est appelée que depuis des fonctions security definer,
--  où le rôle effectif est le propriétaire de la fonction.
-- ------------------------------------------------------------
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
      and a.statut in ('actif', 'essai')
      and (a.expire_le is null or a.expire_le > now())
  );
$$;

revoke all on function public.premium_actif(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
--  3. Le verrou : un trigger, pas une politique
--
--  rejoindre_par_code() est en security definer et contourne donc
--  le RLS de cheval_cavaliers : une politique ne la retiendrait
--  pas. Un trigger BEFORE INSERT, lui, s'applique à tous les
--  chemins — la fonction d'invitation, l'ajout direct par un
--  gestionnaire, ou tout appel futur.
-- ------------------------------------------------------------
create or replace function public.verifier_quota_liaison()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not premium_actif(new.cavalier_id)
     and nb_chevaux_du_compte(new.cavalier_id) >= 1 then
    raise exception 'PLAN_GRATUIT_UN_CHEVAL'
      using hint = 'Le plan gratuit est limité à un cheval.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quota_liaison on public.cheval_cavaliers;
create trigger trg_quota_liaison
  before insert on public.cheval_cavaliers
  for each row execute function public.verifier_quota_liaison();

-- ------------------------------------------------------------
--  4. La création d'un cheval compte désormais le total
--
--  Sans cela, un compte gratuit ayant rejoint un cheval avec un
--  code pourrait encore en créer un second.
-- ------------------------------------------------------------
drop policy if exists chevaux_insert on public.chevaux;
create policy chevaux_insert on public.chevaux for insert to authenticated
  with check (
    cree_par = auth.uid()
    and (est_premium(auth.uid()) or nb_chevaux_du_compte(auth.uid()) < 1)
  );

-- ------------------------------------------------------------
--  5. Message clair côté application
--
--  Sans cette reprise, l'erreur remontée à celui qui saisit un
--  code serait le message brut du trigger.
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

  -- Déjà lié : on ne consomme pas le code et on ne bute pas sur le quota.
  if exists (
    select 1 from cheval_cavaliers
    where cheval_id = v_inv.cheval_id and cavalier_id = auth.uid()
  ) then
    return jsonb_build_object('cheval_id', v_cheval.id, 'nom', v_cheval.nom, 'deja_lie', true);
  end if;

  -- Vérification explicite avant d'écrire : le trigger protège de toute
  -- façon, mais on veut un message que l'application sait reconnaître, et
  -- surtout ne pas consommer l'invitation pour rien.
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

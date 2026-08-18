-- ============================================================
--  Le modèle club : adhésion par code, accès premium offert par
--  l'écurie, et premium contextuel.
--
--  L'écurie paie un abonnement fixe et ses membres reçoivent
--  l'accès complet — mais seulement sur le périmètre du club :
--  ses chevaux, et les chevaux personnels qui y sont en pension.
--  Les chevaux personnels hors écurie restent au plan gratuit du
--  cavalier ; s'il en veut plus, il prend son abonnement à lui.
--
--  Rien n'est jamais matérialisé : aucun drapeau premium n'est
--  posé sur le cavalier. Chaque contrôle relit l'adhésion, le
--  siège et l'abonnement du club à l'instant T — la perte d'un
--  siège ou la fin de l'abonnement club dégradent l'accès
--  immédiatement, sans toucher aux données, et tout revient à la
--  seconde où un siège est réattribué ou qu'un abonnement
--  personnel arrive. L'accès le plus favorable gagne toujours.
--
--  Sièges illimités : l'adhésion par code donne le siège d'office,
--  le gérant peut le retirer (et le rendre) membre par membre.
--
--  À exécuter après 0017.
-- ============================================================

-- ------------------------------------------------------------
--  1. L'adhésion — la relation devient première
--
--  Jusqu'ici « être du club » se déduisait d'un lien à un cheval
--  (0017). L'adhésion devient la relation de base : on rejoint
--  l'écurie, puis on est lié à des chevaux. Le siège est une
--  propriété de l'adhésion — un membre en a un ou pas, jamais
--  deux, pas de table à part.
-- ------------------------------------------------------------
create table if not exists public.membres_club (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.profils (id) on delete cascade,
  cavalier_id  uuid not null references public.profils (id) on delete cascade,
  siege        boolean not null default true,
  siege_depuis timestamptz default now(),
  cree_le      timestamptz not null default now(),
  unique (club_id, cavalier_id)
);

create index if not exists idx_membres_cavalier on public.membres_club (cavalier_id, club_id);

alter table public.membres_club enable row level security;

-- Le membre voit sa propre adhésion, le gérant voit tous ses
-- membres. Les membres ne se voient pas entre eux ici — on
-- ouvrira si le besoin vient, l'inverse serait irréversible.
drop policy if exists mc_select on public.membres_club;
create policy mc_select on public.membres_club for select to authenticated
  using (cavalier_id = auth.uid() or club_id = auth.uid());

-- Pas de politique d'INSERT : on n'entre que par rejoindre_club(),
-- en security definer, qui valide le code.

-- Le siège se donne et se retire : le gérant seul.
drop policy if exists mc_update on public.membres_club;
create policy mc_update on public.membres_club for update to authenticated
  using (club_id = auth.uid())
  with check (club_id = auth.uid());

-- Quitter le club soi-même, ou être retiré par le gérant.
drop policy if exists mc_delete on public.membres_club;
create policy mc_delete on public.membres_club for delete to authenticated
  using (cavalier_id = auth.uid() or club_id = auth.uid());

--  Une adhésion relie toujours un cavalier à un club — jamais
--  deux clubs, jamais deux cavaliers. Trigger plutôt que
--  contrainte : une FK ne sait pas lire type_compte.
create or replace function public.verifier_membre_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profils where id = new.club_id and type_compte = 'club') then
    raise exception 'ADHESION_INVALIDE' using hint = 'Le compte rejoint n''est pas une écurie.';
  end if;
  if not exists (select 1 from profils where id = new.cavalier_id and type_compte = 'cavalier') then
    raise exception 'ADHESION_INVALIDE' using hint = 'Seul un compte cavalier peut adhérer.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifier_membre_club on public.membres_club;
create trigger trg_verifier_membre_club
  before insert on public.membres_club
  for each row execute function public.verifier_membre_club();

--  Un siège rendu repart d'aujourd'hui : la date sert à l'affichage
--  (« accès offert depuis… ») et doit suivre la réalité.
create or replace function public.dater_siege()
returns trigger
language plpgsql
as $$
begin
  if new.siege and not old.siege then
    new.siege_depuis := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dater_siege on public.membres_club;
create trigger trg_dater_siege
  before update on public.membres_club
  for each row execute function public.dater_siege();

-- ------------------------------------------------------------
--  2. Reprise de l'existant
--
--  Tout cavalier déjà lié à un cheval de club devient membre,
--  siège compris : personne ne perd son écran Cours le jour de
--  la mise en ligne, personne n'a de code à ressaisir.
-- ------------------------------------------------------------
insert into public.membres_club (club_id, cavalier_id)
select distinct c.club_id, cc.cavalier_id
from public.cheval_cavaliers cc
join public.chevaux c on c.id = cc.cheval_id
join public.profils p on p.id = cc.cavalier_id and p.type_compte = 'cavalier'
where c.club_id is not null
on conflict (club_id, cavalier_id) do nothing;

-- ------------------------------------------------------------
--  3. Le code d'adhésion
--
--  Différent des invitations : celles-ci sont par cheval et à
--  usage unique, le code d'adhésion est par écurie, multi-usage
--  et longue durée. Une seule ligne par club — régénérer, c'est
--  remplacer, et l'ancien code meurt mécaniquement.
-- ------------------------------------------------------------
create table if not exists public.codes_adhesion (
  club_id     uuid primary key references public.profils (id) on delete cascade,
  code        text not null unique,
  regenere_le timestamptz not null default now()
);

alter table public.codes_adhesion enable row level security;

-- Seul le gérant lit son code. Personne n'écrit en direct : tout
-- passe par generer_code_adhesion().
drop policy if exists ca_select on public.codes_adhesion;
create policy ca_select on public.codes_adhesion for select to authenticated
  using (club_id = auth.uid());

create or replace function public.generer_code_adhesion()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_essais int := 0;
begin
  if not exists (select 1 from profils where id = auth.uid() and type_compte = 'club') then
    raise exception 'Seule une écurie dispose d''un code d''adhésion';
  end if;

  loop
    v_code := nouveau_code();
    exit when not exists (select 1 from codes_adhesion where code = v_code);
    v_essais := v_essais + 1;
    if v_essais > 20 then
      raise exception 'Impossible de générer un code, réessayez';
    end if;
  end loop;

  insert into codes_adhesion (club_id, code)
  values (auth.uid(), v_code)
  on conflict (club_id) do update set code = excluded.code, regenere_le = now();

  return v_code;
end;
$$;

--  La saisie du code. Un code faux ne révèle jamais l'existence
--  d'une écurie — même philosophie que rejoindre_par_code().
--  Sièges illimités : l'adhésion donne le siège d'office, c'est
--  ce qui fait de « J'ai un code club » une vraie alternative au
--  paiement sur l'écran d'abonnement.
create or replace function public.rejoindre_club(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ligne codes_adhesion%rowtype;
  v_nom text;
  v_membre membres_club%rowtype;
begin
  select * into v_ligne
  from codes_adhesion
  where upper(trim(code)) = upper(trim(p_code));

  if not found then
    raise exception 'Code introuvable';
  end if;

  if not exists (select 1 from profils where id = auth.uid() and type_compte = 'cavalier') then
    raise exception 'Ce code s''utilise depuis un compte cavalier';
  end if;

  select nom into v_nom from profils where id = v_ligne.club_id;

  select * into v_membre from membres_club
  where club_id = v_ligne.club_id and cavalier_id = auth.uid();

  if found then
    return jsonb_build_object(
      'club_id', v_ligne.club_id, 'nom', v_nom,
      'siege', v_membre.siege, 'deja_membre', true
    );
  end if;

  insert into membres_club (club_id, cavalier_id)
  values (v_ligne.club_id, auth.uid());

  return jsonb_build_object(
    'club_id', v_ligne.club_id, 'nom', v_nom,
    'siege', true, 'deja_membre', false
  );
end;
$$;

-- ------------------------------------------------------------
--  4. « Être du club » = être membre
--
--  La fonction de la 0017 garde son nom et sa signature : cours,
--  inscriptions et écrans existants basculent sans réécriture.
--  La reprise du §2 garantit qu'aucun cavalier n'y perd.
-- ------------------------------------------------------------
create or replace function public.est_cavalier_du_club(p_club uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membres_club
    where club_id = p_club and cavalier_id = p_user
  );
$$;

-- ------------------------------------------------------------
--  5. Le cheval personnel en pension à l'écurie
--
--  `club_id` signifie propriété — il donne les droits de
--  gestionnaire. Le cheval personnel d'une cavalière en pension
--  ne doit PAS recevoir ce lien-là : d'où `ecurie_id`,
--  « stationné chez », qui n'ouvre AUCUN droit de gestion à
--  l'écurie. Il ne sert qu'au périmètre premium.
--
--  C'est le propriétaire qui rattache (parmi ses clubs) ; lui ou
--  le gérant détachent.
-- ------------------------------------------------------------
alter table public.chevaux
  add column if not exists ecurie_id uuid references public.profils (id) on delete set null;

create index if not exists idx_chevaux_ecurie on public.chevaux (ecurie_id);

create or replace function public.verifier_ecurie_cheval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ecurie_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.ecurie_id is not distinct from new.ecurie_id then
    return new;
  end if;

  if not exists (select 1 from profils where id = new.ecurie_id and type_compte = 'club') then
    raise exception 'ECURIE_INVALIDE' using hint = 'Ce compte n''est pas une écurie.';
  end if;

  -- On ne met son cheval en pension que chez une écurie dont on
  -- est membre : sans cela, n'importe qui rattacherait son cheval
  -- à n'importe quel club pour capter son premium.
  if not exists (
    select 1 from membres_club
    where club_id = new.ecurie_id and cavalier_id = auth.uid()
  ) then
    raise exception 'ECURIE_NON_MEMBRE'
      using hint = 'Adhérez d''abord à cette écurie avec son code.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_ecurie_cheval on public.chevaux;
create trigger trg_verifier_ecurie_cheval
  before insert or update of ecurie_id on public.chevaux
  for each row execute function public.verifier_ecurie_cheval();

--  Le gérant n'est pas gestionnaire d'un cheval en pension : le
--  RLS de `chevaux` ne le laisse pas écrire. Cette fonction est
--  sa seule porte, et elle ne sait QUE détacher.
create or replace function public.detacher_de_ecurie(p_cheval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ecurie uuid;
begin
  select ecurie_id into v_ecurie from chevaux where id = p_cheval;
  if v_ecurie is null then
    return;
  end if;
  if auth.uid() <> v_ecurie and not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seuls le gestionnaire du cheval ou l''écurie peuvent le détacher';
  end if;
  update chevaux set ecurie_id = null where id = p_cheval;
end;
$$;

-- ------------------------------------------------------------
--  6. Le premium devient contextuel
--
--  couverture_club() répond à « ce cheval est-il couvert par une
--  écurie de ce cavalier ? » : adhésion + siège + abonnement du
--  club actif + cheval dans le périmètre (propriété OU pension).
--  Retirée aux rôles clients comme premium_actif(), car elle
--  renseigne sur autrui : elle ne s'appelle que depuis des
--  fonctions et politiques qui bornent l'appelant.
--
--  premium_cheval() est la question que posent les politiques :
--  abonnement personnel OU couverture club — l'accès le plus
--  favorable, mécaniquement. Même garde-fou qu'est_premium() :
--  elle refuse de renseigner sur un autre compte.
-- ------------------------------------------------------------
create or replace function public.couverture_club(p_cheval uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from membres_club m
    join chevaux c on c.id = p_cheval
                  and (c.club_id = m.club_id or c.ecurie_id = m.club_id)
    where m.cavalier_id = p_user
      and m.siege
      and premium_actif(m.club_id)
  );
$$;

revoke all on function public.couverture_club(uuid, uuid) from public, anon, authenticated;

create or replace function public.premium_cheval(p_cheval uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = auth.uid()
     and (est_premium(p_user) or couverture_club(p_cheval, p_user));
$$;

-- ------------------------------------------------------------
--  7. Les gardes existantes passent à la question contextuelle
--
--  Partout où une politique demandait « le compte est-il
--  premium ? », elle demande désormais « ce compte est-il premium
--  POUR CE CHEVAL ? ». Les chevaux personnels hors écurie ne
--  changent pas de régime : sans couverture club, premium_cheval
--  se réduit exactement à est_premium.
-- ------------------------------------------------------------

-- Carnet de santé (formes de 0005 et 0010)
drop policy if exists soins_select on public.soins;
create policy soins_select on public.soins for select to authenticated
  using (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_insert on public.soins;
create policy soins_insert on public.soins for insert to authenticated
  with check (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and cree_par = auth.uid()
  );

drop policy if exists soins_update on public.soins;
create policy soins_update on public.soins for update to authenticated
  using (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()))
  with check (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and cree_par = auth.uid()
  );

drop policy if exists soins_delete on public.soins;
create policy soins_delete on public.soins for delete to authenticated
  using (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

-- Calendrier borné à la semaine en gratuit (0005)
drop policy if exists creneaux_insert on public.creneaux;
create policy creneaux_insert on public.creneaux for insert to authenticated
  with check (
    a_acces_cheval(cheval_id, auth.uid())
    and (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (premium_cheval(cheval_id, auth.uid()) or debut < fin_semaine_courante())
  );

drop policy if exists creneaux_update on public.creneaux;
create policy creneaux_update on public.creneaux for update to authenticated
  using (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
  with check (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (premium_cheval(cheval_id, auth.uid()) or debut < fin_semaine_courante())
  );

-- Réglages de rappels (0011)
drop policy if exists rappels_soins_select on public.rappels_soins;
create policy rappels_soins_select on public.rappels_soins for select to authenticated
  using (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists rappels_soins_insert on public.rappels_soins;
create policy rappels_soins_insert on public.rappels_soins for insert to authenticated
  with check (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists rappels_soins_update on public.rappels_soins;
create policy rappels_soins_update on public.rappels_soins for update to authenticated
  using (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()))
  with check (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists rappels_soins_delete on public.rappels_soins;
create policy rappels_soins_delete on public.rappels_soins for delete to authenticated
  using (premium_cheval(cheval_id, auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

-- Accusés de lecture de la cloche (0012). L'exigence premium
-- globale saute : un rappel n'existe à l'écran que si le soin se
-- lit — et la lecture du soin porte déjà la vraie règle. Le
-- sous-select passe par le RLS de soins, comme la vue v_rappels.
drop policy if exists rappels_lus_insert on public.rappels_lus;
create policy rappels_lus_insert on public.rappels_lus for insert to authenticated
  with check (
    profil_id = auth.uid()
    and exists (select 1 from soins where id = soin_id)
  );

-- Dépenses (0009). La ligne appartient toujours à son auteur ; ce
-- qui change est le droit d'usage : l'abonnement personnel ouvre
-- tout, la couverture club n'ouvre que les dépenses rattachées à
-- un cheval couvert — l'écurie offre « les dépenses sur ces
-- chevaux », pas la comptabilité personnelle.
drop policy if exists depenses_select on public.depenses;
create policy depenses_select on public.depenses for select to authenticated
  using (
    profil_id = auth.uid()
    and (
      est_premium(auth.uid())
      or (cheval_id is not null and premium_cheval(cheval_id, auth.uid()))
    )
  );

drop policy if exists depenses_insert on public.depenses;
create policy depenses_insert on public.depenses for insert to authenticated
  with check (
    profil_id = auth.uid()
    and (cheval_id is null or a_acces_cheval(cheval_id, auth.uid()))
    and (
      est_premium(auth.uid())
      or (cheval_id is not null and premium_cheval(cheval_id, auth.uid()))
    )
  );

drop policy if exists depenses_update on public.depenses;
create policy depenses_update on public.depenses for update to authenticated
  using (
    profil_id = auth.uid()
    and (
      est_premium(auth.uid())
      or (cheval_id is not null and premium_cheval(cheval_id, auth.uid()))
    )
  )
  with check (
    profil_id = auth.uid()
    and (cheval_id is null or a_acces_cheval(cheval_id, auth.uid()))
    and (
      est_premium(auth.uid())
      or (cheval_id is not null and premium_cheval(cheval_id, auth.uid()))
    )
  );

drop policy if exists depenses_delete on public.depenses;
create policy depenses_delete on public.depenses for delete to authenticated
  using (
    profil_id = auth.uid()
    and (
      est_premium(auth.uid())
      or (cheval_id is not null and premium_cheval(cheval_id, auth.uid()))
    )
  );

-- Quota de documents (0016) : la limite haute suit la couverture
create or replace function public.verifier_quota_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer := case
    when premium_actif(new.ajoute_par) or couverture_club(new.cheval_id, new.ajoute_par)
    then 50 else 10
  end;
  v_nb integer;
begin
  select count(*) into v_nb from documents where cheval_id = new.cheval_id;
  if v_nb >= v_limite then
    raise exception 'QUOTA_DOCUMENTS'
      using hint = format('Limite de %s documents atteinte pour ce cheval.', v_limite);
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
--  8. Les chevaux de club sortent du quota gratuit
--
--  Un cheval rejoint comptait dans la limite d'un cheval par
--  compte (0006). Une cavalière gratuite liée à un cheval d'école
--  ne pouvait donc plus avoir le sien : le modèle club devenait
--  une punition. La relation d'école est l'affaire du club, pas
--  du quota personnel — seuls les chevaux SANS club comptent.
-- ------------------------------------------------------------
create or replace function public.nb_chevaux_du_compte(p_user uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)
          from cheval_cavaliers cc
          join chevaux c on c.id = cc.cheval_id
          where cc.cavalier_id = p_user and c.club_id is null)::int
       + (select count(*) from chevaux where club_id = p_user)::int;
$$;

--  Le trigger de 0006 laisse passer les liaisons vers un cheval de
--  club : elles ne consomment pas le quota qu'il protège.
create or replace function public.verifier_quota_liaison()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from chevaux where id = new.cheval_id and club_id is not null) then
    return new;
  end if;
  if not premium_actif(new.cavalier_id)
     and nb_chevaux_du_compte(new.cavalier_id) >= 1 then
    raise exception 'PLAN_GRATUIT_UN_CHEVAL'
      using hint = 'Le plan gratuit est limité à un cheval.';
  end if;
  return new;
end;
$$;

--  Et la vérification anticipée de rejoindre_par_code() suit,
--  sinon elle refuserait un code de club que le trigger accepte.
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

  -- Vérification explicite avant d'écrire — un cheval de club ne
  -- compte pas dans le quota, comme dans le trigger.
  if v_cheval.club_id is null
     and not premium_actif(auth.uid())
     and nb_chevaux_du_compte(auth.uid()) >= 1 then
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
--  9. Le gérant et ses membres se voient
--
--  profils_select repose sur « partager un cheval » : un membre
--  tout juste adhéré, encore lié à aucun cheval, serait invisible
--  du gérant — sa liste afficherait des lignes vides. La relation
--  d'adhésion ouvre la visibilité dans les deux sens, gérant ↔
--  membre seulement (pas membre ↔ membre). En security definer
--  pour éviter la récursion de politiques, comme a_acces_cheval.
-- ------------------------------------------------------------
create or replace function public.lien_club(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membres_club
    where (club_id = p_a and cavalier_id = p_b)
       or (club_id = p_b and cavalier_id = p_a)
  );
$$;

drop policy if exists profils_select on public.profils;
create policy profils_select on public.profils for select to authenticated
  using (
    id = auth.uid()
    or partage_un_cheval(id, auth.uid())
    or lien_club(id, auth.uid())
  );

-- ------------------------------------------------------------
--  10. Ce que l'interface a besoin de savoir
--
--  L'application doit anticiper les règles pour ne pas afficher
--  d'erreurs brutes, mais le RLS d'abonnements ne laisse lire que
--  le sien — un membre ne peut pas savoir si son club a payé.
--  Cette fonction répond, sans rien exposer d'autre : ses clubs,
--  son siège, et si la couverture est effective.
-- ------------------------------------------------------------
create or replace function public.mes_adhesions()
returns table (
  club_id      uuid,
  club_nom     text,
  siege        boolean,
  siege_depuis timestamptz,
  club_premium boolean,
  cree_le      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.club_id, p.nom, m.siege, m.siege_depuis,
         premium_actif(m.club_id), m.cree_le
  from membres_club m
  join profils p on p.id = m.club_id
  where m.cavalier_id = auth.uid()
  order by m.cree_le;
$$;

-- ------------------------------------------------------------
--  11. Temps réel
--
--  Le siège attribué ou retiré se voit sans recharger : chez le
--  membre (son accès change) comme chez le gérant (sa liste).
-- ------------------------------------------------------------
alter table public.membres_club replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'membres_club'
  ) then
    alter publication supabase_realtime add table public.membres_club;
  end if;
end $$;

-- ------------------------------------------------------------
--  Note sur l'abonnement de l'écurie
--
--  L'abonnement club vit dans la même table `abonnements`, écrit
--  par le même webhook RevenueCat : premium_actif(club_id) suffit.
--  Le produit dédié (prix fixe) restera à créer côté RevenueCat
--  et Stripe, et sa valeur à ajouter au check de
--  abonnements.produit le moment venu — d'ici là, un club peut
--  s'abonner avec les produits existants.
--
--  Contrôle après exécution :
--
--    select count(*) from membres_club;      -- vos cavaliers de club repris
--    select rejoindre_club('ABCDEF');        -- « Code introuvable », sans plus
--    select * from mes_adhesions();          -- vide pour un compte club
-- ------------------------------------------------------------

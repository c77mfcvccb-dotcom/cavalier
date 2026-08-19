-- ============================================================
--  La pension se demande, l'écurie la confirme.
--
--  Jusqu'ici un membre pouvait rattacher SON cheval à l'écurie
--  (`ecurie_id`, 0018) sans que le gérant ait son mot à dire :
--  un cheval inconnu entrait dans le périmètre du club — et dans
--  son accès offert — par la seule volonté du propriétaire.
--
--  Le rattachement devient une DEMANDE : le propriétaire propose,
--  et rien ne prend effet tant que l'écurie n'a pas confirmé.
--  Sans confirmation, pas de couverture premium ; l'écurie voit
--  la demande sur « Mes cavaliers » et l'accepte ou la refuse.
--
--  À exécuter après 0020.
-- ============================================================

-- ------------------------------------------------------------
--  1. L'état de la demande
--
--  Fausse par défaut, remise à faux à CHAQUE changement d'écurie
--  (une confirmation ne survit pas à un déménagement), et seule
--  l'écurie visée sait la passer à vrai. Les pensions déjà posées
--  repartent en attente : celles que le gérant n'a jamais
--  voulues sont précisément le problème à régler.
-- ------------------------------------------------------------
alter table public.chevaux
  add column if not exists pension_confirmee boolean not null default false;

-- ------------------------------------------------------------
--  2. Le trigger arbitre les deux colonnes
--
--  - ecurie_id : mêmes règles qu'en 0018 (une écurie, dont on est
--    membre), et tout changement remet la confirmation à faux.
--  - pension_confirmee : ne passe à vrai que sous l'identité de
--    l'écurie visée. Le propriétaire est gestionnaire de son
--    cheval — sans ce verrou, il se confirmerait lui-même par un
--    simple appel API, et le contrôle du gérant serait décoratif.
-- ------------------------------------------------------------
create or replace function public.verifier_ecurie_cheval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pas d'écurie : pas de pension, confirmée ou non.
  if new.ecurie_id is null then
    new.pension_confirmee := false;
    return new;
  end if;

  if tg_op = 'INSERT' or old.ecurie_id is distinct from new.ecurie_id then
    if not exists (select 1 from profils where id = new.ecurie_id and type_compte = 'club') then
      raise exception 'ECURIE_INVALIDE' using hint = 'Ce compte n''est pas une écurie.';
    end if;
    if not exists (
      select 1 from membres_club
      where club_id = new.ecurie_id and cavalier_id = auth.uid()
    ) then
      raise exception 'ECURIE_NON_MEMBRE'
        using hint = 'Adhérez d''abord à cette écurie avec son code.';
    end if;
    -- Nouvelle destination = nouvelle demande, quoi qu'ait dit l'appelant.
    new.pension_confirmee := false;
    return new;
  end if;

  -- Même écurie, mais la confirmation bouge : l'écurie seule la donne.
  if new.pension_confirmee and not old.pension_confirmee
     and auth.uid() is distinct from new.ecurie_id then
    raise exception 'PENSION_A_CONFIRMER'
      using hint = 'Seule l''écurie peut accepter une pension.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_ecurie_cheval on public.chevaux;
create trigger trg_verifier_ecurie_cheval
  before insert or update of ecurie_id, pension_confirmee on public.chevaux
  for each row execute function public.verifier_ecurie_cheval();

-- ------------------------------------------------------------
--  3. La porte de l'écurie : accepter
--
--  Le gérant n'est pas gestionnaire d'un cheval en pension — le
--  RLS de `chevaux` ne le laisse pas écrire. Comme
--  detacher_de_ecurie() (le refus), cette fonction est son seul
--  chemin, et elle ne sait QUE confirmer.
-- ------------------------------------------------------------
create or replace function public.confirmer_pension(p_cheval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ecurie uuid;
begin
  select ecurie_id into v_ecurie from chevaux where id = p_cheval;
  if v_ecurie is null or auth.uid() is distinct from v_ecurie then
    raise exception 'Seule l''écurie visée peut confirmer une pension';
  end if;
  update chevaux set pension_confirmee = true where id = p_cheval;
end;
$$;

-- ------------------------------------------------------------
--  4. Sans confirmation, pas de couverture
--
--  couverture_club (0018) tenait la pension pour acquise dès
--  ecurie_id posé : c'était la faille — un membre s'ouvrait le
--  premium du club sur son propre cheval, sans accord du gérant.
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
                  and (
                    c.club_id = m.club_id
                    or (c.ecurie_id = m.club_id and c.pension_confirmee)
                  )
    where m.cavalier_id = p_user
      and m.siege
      and premium_actif(m.club_id)
  );
$$;

revoke all on function public.couverture_club(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    select nom, pension_confirmee from chevaux where ecurie_id is not null;
--      -- les pensions existantes repartent en attente : acceptez
--      -- (ou refusez) chacune depuis « Mes cavaliers »
--    select confirmer_pension(null);
--      -- « Seule l'écurie visée… » : la fonction répond
-- ------------------------------------------------------------

-- ============================================================
--  L'outil écurie : indisponibilités des chevaux, charge de
--  travail, et planning des cours avec inscriptions.
--
--  Trois briques dans une migration parce qu'elles n'ont de sens
--  qu'ensemble : un cours attribue des chevaux, et l'attribution
--  n'est intelligente que si elle sait qu'Ivoire est au repos
--  ostéo et que Quenotte a déjà tourné trois fois aujourd'hui.
--
--  À exécuter après 0016.
-- ============================================================

-- ------------------------------------------------------------
--  1. Indisponibilités d'un cheval
--
--  En DATES, pas en horodatages : « au repos jusqu'au 25 » est
--  une réalité de demi-journées, pas de minutes. `fin` nulle =
--  indisponible jusqu'à nouvel ordre — le cas réel d'une boiterie
--  dont personne ne connaît la durée.
--
--  Utile bien au-delà du club : deux cavalières en demi-pension
--  veulent aussi savoir que le cheval est au repos.
-- ------------------------------------------------------------
create table if not exists public.indisponibilites (
  id        uuid primary key default gen_random_uuid(),
  cheval_id uuid not null references public.chevaux (id) on delete cascade,
  motif     text not null default 'repos'
            check (motif in ('boiterie', 'repos', 'osteo', 'veterinaire', 'autre')),
  debut     date not null default current_date,
  fin       date,
  note      text,
  cree_par  uuid references public.profils (id) on delete set null,
  cree_le   timestamptz not null default now(),
  check (fin is null or fin >= debut)
);

create index if not exists idx_indispo_cheval on public.indisponibilites (cheval_id, debut desc);

alter table public.indisponibilites enable row level security;

-- Tous les cavaliers du cheval la voient ; seul le gestionnaire
-- (propriétaire ou club) la pose et la lève — c'est une décision
-- sur l'animal, comme les périodicités de rappel.
drop policy if exists indispo_select on public.indisponibilites;
create policy indispo_select on public.indisponibilites for select to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists indispo_insert on public.indisponibilites;
create policy indispo_insert on public.indisponibilites for insert to authenticated
  with check (est_gestionnaire_cheval(cheval_id, auth.uid()) and cree_par = auth.uid());

drop policy if exists indispo_update on public.indisponibilites;
create policy indispo_update on public.indisponibilites for update to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists indispo_delete on public.indisponibilites;
create policy indispo_delete on public.indisponibilites for delete to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

-- ------------------------------------------------------------
--  2. Qui est « du club » ?
--
--  Un cavalier appartient à un club s'il est lié à au moins un
--  de ses chevaux — c'est le lien qui existe déjà, créé par le
--  code d'invitation. Pas de table d'adhésion supplémentaire :
--  elle divergerait de la réalité au premier départ.
-- ------------------------------------------------------------
create or replace function public.est_cavalier_du_club(p_club uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from cheval_cavaliers cc
    join chevaux c on c.id = cc.cheval_id
    where cc.cavalier_id = p_user and c.club_id = p_club
  );
$$;

-- ------------------------------------------------------------
--  3. Les cours
--
--  Un cours n'est PAS un créneau : le créneau lie un cavalier à
--  un cheval, le cours est une capacité — « mardi 18 h, Galop
--  3-4, 6 places » — sur laquelle des cavaliers s'inscrivent et
--  reçoivent chacun un cheval.
--
--  Le moniteur est un simple texte : en faire un compte serait
--  un troisième rôle, prématuré tant que le pilotage réel n'a
--  pas montré ce qu'un moniteur fait dans l'application.
-- ------------------------------------------------------------
create table if not exists public.cours (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.profils (id) on delete cascade,
  debut      timestamptz not null,
  fin        timestamptz not null,
  discipline text not null default 'dressage'
             check (discipline in ('dressage', 'obstacle', 'cross', 'balade', 'poney', 'autre')),
  niveau     text,
  places     integer not null default 6 check (places between 1 and 30),
  moniteur   text,
  notes      text,
  cree_le    timestamptz not null default now(),
  check (fin > debut)
);

create index if not exists idx_cours_club on public.cours (club_id, debut);

alter table public.cours enable row level security;

drop policy if exists cours_select on public.cours;
create policy cours_select on public.cours for select to authenticated
  using (club_id = auth.uid() or est_cavalier_du_club(club_id, auth.uid()));

drop policy if exists cours_insert on public.cours;
create policy cours_insert on public.cours for insert to authenticated
  with check (club_id = auth.uid());

drop policy if exists cours_update on public.cours;
create policy cours_update on public.cours for update to authenticated
  using (club_id = auth.uid());

drop policy if exists cours_delete on public.cours;
create policy cours_delete on public.cours for delete to authenticated
  using (club_id = auth.uid());

-- ------------------------------------------------------------
--  4. Les inscriptions
--
--  `statut` ne connaît que deux valeurs : inscrit, ou en liste
--  d'attente. Se désinscrire = supprimer sa ligne — un statut
--  « annulé » conservé n'aurait servi qu'à compliquer chaque
--  comptage.
--
--  `cheval_id` est l'attribution, posée par le club, jamais par
--  le cavalier. `present` reste nul jusqu'au pointage.
-- ------------------------------------------------------------
create table if not exists public.inscriptions_cours (
  id          uuid primary key default gen_random_uuid(),
  cours_id    uuid not null references public.cours (id) on delete cascade,
  cavalier_id uuid not null references public.profils (id) on delete cascade,
  cheval_id   uuid references public.chevaux (id) on delete set null,
  statut      text not null default 'inscrit' check (statut in ('inscrit', 'attente')),
  present     boolean,
  cree_le     timestamptz not null default now(),
  unique (cours_id, cavalier_id)
);

create index if not exists idx_inscriptions_cours on public.inscriptions_cours (cours_id, cree_le);

alter table public.inscriptions_cours enable row level security;

-- Les inscrits d'un cours sont visibles de tout le club : on
-- monte ensemble, savoir avec qui fait partie du service — même
-- philosophie que la liste des cavaliers d'un cheval partagé.
drop policy if exists ic_select on public.inscriptions_cours;
create policy ic_select on public.inscriptions_cours for select to authenticated
  using (exists (
    select 1 from cours c where c.id = cours_id
      and (c.club_id = auth.uid() or est_cavalier_du_club(c.club_id, auth.uid()))
  ));

-- Le cavalier s'inscrit lui-même, à un cours de SON club — mains
-- vides : ni cheval (l'attribution est au club), ni présence (le
-- pointage aussi). Le club, lui, peut inscrire quelqu'un tout
-- équipé.
drop policy if exists ic_insert on public.inscriptions_cours;
create policy ic_insert on public.inscriptions_cours for insert to authenticated
  with check (exists (
    select 1 from cours c where c.id = cours_id
      and (
        c.club_id = auth.uid()
        or (
          cavalier_id = auth.uid()
          and cheval_id is null
          and present is null
          and est_cavalier_du_club(c.club_id, auth.uid())
        )
      )
  ));

-- Attribution du cheval, pointage, promotion : le club seul.
drop policy if exists ic_update on public.inscriptions_cours;
create policy ic_update on public.inscriptions_cours for update to authenticated
  using (exists (select 1 from cours c where c.id = cours_id and c.club_id = auth.uid()));

-- Se désinscrire soi-même, ou être retiré par le club.
drop policy if exists ic_delete on public.inscriptions_cours;
create policy ic_delete on public.inscriptions_cours for delete to authenticated
  using (
    cavalier_id = auth.uid()
    or exists (select 1 from cours c where c.id = cours_id and c.club_id = auth.uid())
  );

-- ------------------------------------------------------------
--  5. Capacité et liste d'attente, tenues par la base
--
--  Le statut à l'arrivée n'est PAS choisi par le client : le
--  trigger compte les inscrits et place le nouveau venu, ce qui
--  élimine la course entre deux inscriptions simultanées sur la
--  dernière place. Le verrou sur la ligne du cours sérialise les
--  arrivées concurrentes.
-- ------------------------------------------------------------
create or replace function public.placer_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_places integer;
  v_inscrits integer;
begin
  select places into v_places from cours where id = new.cours_id for update;
  select count(*) into v_inscrits
  from inscriptions_cours where cours_id = new.cours_id and statut = 'inscrit';

  new.statut := case when v_inscrits < v_places then 'inscrit' else 'attente' end;
  return new;
end;
$$;

drop trigger if exists trg_placer_inscription on public.inscriptions_cours;
create trigger trg_placer_inscription
  before insert on public.inscriptions_cours
  for each row execute function public.placer_inscription();

--  Une place se libère → le plus ancien de la liste d'attente
--  monte, automatiquement. Personne n'a à s'en souvenir.
create or replace function public.promouvoir_attente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.statut = 'inscrit' then
    update inscriptions_cours
    set statut = 'inscrit'
    where id = (
      select id from inscriptions_cours
      where cours_id = old.cours_id and statut = 'attente'
      order by cree_le
      limit 1
      for update skip locked
    );
  end if;
  return old;
end;
$$;

drop trigger if exists trg_promouvoir_attente on public.inscriptions_cours;
create trigger trg_promouvoir_attente
  after delete on public.inscriptions_cours
  for each row execute function public.promouvoir_attente();

-- ------------------------------------------------------------
--  6. L'attribution refuse un cheval indisponible ou étranger
--
--  L'interface prévient, mais c'est ici que la règle tient :
--  un cheval au repos ostéo ne peut pas être mis sous la selle,
--  quel que soit l'écran qui essaie.
-- ------------------------------------------------------------
create or replace function public.verifier_cheval_cours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cours cours%rowtype;
begin
  if new.cheval_id is null then
    return new;
  end if;

  select * into v_cours from cours where id = new.cours_id;

  if not exists (
    select 1 from chevaux where id = new.cheval_id and club_id = v_cours.club_id
  ) then
    raise exception 'CHEVAL_HORS_CLUB'
      using hint = 'Ce cheval n''appartient pas à la cavalerie du club.';
  end if;

  if exists (
    select 1 from indisponibilites
    where cheval_id = new.cheval_id
      and debut <= v_cours.debut::date
      and (fin is null or fin >= v_cours.debut::date)
  ) then
    raise exception 'CHEVAL_INDISPONIBLE'
      using hint = 'Ce cheval est indisponible à la date du cours.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_cheval_cours on public.inscriptions_cours;
create trigger trg_verifier_cheval_cours
  before insert or update of cheval_id on public.inscriptions_cours
  for each row execute function public.verifier_cheval_cours();

-- ------------------------------------------------------------
--  7. Charge de travail, calculée en base
--
--  Créneaux du calendrier ET attributions de cours, sur deux
--  fenêtres : aujourd'hui, et les 7 jours autour de maintenant
--  (3 en arrière, 4 en avant — la question du gérant est « que
--  va faire ce cheval cette semaine », pas seulement ce qu'il a
--  fait). `security_invoker` : chacun ne compte que ce qu'il a
--  le droit de voir.
-- ------------------------------------------------------------
create or replace view public.v_charge_chevaux
with (security_invoker = true) as
with travail as (
  select cheval_id, debut from creneaux
  union all
  select ic.cheval_id, c.debut
  from inscriptions_cours ic
  join cours c on c.id = ic.cours_id
  where ic.cheval_id is not null and ic.statut = 'inscrit'
)
select
  ch.id as cheval_id,
  count(t.debut) filter (where t.debut::date = current_date) as aujourd_hui,
  count(t.debut) filter (
    where t.debut >= now() - interval '3 days' and t.debut < now() + interval '4 days'
  ) as semaine
from chevaux ch
left join travail t on t.cheval_id = ch.id
group by ch.id;

-- ------------------------------------------------------------
--  8. Temps réel : les nouvelles tables rejoignent la diffusion
--
--  Le planning du club et l'écran des cours se mettent à jour
--  pendant qu'un cavalier s'inscrit — même mécanique que 0014.
-- ------------------------------------------------------------
alter table public.cours              replica identity full;
alter table public.inscriptions_cours replica identity full;
alter table public.indisponibilites   replica identity full;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['cours', 'inscriptions_cours', 'indisponibilites'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
--  Contrôle
--
--    select count(*) from cours;                    -- 0, sans erreur
--    select * from v_charge_chevaux limit 3;
--    select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public';
-- ------------------------------------------------------------

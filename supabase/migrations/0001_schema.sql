-- ============================================================
--  Cavalier — schéma V1
--  À exécuter dans l'éditeur SQL de Supabase (une seule fois).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Profils
-- ------------------------------------------------------------
create table if not exists public.profils (
  id           uuid primary key references auth.users (id) on delete cascade,
  type_compte  text not null check (type_compte in ('cavalier', 'club')),
  nom          text not null default '',
  photo_url    text,
  niveau_galop int check (niveau_galop between 1 and 7),
  telephone    text,
  ville        text,
  bio          text,
  cree_le      timestamptz not null default now()
);

-- Création automatique du profil à l'inscription
create or replace function public.gerer_nouvel_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profils (id, type_compte, nom)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'type_compte', 'cavalier'),
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.gerer_nouvel_utilisateur();

-- ------------------------------------------------------------
--  Chevaux
-- ------------------------------------------------------------
create table if not exists public.chevaux (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null,
  photo_url        text,
  date_naissance   date,
  race             text,
  robe             text,
  sexe             text check (sexe in ('jument', 'hongre', 'entier')),
  proprietaire_nom text,
  club_id          uuid references public.profils (id) on delete set null,
  cree_par         uuid not null references public.profils (id) on delete cascade,
  notes            text,
  cree_le          timestamptz not null default now()
);

create index if not exists idx_chevaux_club on public.chevaux (club_id);

-- ------------------------------------------------------------
--  Liaison cheval <-> cavalier  (table centrale)
-- ------------------------------------------------------------
create table if not exists public.cheval_cavaliers (
  id          uuid primary key default gen_random_uuid(),
  cheval_id   uuid not null references public.chevaux (id) on delete cascade,
  cavalier_id uuid not null references public.profils (id) on delete cascade,
  role        text not null default 'demi_pension'
              check (role in ('proprietaire', 'demi_pension', 'cavalier_club')),
  couleur     text not null default '#6366f1',
  cree_le     timestamptz not null default now(),
  unique (cheval_id, cavalier_id)
);

create index if not exists idx_cc_cavalier on public.cheval_cavaliers (cavalier_id);
create index if not exists idx_cc_cheval on public.cheval_cavaliers (cheval_id);

-- Palette utilisée pour le code couleur du calendrier
create or replace function public.couleur_libre(p_cheval uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  palette text[] := array['#6366f1','#e11d48','#059669','#d97706','#7c3aed','#0891b2','#be185d','#4d7c0f'];
  c text;
begin
  foreach c in array palette loop
    if not exists (select 1 from cheval_cavaliers where cheval_id = p_cheval and couleur = c) then
      return c;
    end if;
  end loop;
  return palette[1 + (floor(random() * array_length(palette, 1)))::int];
end;
$$;

-- Le créateur d'un cheval en devient automatiquement le cavalier propriétaire.
-- Un club accède à ses chevaux via club_id : pas de liaison créée dans ce cas.
create or replace function public.apres_creation_cheval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from profils p where p.id = new.cree_par and p.type_compte = 'cavalier') then
    insert into cheval_cavaliers (cheval_id, cavalier_id, role, couleur)
    values (
      new.id,
      new.cree_par,
      case when new.club_id is not null then 'cavalier_club' else 'proprietaire' end,
      couleur_libre(new.id)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apres_creation_cheval on public.chevaux;
create trigger trg_apres_creation_cheval
  after insert on public.chevaux
  for each row execute function public.apres_creation_cheval();

-- ------------------------------------------------------------
--  Fonctions d'accès (security definer : évitent la récursion RLS)
-- ------------------------------------------------------------
create or replace function public.a_acces_cheval(p_cheval uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from cheval_cavaliers cc
           where cc.cheval_id = p_cheval and cc.cavalier_id = p_user
         )
      or exists (
           select 1 from chevaux c
           where c.id = p_cheval and c.club_id = p_user
         );
$$;

create or replace function public.est_gestionnaire_cheval(p_cheval uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from cheval_cavaliers cc
           where cc.cheval_id = p_cheval
             and cc.cavalier_id = p_user
             and cc.role = 'proprietaire'
         )
      or exists (
           select 1 from chevaux c
           where c.id = p_cheval and c.club_id = p_user
         );
$$;

create or replace function public.partage_un_cheval(p_autre uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
           from cheval_cavaliers a
           join cheval_cavaliers b on a.cheval_id = b.cheval_id
           where a.cavalier_id = p_user and b.cavalier_id = p_autre
         )
      or exists (
           -- le club voit les cavaliers de ses chevaux, et réciproquement
           select 1
           from chevaux c
           join cheval_cavaliers cc on cc.cheval_id = c.id
           where (c.club_id = p_user and cc.cavalier_id = p_autre)
              or (c.club_id = p_autre and cc.cavalier_id = p_user)
         );
$$;

-- ------------------------------------------------------------
--  Invitations (code de partage demi-pension)
-- ------------------------------------------------------------
create table if not exists public.invitations (
  id               uuid primary key default gen_random_uuid(),
  cheval_id        uuid not null references public.chevaux (id) on delete cascade,
  code             text not null unique,
  role_propose     text not null default 'demi_pension'
                   check (role_propose in ('demi_pension', 'cavalier_club')),
  cree_par         uuid not null references public.profils (id) on delete cascade,
  expire_le        timestamptz not null default now() + interval '30 days',
  utilisations     int not null default 0,
  utilisations_max int not null default 1,
  actif            boolean not null default true,
  cree_le          timestamptz not null default now()
);

-- Code lisible : 6 caractères, sans I, O, 0, 1 pour éviter les confusions
create or replace function public.nouveau_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

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
begin
  if not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le propriétaire ou le club peut inviter un cavalier';
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

  if exists (
    select 1 from cheval_cavaliers
    where cheval_id = v_inv.cheval_id and cavalier_id = auth.uid()
  ) then
    return jsonb_build_object('cheval_id', v_cheval.id, 'nom', v_cheval.nom, 'deja_lie', true);
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
--  Calendrier partagé
-- ------------------------------------------------------------
create table if not exists public.creneaux (
  id          uuid primary key default gen_random_uuid(),
  cheval_id   uuid not null references public.chevaux (id) on delete cascade,
  cavalier_id uuid not null references public.profils (id) on delete cascade,
  debut       timestamptz not null,
  fin         timestamptz not null,
  titre       text,
  type        text not null default 'monte'
              check (type in ('monte', 'seance', 'balade', 'cours', 'soin', 'autre')),
  notes       text,
  cree_le     timestamptz not null default now(),
  check (fin > debut)
);

create index if not exists idx_creneaux_cheval_debut on public.creneaux (cheval_id, debut);

-- ------------------------------------------------------------
--  Carnet de séances
-- ------------------------------------------------------------
create table if not exists public.seances (
  id          uuid primary key default gen_random_uuid(),
  cheval_id   uuid not null references public.chevaux (id) on delete cascade,
  cavalier_id uuid not null references public.profils (id) on delete cascade,
  date        date not null default current_date,
  type        text not null default 'plat'
              check (type in ('dressage', 'obstacle', 'balade', 'longe', 'cross', 'plat', 'autre')),
  duree_min   int,
  notes       text,
  cree_le     timestamptz not null default now()
);

create index if not exists idx_seances_cheval_date on public.seances (cheval_id, date desc);

-- ------------------------------------------------------------
--  Soins (table unique : ferrure, véto, vaccin, vermifuge, ostéo, dentiste)
-- ------------------------------------------------------------
create table if not exists public.soins (
  id                 uuid primary key default gen_random_uuid(),
  cheval_id          uuid not null references public.chevaux (id) on delete cascade,
  type               text not null
                     check (type in ('ferrure', 'veterinaire', 'vaccin', 'vermifuge',
                                     'osteopathe', 'dentiste', 'autre')),
  date_realisee      date not null default current_date,
  prochaine_echeance date,
  praticien          text,
  produit            text,
  cout               numeric(10, 2),
  notes              text,
  cree_par           uuid references public.profils (id) on delete set null,
  cree_le            timestamptz not null default now()
);

create index if not exists idx_soins_cheval on public.soins (cheval_id, date_realisee desc);
create index if not exists idx_soins_echeance on public.soins (prochaine_echeance)
  where prochaine_echeance is not null;

-- Vue des échéances : alimente le tableau de bord cavalier ET la vue club.
-- security_invoker = le RLS des tables sous-jacentes s'applique à l'appelant.
create or replace view public.v_echeances
with (security_invoker = on)
as
select
  s.id,
  s.cheval_id,
  c.nom       as cheval_nom,
  c.photo_url as cheval_photo,
  c.club_id,
  s.type,
  s.date_realisee,
  s.prochaine_echeance,
  s.praticien,
  s.produit,
  (s.prochaine_echeance - current_date) as jours_restants,
  case
    when s.prochaine_echeance < current_date then 'retard'
    when s.prochaine_echeance <= current_date + 7 then 'urgent'
    when s.prochaine_echeance <= current_date + 30 then 'bientot'
    else 'ok'
  end as statut
from public.soins s
join public.chevaux c on c.id = s.cheval_id
where s.prochaine_echeance is not null
  -- seul le soin le plus récent de chaque type porte l'échéance active
  and s.id = (
    select s2.id from public.soins s2
    where s2.cheval_id = s.cheval_id and s2.type = s.type
      and s2.prochaine_echeance is not null
    order by s2.date_realisee desc, s2.cree_le desc
    limit 1
  );

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.profils          enable row level security;
alter table public.chevaux          enable row level security;
alter table public.cheval_cavaliers enable row level security;
alter table public.invitations      enable row level security;
alter table public.creneaux         enable row level security;
alter table public.seances          enable row level security;
alter table public.soins            enable row level security;

-- --- profils ---
drop policy if exists profils_select on public.profils;
create policy profils_select on public.profils for select to authenticated
  using (id = auth.uid() or partage_un_cheval(id, auth.uid()));

drop policy if exists profils_insert on public.profils;
create policy profils_insert on public.profils for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profils_update on public.profils;
create policy profils_update on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- --- chevaux ---
drop policy if exists chevaux_select on public.chevaux;
create policy chevaux_select on public.chevaux for select to authenticated
  using (a_acces_cheval(id, auth.uid()));

drop policy if exists chevaux_insert on public.chevaux;
create policy chevaux_insert on public.chevaux for insert to authenticated
  with check (cree_par = auth.uid());

drop policy if exists chevaux_update on public.chevaux;
create policy chevaux_update on public.chevaux for update to authenticated
  using (est_gestionnaire_cheval(id, auth.uid()))
  with check (est_gestionnaire_cheval(id, auth.uid()));

drop policy if exists chevaux_delete on public.chevaux;
create policy chevaux_delete on public.chevaux for delete to authenticated
  using (est_gestionnaire_cheval(id, auth.uid()));

-- --- cheval_cavaliers ---
drop policy if exists cc_select on public.cheval_cavaliers;
create policy cc_select on public.cheval_cavaliers for select to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists cc_insert on public.cheval_cavaliers;
create policy cc_insert on public.cheval_cavaliers for insert to authenticated
  with check (est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists cc_update on public.cheval_cavaliers;
create policy cc_update on public.cheval_cavaliers for update to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()) or cavalier_id = auth.uid());

-- On peut retirer un cavalier si on gère le cheval, ou quitter soi-même
drop policy if exists cc_delete on public.cheval_cavaliers;
create policy cc_delete on public.cheval_cavaliers for delete to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()) or cavalier_id = auth.uid());

-- --- invitations ---
drop policy if exists inv_select on public.invitations;
create policy inv_select on public.invitations for select to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists inv_update on public.invitations;
create policy inv_update on public.invitations for update to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists inv_delete on public.invitations;
create policy inv_delete on public.invitations for delete to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

-- --- creneaux ---
drop policy if exists creneaux_select on public.creneaux;
create policy creneaux_select on public.creneaux for select to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists creneaux_insert on public.creneaux;
create policy creneaux_insert on public.creneaux for insert to authenticated
  with check (
    a_acces_cheval(cheval_id, auth.uid())
    and (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
  );

drop policy if exists creneaux_update on public.creneaux;
create policy creneaux_update on public.creneaux for update to authenticated
  using (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists creneaux_delete on public.creneaux;
create policy creneaux_delete on public.creneaux for delete to authenticated
  using (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()));

-- --- seances ---
drop policy if exists seances_select on public.seances;
create policy seances_select on public.seances for select to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists seances_insert on public.seances;
create policy seances_insert on public.seances for insert to authenticated
  with check (
    a_acces_cheval(cheval_id, auth.uid())
    and (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
  );

drop policy if exists seances_update on public.seances;
create policy seances_update on public.seances for update to authenticated
  using (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists seances_delete on public.seances;
create policy seances_delete on public.seances for delete to authenticated
  using (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()));

-- --- soins : tous les cavaliers liés gèrent le suivi santé ---
drop policy if exists soins_select on public.soins;
create policy soins_select on public.soins for select to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_insert on public.soins;
create policy soins_insert on public.soins for insert to authenticated
  with check (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_update on public.soins;
create policy soins_update on public.soins for update to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_delete on public.soins;
create policy soins_delete on public.soins for delete to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

-- ============================================================
--  Stockage des photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists photos_lecture on storage.objects;
create policy photos_lecture on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists photos_envoi on storage.objects;
create policy photos_envoi on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and owner = auth.uid());

drop policy if exists photos_maj on storage.objects;
create policy photos_maj on storage.objects for update to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());

drop policy if exists photos_suppression on storage.objects;
create policy photos_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());

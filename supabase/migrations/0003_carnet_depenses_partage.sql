-- ============================================================
--  Carnet de travail, dépenses, protocoles de vaccin
--  et lien public de la fiche cheval.
--
--  À exécuter APRÈS 0001_schema.sql et 0002_correctif_rls_chevaux.sql.
-- ============================================================

-- ------------------------------------------------------------
--  1. Carnet de travail : ressenti après la séance
-- ------------------------------------------------------------
alter table public.seances
  add column if not exists ressenti text;

do $$ begin
  alter table public.seances drop constraint if exists seances_ressenti_check;
  alter table public.seances add constraint seances_ressenti_check
    check (ressenti is null or ressenti in
      ('ras', 'en_forme', 'fatigue', 'tendu', 'boiterie_suspectee', 'blessure', 'autre'));
end $$;

-- « repos » rejoint les types de travail
do $$ begin
  alter table public.seances drop constraint if exists seances_type_check;
  alter table public.seances add constraint seances_type_check
    check (type in ('dressage', 'obstacle', 'balade', 'longe', 'cross', 'plat', 'repos', 'autre'));
end $$;

-- Seuil d'alerte d'inactivité, configurable par compte (7 jours par défaut)
alter table public.profils
  add column if not exists seuil_inactivite_jours int not null default 7;

-- ------------------------------------------------------------
--  2. Dépenses
--     La colonne « cout » existe depuis 0001 : on l'indexe et on
--     interdit seulement les montants négatifs.
-- ------------------------------------------------------------
do $$ begin
  alter table public.soins drop constraint if exists soins_cout_positif;
  alter table public.soins add constraint soins_cout_positif
    check (cout is null or cout >= 0);
end $$;

create index if not exists idx_soins_cout on public.soins (cheval_id, date_realisee)
  where cout is not null;

-- ------------------------------------------------------------
--  3. Protocole de vaccination retenu (grippe, tétanos, rhino…)
-- ------------------------------------------------------------
alter table public.soins
  add column if not exists protocole text;

-- ------------------------------------------------------------
--  4. Lien public de la fiche cheval
--
--  Aucune politique RLS n'est ouverte au rôle « anon » : la lecture
--  publique passe uniquement par la fonction fiche_publique(), en
--  security definer, qui ne renvoie qu'une charge utile choisie —
--  identité et carnet de santé, sans le propriétaire ni les montants.
-- ------------------------------------------------------------
create table if not exists public.partages_publics (
  id         uuid primary key default gen_random_uuid(),
  cheval_id  uuid not null references public.chevaux (id) on delete cascade,
  token      text not null unique,
  actif      boolean not null default true,
  cree_par   uuid not null references public.profils (id) on delete cascade,
  cree_le    timestamptz not null default now(),
  revoque_le timestamptz
);

create index if not exists idx_partages_cheval on public.partages_publics (cheval_id);

alter table public.partages_publics enable row level security;

-- Seul le propriétaire (ou le club) voit et révoque les liens de son cheval.
drop policy if exists partages_select on public.partages_publics;
create policy partages_select on public.partages_publics for select to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists partages_update on public.partages_publics;
create policy partages_update on public.partages_publics for update to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

drop policy if exists partages_delete on public.partages_publics;
create policy partages_delete on public.partages_publics for delete to authenticated
  using (est_gestionnaire_cheval(cheval_id, auth.uid()));

create or replace function public.creer_lien_public(p_cheval uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le propriétaire ou le club peut partager cette fiche';
  end if;

  -- Un seul lien actif à la fois : régénérer révoque le précédent.
  update partages_publics
     set actif = false, revoque_le = now()
   where cheval_id = p_cheval and actif;

  v_token := encode(gen_random_bytes(16), 'hex');

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
  if not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le propriétaire ou le club peut révoquer ce lien';
  end if;

  update partages_publics
     set actif = false, revoque_le = now()
   where cheval_id = p_cheval and actif;
end;
$$;

-- Lecture publique : accessible sans compte, strictement limitée au contenu
-- ci-dessous. Ni proprietaire_nom, ni cout, ni cavaliers, ni créneaux.
create or replace function public.fiche_publique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheval chevaux%rowtype;
begin
  select c.* into v_cheval
    from partages_publics p
    join chevaux c on c.id = p.cheval_id
   where p.token = p_token and p.actif;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'cheval', jsonb_build_object(
      'nom', v_cheval.nom,
      'photo_url', v_cheval.photo_url,
      'date_naissance', v_cheval.date_naissance,
      'race', v_cheval.race,
      'robe', v_cheval.robe,
      'sexe', v_cheval.sexe
    ),
    'soins', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', s.type,
               'date_realisee', s.date_realisee,
               'prochaine_echeance', s.prochaine_echeance,
               'praticien', s.praticien,
               'produit', s.produit,
               'protocole', s.protocole,
               'notes', s.notes
             ) order by s.date_realisee desc)
        from soins s
       where s.cheval_id = v_cheval.id
    ), '[]'::jsonb),
    'genere_le', now()
  );
end;
$$;

-- La fonction est le seul point d'entrée public.
revoke all on function public.fiche_publique(text) from public;
grant execute on function public.fiche_publique(text) to anon, authenticated;

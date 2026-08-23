-- ============================================================
--  0032 — Le partage se règle par catégorie, pas entrée par entrée
--
--  Retour sur 0028/0031 : la colonne `prive`, posée entrée par
--  entrée (un soin, un créneau, un document à la fois), avait deux
--  défauts signalés à l'usage :
--
--  1. Elle masquait une entrée privée à TOUT LE MONDE sauf son
--     auteur — y compris aux autres cavaliers du cheval. Or seule
--     l'écurie (le club, ou l'écurie de pension) doit pouvoir être
--     tenue à l'écart : un cheval partagé avec une autre cavalière
--     doit lui rester entièrement visible, instantanément.
--  2. Cocher « Partagé »/« Privé » à CHAQUE saisie est un geste
--     répétitif pour un choix qui, en pratique, ne change pas d'un
--     soin à l'autre : la propriétaire veut trois interrupteurs —
--     un pour le calendrier, un pour les soins, un pour les
--     documents — pas un par entrée.
--
--  Cette migration remplace donc `soins.prive` / `documents.prive` /
--  `creneaux.prive` par trois réglages sur le CHEVAL lui-même,
--  visibles et modifiables par la seule propriétaire effective
--  (chevaux_update, déjà exclusif — 0029), et qui ne concernent que
--  la visibilité pour l'écurie : `partage_soins_club`,
--  `partage_documents_club`, `partage_creneaux_club` — vrai par
--  défaut, pour ne rien changer à l'existant.
--
--  « L'écurie », ici, désigne qui obtient l'accès par une relation
--  INSTITUTIONNELLE au cheval — le club propriétaire (`club_id`) ou
--  l'écurie d'une pension confirmée (`ecurie_id`) — jamais un
--  cavalier lié directement (cheval_cavaliers). C'est exactement les
--  deux dernières branches de `a_acces_cheval()`, qui elle ne bouge
--  pas : ces réglages affinent QUOI l'écurie voit une fois qu'elle a
--  accès, ils ne touchent pas à QUI a accès.
--
--  Sans effet sur l'accès obligatoire du club aux cours qu'il
--  attribue (table `cours`/`inscriptions_cours`, 0017+, jamais
--  consultée ici) ni sur le masquage des coûts de soins (0019,
--  logique indépendante et inchangée).
--
--  À exécuter dans le SQL Editor de Supabase, après 0031.
-- ============================================================

-- ------------------------------------------------------------
--  1. Les trois réglages, sur le cheval
-- ------------------------------------------------------------
alter table public.chevaux add column if not exists partage_soins_club boolean not null default true;
alter table public.chevaux add column if not exists partage_documents_club boolean not null default true;
alter table public.chevaux add column if not exists partage_creneaux_club boolean not null default true;

-- « L'écurie » : club propriétaire, ou écurie d'une pension confirmée —
-- les deux branches institutionnelles de a_acces_cheval(), jamais un
-- cavalier lié directement.
create or replace function public.est_ecurie_cheval(p_cheval uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from chevaux c
    where c.id = p_cheval
      and (c.club_id = p_user or (c.ecurie_id = p_user and c.pension_confirmee))
  );
$$;

create or replace function public.partage_soins_actif(p_cheval uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select partage_soins_club from chevaux where id = p_cheval), true); $$;

create or replace function public.partage_documents_actif(p_cheval uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select partage_documents_club from chevaux where id = p_cheval), true); $$;

create or replace function public.partage_creneaux_actif(p_cheval uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select partage_creneaux_club from chevaux where id = p_cheval), true); $$;

-- ------------------------------------------------------------
--  2. Soins — remplace la règle de 0028
-- ------------------------------------------------------------
drop policy if exists soins_select on public.soins;
create policy soins_select on public.soins for select to authenticated
  using (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and (
      cree_par = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_soins_actif(cheval_id)
    )
  );

drop policy if exists soins_update on public.soins;
create policy soins_update on public.soins for update to authenticated
  using (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and (
      cree_par = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_soins_actif(cheval_id)
    )
  )
  with check (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and cree_par = auth.uid()
  );

drop policy if exists soins_delete on public.soins;
create policy soins_delete on public.soins for delete to authenticated
  using (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and (
      cree_par = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_soins_actif(cheval_id)
    )
  );

-- `create or replace view` ne peut pas retirer une colonne (`prive`
-- disparaît ici) : il faut la reposer entièrement.
drop view if exists public.v_soins;
create view public.v_soins
with (security_barrier = true) as
select
  s.id, s.cheval_id, s.type, s.date_realisee, s.prochaine_echeance,
  s.praticien, s.produit, s.protocole, s.notes, s.cree_par, s.cree_le,
  case
    when s.cree_par = auth.uid() or est_gestionnaire_cheval(s.cheval_id, auth.uid())
    then s.cout
  end as cout
from public.soins s
where a_acces_cheval(s.cheval_id, auth.uid())
  and premium_cheval(s.cheval_id, auth.uid())
  and (
    s.cree_par = auth.uid()
    or not est_ecurie_cheval(s.cheval_id, auth.uid())
    or partage_soins_actif(s.cheval_id)
  );

grant select on public.v_soins to authenticated;

-- La fiche publique n'a jamais dépendu du club : un lien public s'adresse
-- à un tiers hors application (vétérinaire, acheteur potentiel...), sans
-- lien avec ce que l'écurie voit ou non depuis l'application.
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

alter table public.soins drop column if exists prive;

-- ------------------------------------------------------------
--  3. Documents — remplace la règle de 0031
-- ------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    a_acces_cheval(cheval_id, auth.uid())
    and (
      ajoute_par = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_documents_actif(cheval_id)
    )
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (
    a_acces_cheval(cheval_id, auth.uid())
    and (
      ajoute_par = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_documents_actif(cheval_id)
    )
  );

drop policy if exists documents_stockage_lecture on storage.objects;
create policy documents_stockage_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
    and (
      not est_ecurie_cheval((storage.foldername(name))[1]::uuid, auth.uid())
      or partage_documents_actif((storage.foldername(name))[1]::uuid)
      or exists (
        select 1 from public.documents d
        where d.chemin = name and d.ajoute_par = auth.uid()
      )
    )
  );

drop policy if exists documents_stockage_suppression on storage.objects;
create policy documents_stockage_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
    and (
      not est_ecurie_cheval((storage.foldername(name))[1]::uuid, auth.uid())
      or partage_documents_actif((storage.foldername(name))[1]::uuid)
      or exists (
        select 1 from public.documents d
        where d.chemin = name and d.ajoute_par = auth.uid()
      )
    )
  );

alter table public.documents drop column if exists prive;

-- ------------------------------------------------------------
--  4. Créneaux — remplace la règle de 0031
-- ------------------------------------------------------------
drop policy if exists creneaux_select on public.creneaux;
create policy creneaux_select on public.creneaux for select to authenticated
  using (
    a_acces_cheval(cheval_id, auth.uid())
    and (
      cavalier_id = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_creneaux_actif(cheval_id)
    )
  );

drop policy if exists creneaux_update on public.creneaux;
create policy creneaux_update on public.creneaux for update to authenticated
  using (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (
      cavalier_id = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_creneaux_actif(cheval_id)
    )
  )
  with check (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (premium_cheval(cheval_id, auth.uid()) or debut < fin_semaine_courante())
  );

drop policy if exists creneaux_delete on public.creneaux;
create policy creneaux_delete on public.creneaux for delete to authenticated
  using (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (
      cavalier_id = auth.uid()
      or not est_ecurie_cheval(cheval_id, auth.uid())
      or partage_creneaux_actif(cheval_id)
    )
  );

alter table public.creneaux drop column if exists prive;

-- ------------------------------------------------------------
--  Contrôle après exécution (cheval de club, propriétaire désignée) :
--
--    -- connectée comme la propriétaire :
--    update chevaux set partage_soins_club = false where id = '<cheval>';
--
--    insert into soins (cheval_id, type, date_realisee, cree_par)
--    values ('<cheval>', 'vermifuge', current_date, auth.uid());
--
--    -- reconnecté en club :
--    select count(*) from v_soins where cheval_id = '<cheval>';
--      -- 0 : le carnet a disparu pour l'écurie
--
--    -- reconnecté comme une AUTRE cavalière liée au même cheval :
--    select count(*) from v_soins where cheval_id = '<cheval>';
--      -- toujours visible — seule l'écurie est concernée
-- ------------------------------------------------------------

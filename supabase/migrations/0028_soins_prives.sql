-- ============================================================
--  0028 — Soins privés : un soin peut ne pas être partagé
--
--  Prérequis du rôle « propriétaire » (0029) : celui-ci doit
--  pouvoir choisir ce qu'il montre à l'écurie. Cette migration
--  porte le schéma d'une migration déjà écrite et testée sur une
--  branche voisine (0022_soins_prives, non fusionnée) — repris ici
--  seul le schéma/RLS/vue/fiche publique ; le bouton de bascule
--  côté écran arrive avec cette autre branche.
--
--  Chaque soin gagne une colonne `prive`. Par défaut false (rien
--  ne change pour l'existant). Un soin privé ne se lit, ne se
--  modifie ni ne se supprime que par qui l'a créé — l'écurie ne le
--  voit plus, comme si elle n'y avait jamais eu accès.
--
--  Ce qui ne change PAS : la création d'un soin (soins_insert) —
--  poser un soin privé reste un accès cheval normal, seule sa
--  visibilité ultérieure change. Le masquage du coût (0019) reste
--  indépendant et se cumule avec celui-ci.
--
--  À exécuter dans le SQL Editor de Supabase, après 0027.
-- ============================================================

alter table public.soins add column if not exists prive boolean not null default false;

-- ------------------------------------------------------------
--  Colonnes : `prive` doit se lire comme les autres colonnes
--  ouvertes (tout sauf `cout`) — on refait le grant dynamique de
--  0019 pour qu'il embarque la nouvelle colonne.
-- ------------------------------------------------------------
revoke select on public.soins from authenticated, anon;

do $$
declare
  v_colonnes text;
begin
  select string_agg(quote_ident(column_name), ', ')
  into v_colonnes
  from information_schema.columns
  where table_schema = 'public' and table_name = 'soins' and column_name <> 'cout';

  execute format('grant select (%s) on public.soins to authenticated', v_colonnes);
end $$;

drop policy if exists soins_select on public.soins;
create policy soins_select on public.soins for select to authenticated
  using (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and (not prive or cree_par = auth.uid())
  );

drop policy if exists soins_update on public.soins;
create policy soins_update on public.soins for update to authenticated
  using (
    premium_cheval(cheval_id, auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and (not prive or cree_par = auth.uid())
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
    and (not prive or cree_par = auth.uid())
  );

-- La vue rejoue la même règle de visibilité (elle contourne le RLS
-- de la table, security_barrier oblige — voir 0019).
create or replace view public.v_soins
with (security_barrier = true) as
select
  s.id, s.cheval_id, s.type, s.date_realisee, s.prochaine_echeance,
  s.praticien, s.produit, s.protocole, s.notes, s.cree_par, s.cree_le,
  case
    when s.cree_par = auth.uid() or est_gestionnaire_cheval(s.cheval_id, auth.uid())
    then s.cout
  end as cout,
  s.prive
from public.soins s
where a_acces_cheval(s.cheval_id, auth.uid())
  and premium_cheval(s.cheval_id, auth.uid())
  and (not s.prive or s.cree_par = auth.uid());

grant select on public.v_soins to authenticated;

-- La fiche publique (lien partagé sans compte) n'affiche jamais un
-- soin privé — un tiers extérieur en sait déjà moins qu'un membre
-- de l'écurie, ça ne doit pas régresser.
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
       where s.cheval_id = v_cheval.id and not s.prive
    ), '[]'::jsonb),
    'genere_le', now()
  );
end;
$$;

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    insert into soins (cheval_id, type, date_realisee, cree_par, prive)
--    values ('<cheval>', 'note perso', current_date, auth.uid(), true);
--
--    -- connecté en écurie sur ce même cheval :
--    select count(*) from v_soins where cheval_id = '<cheval>';
--      -- le soin privé n'apparaît pas
--
--    -- connecté comme l'auteure du soin :
--    select count(*) from v_soins where cheval_id = '<cheval>';
--      -- le soin privé apparaît, comme toujours
-- ------------------------------------------------------------

-- ============================================================
--  0022 — Soins privés ou partagés
--
--  Chaque entrée du carnet de santé choisit sa visibilité :
--  partagée (le défaut — visible par tous ceux qui ont accès au
--  cheval, comme avant) ou privée (visible par son seul créateur).
--
--  L'usage : sur un cheval en demi-pension ou en pension, on note
--  parfois un soin qu'on ne souhaite pas étaler — une consultation
--  en cours, un essai de traitement, une note personnelle pour le
--  vétérinaire. Le reste du carnet reste commun.
--
--  Tout se joue en base, pas à l'affichage :
--  - la politique de lignes de `soins` cache les privés d'autrui,
--  - la vue `v_soins` (0019) rejoue la même règle — c'est elle que
--    lit l'application (carnet, calendrier, accueil club, export),
--  - `v_echeances` et `v_rappels` sont en security_invoker : elles
--    héritent de la politique sans rien à changer — l'échéance d'un
--    soin privé ne sonne que chez son créateur, et les autres
--    retombent sur l'échéance du dernier soin partagé du type,
--  - la fiche publique (lien de partage) exclut les soins privés :
--    ce qui n'est pas pour les cavaliers du cheval n'est pas pour
--    le monde entier.
-- ============================================================

-- ------------------------------------------------------------
--  1. La colonne
--
--  `false` = partagé : tout l'existant garde exactement sa
--  visibilité d'aujourd'hui.
-- ------------------------------------------------------------
alter table public.soins
  add column if not exists prive boolean not null default false;

-- ------------------------------------------------------------
--  2. Droits de colonne — rappel de 0019
--
--  Le SELECT global de `soins` est révoqué depuis 0019 et rendu
--  colonne par colonne, toutes sauf `cout`. Une colonne née après
--  ce grant n'est couverte par rien : on rejoue la même liste pour
--  que `prive` se lise comme les autres.
--
--  ATTENTION (même garde-fou que 0019) : un futur
--  `grant select on soins` global rouvrirait la colonne `cout`.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  3. Politiques de lignes
--
--  Lecture, modification et suppression : un soin privé n'existe
--  que pour son créateur. Les autres ne peuvent ni le lire, ni le
--  modifier, ni le supprimer — même en devinant son identifiant.
--
--  L'insertion ne change pas : `cree_par = auth.uid()` (0010)
--  garantit déjà qu'on ne crée un soin — privé ou non — qu'à son
--  propre nom.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  4. La vue v_soins rejoue la nouvelle règle
--
--  La vue est en security definer (c'est elle qui masque `cout`,
--  0019) : la politique de lignes ne la traverse pas, son WHERE
--  doit porter lui-même la confidentialité. `prive` s'ajoute en
--  fin de liste — l'application affiche le cadenas sur ses propres
--  soins privés.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  5. La fiche publique n'expose que le partagé
--
--  `fiche_publique` (0003) tourne en security definer et servait
--  tout le carnet au porteur du lien. Un soin privé n'étant pas
--  pour les cavaliers du cheval, il n'est pas non plus pour le
--  lien public — quel que soit celui qui a généré ce lien.
-- ------------------------------------------------------------
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
         and not s.prive
    ), '[]'::jsonb),
    'genere_le', now()
  );
end;
$$;

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    select prive, count(*) from soins group by prive;
--    -- tout l'existant est en `false` (partagé)
--
--    -- Avec deux comptes liés au même cheval : A crée un soin
--    -- privé, B ne le voit ni dans v_soins, ni dans v_echeances,
--    -- ni dans la cloche ; la fiche publique du cheval non plus.
-- ------------------------------------------------------------

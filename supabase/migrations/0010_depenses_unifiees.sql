-- ============================================================
--  Unification des dépenses.
--
--  Un coût saisi depuis la fiche d'un cheval vivait dans
--  `soins.cout` et n'apparaissait nulle part dans l'onglet
--  Dépenses : deux comptabilités parallèles, et un total faux.
--
--  `depenses` devient la table unique. Un soin qui porte un coût
--  y projette automatiquement une ligne, par trigger — donc quel
--  que soit le chemin d'écriture, y compris un correctif SQL ou un
--  écran ajouté plus tard.
--
--  À exécuter après 0009.
-- ============================================================

-- ------------------------------------------------------------
--  1. Lien entre une dépense et le soin dont elle provient
--
--  `on delete cascade` : supprimer un soin supprime son coût. La
--  dépense EST le coût du soin, pas une écriture indépendante —
--  la laisser derrière donnerait un total juste avec une ligne
--  orpheline, impossible à rattacher à quoi que ce soit.
--
--  Index unique : un soin ne produit qu'une dépense. C'est aussi
--  ce qui rend le trigger et la reprise idempotents. Les valeurs
--  NULL restent distinctes entre elles en PostgreSQL, donc les
--  dépenses saisies à la main ne se gênent pas.
-- ------------------------------------------------------------
alter table public.depenses
  add column if not exists soin_id uuid references public.soins (id) on delete cascade;

create unique index if not exists idx_depenses_soin on public.depenses (soin_id);

comment on column public.depenses.soin_id is
  'Soin dont cette dépense est le coût. NULL pour une saisie directe.';

-- ------------------------------------------------------------
--  2. Type de soin → poste de dépense
--
--  Vaccin, vermifuge et dentiste tombent sous « vétérinaire » :
--  ce sont des actes de santé, et l'utilisateur qui lit son budget
--  ne cherche pas une ligne par acte, il cherche ce que lui coûte
--  la santé de son cheval.
-- ------------------------------------------------------------
create or replace function public.categorie_depuis_soin(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'ferrure'     then 'marechal'
    when 'osteopathe'  then 'osteo'
    when 'veterinaire' then 'veterinaire'
    when 'vaccin'      then 'veterinaire'
    when 'vermifuge'   then 'veterinaire'
    when 'dentiste'    then 'veterinaire'
    else 'autre'
  end;
$$;

-- ------------------------------------------------------------
--  3. Synchronisation soin → dépense
--
--  En `security definer` : le trigger écrit dans `depenses` pour
--  le compte de l'auteur du soin, ce que les politiques RLS
--  interdiraient à une session cliente. C'est légitime — l'écriture
--  dérive d'un soin que le RLS a déjà autorisé — mais cela déplace
--  la responsabilité sur `soins.cree_par`, d'où le durcissement au
--  paragraphe 5.
--
--  Un coût effacé, mis à zéro, ou un soin dont l'auteur a été
--  anonymisé retire la dépense : le total suit toujours ce que
--  montre le carnet.
-- ------------------------------------------------------------
create or replace function public.synchroniser_depense_soin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cout is null or new.cout <= 0 or new.cree_par is null then
    delete from depenses where soin_id = new.id;
    return new;
  end if;

  insert into depenses (profil_id, cheval_id, montant, categorie, date, note, soin_id)
  values (
    new.cree_par,
    new.cheval_id,
    new.cout,
    categorie_depuis_soin(new.type),
    new.date_realisee,
    nullif(coalesce(new.praticien, new.produit, ''), ''),
    new.id
  )
  on conflict (soin_id) do update set
    -- profil_id n'est PAS remis à jour : une dépense reste au budget
    -- de qui l'a engagée, même si le soin change de main.
    cheval_id = excluded.cheval_id,
    montant   = excluded.montant,
    categorie = excluded.categorie,
    date      = excluded.date,
    note      = excluded.note;

  return new;
end;
$$;

drop trigger if exists soins_vers_depenses on public.soins;
create trigger soins_vers_depenses
  after insert or update on public.soins
  for each row
  execute function public.synchroniser_depense_soin();

-- ------------------------------------------------------------
--  4. Reprise des soins déjà saisis
--
--  `where not exists` plutôt qu'un ON CONFLICT : la migration est
--  ainsi rejouable sans rien dupliquer ni écraser une dépense que
--  l'utilisateur aurait entre-temps corrigée à la main.
--
--  Les soins sans auteur connu (`cree_par` null, effacé par le
--  `on delete set null` d'un compte supprimé) sont laissés de
--  côté : on ne peut pas les imputer à un budget sans inventer un
--  payeur. Leur coût reste lisible dans le carnet.
-- ------------------------------------------------------------
insert into public.depenses (profil_id, cheval_id, montant, categorie, date, note, soin_id)
select
  s.cree_par,
  s.cheval_id,
  s.cout,
  public.categorie_depuis_soin(s.type),
  s.date_realisee,
  nullif(coalesce(s.praticien, s.produit, ''), ''),
  s.id
from public.soins s
where s.cout is not null
  and s.cout > 0
  and s.cree_par is not null
  and not exists (select 1 from public.depenses d where d.soin_id = s.id);

-- ------------------------------------------------------------
--  5. Durcissement : un soin s'écrit à son propre nom
--
--  `soins_insert` ne contrôlait que l'accès au cheval, pas
--  l'auteur déclaré. Sur un cheval en demi-pension, un cavalier
--  pouvait donc enregistrer un soin au nom de l'autre — sans
--  conséquence tant que `cree_par` n'était qu'informatif, mais le
--  trigger ci-dessus en fait le payeur. Sans ce contrôle, on
--  pourrait porter une dépense au budget d'autrui.
--
--  Le WITH CHECK sur l'UPDATE ferme le même chemin en deux temps :
--  créer un soin à son nom, puis le réattribuer.
-- ------------------------------------------------------------
drop policy if exists soins_insert on public.soins;
create policy soins_insert on public.soins for insert to authenticated
  with check (
    est_premium(auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and cree_par = auth.uid()
  );

drop policy if exists soins_update on public.soins;
create policy soins_update on public.soins for update to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()))
  with check (
    est_premium(auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    and cree_par = auth.uid()
  );

-- ------------------------------------------------------------
--  6. Cloisonnement des budgets — rappel de 0009
--
--  Les politiques de `depenses` filtrent déjà sur
--  `profil_id = auth.uid()` : sur un cheval partagé, chacun ne voit
--  que ce qu'il a engagé. Rien à changer ici, mais la règle est
--  assez structurante pour être écrite dans la base plutôt que
--  seulement dans une note de version.
-- ------------------------------------------------------------
comment on table public.depenses is
  'Dépenses du compte. Cloisonnées par profil_id : sur un cheval partagé, '
  'chaque cavalier ne voit et ne totalise que ce qu''il a lui-même engagé.';

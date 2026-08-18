-- ============================================================
--  Le quotidien de la pension : remplacement d'un cheval malade,
--  liaison directe d'un membre par le club, et coûts de soins
--  masqués aux cavaliers.
--
--  Trois besoins d'un même terrain. Quand le cheval d'une
--  demi-pensionnaire est au repos, le club la bascule sur un
--  autre cheval — et elle doit écrire ses séances sur CELUI-LÀ.
--  Le club doit donc pouvoir lier un membre à un cheval en un
--  geste, sans générer de code. Et ce que le club dépense pour
--  ses chevaux ne regarde pas les cavaliers qui en partagent la
--  fiche : le coût d'un soin devient invisible pour qui n'est ni
--  son auteur, ni le gestionnaire du cheval.
--
--  À exécuter après 0018.
-- ============================================================

-- ------------------------------------------------------------
--  1. La liaison de remplacement se souvient d'où elle vient
--
--  `remplacement_de` pointe le cheval indisponible que cette
--  liaison remplace. Elle permet d'afficher « remplace Quenotte »
--  sur la fiche, et de retrouver les remplacements à clore quand
--  l'indisponibilité est levée. Nulle pour une liaison normale.
-- ------------------------------------------------------------
alter table public.cheval_cavaliers
  add column if not exists remplacement_de uuid references public.chevaux (id) on delete set null;

create index if not exists idx_cc_remplacement
  on public.cheval_cavaliers (remplacement_de) where remplacement_de is not null;

-- ------------------------------------------------------------
--  2. Le club lie un membre en un geste, sans code
--
--  Le code d'invitation reste la porte d'entrée normale — c'est
--  le cavalier qui agit. Ici c'est l'inverse : le club place un
--  de SES membres sur un de SES chevaux, séance tenante, devant
--  la carrière. Générer un code pour se le dicter à soi-même
--  n'aurait aucun sens.
--
--  La politique cc_insert autoriserait déjà le gestionnaire, mais
--  la fonction ajoute ce que la politique ne sait pas dire : le
--  cavalier doit être membre du club, la couleur est attribuée,
--  et le remplacement éventuel est validé puis mémorisé.
-- ------------------------------------------------------------
create or replace function public.lier_membre_au_cheval(
  p_cheval uuid,
  p_cavalier uuid,
  p_remplace uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheval chevaux%rowtype;
begin
  select * into v_cheval from chevaux where id = p_cheval;

  if not found or not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le gestionnaire du cheval peut lier un cavalier';
  end if;
  if v_cheval.club_id is null then
    raise exception 'CHEVAL_SANS_CLUB'
      using hint = 'La liaison directe sert aux chevaux de club — pour un cheval de particulier, générez un code d''invitation.';
  end if;
  if not est_cavalier_du_club(v_cheval.club_id, p_cavalier) then
    raise exception 'CAVALIER_HORS_CLUB'
      using hint = 'Ce cavalier n''est pas membre de l''écurie.';
  end if;
  -- Un remplacement ne peut viser qu'un autre cheval du même club :
  -- sinon la mention « remplace X » pourrait pointer un cheval
  -- inconnu de l'écurie.
  if p_remplace is not null and not exists (
    select 1 from chevaux where id = p_remplace and club_id = v_cheval.club_id
  ) then
    p_remplace := null;
  end if;

  if exists (
    select 1 from cheval_cavaliers
    where cheval_id = p_cheval and cavalier_id = p_cavalier
  ) then
    return jsonb_build_object('deja_lie', true);
  end if;

  insert into cheval_cavaliers (cheval_id, cavalier_id, role, couleur, remplacement_de)
  values (p_cheval, p_cavalier, 'cavalier_club', couleur_libre(p_cheval), p_remplace);

  return jsonb_build_object('deja_lie', false);
end;
$$;

-- ------------------------------------------------------------
--  3. Le coût d'un soin ne regarde pas tous les cavaliers
--
--  Jusqu'ici, quiconque lisait le carnet de santé voyait la
--  colonne `cout` : la demi-pensionnaire d'un cheval de club
--  connaissait la facture du vétérinaire de l'écurie. La règle
--  devient : le coût n'est visible que de SON AUTEUR et du
--  GESTIONNAIRE du cheval (propriétaire ou club).
--
--  Le RLS ne sait pas masquer une colonne, seulement des lignes.
--  Le verrou est donc un droit de colonne : le rôle client perd
--  la lecture de `cout` sur la table — un `select cout` direct
--  échoue, quelle que soit la requête. La lecture passe par la
--  vue v_soins, qui rejoue exactement la politique de lignes de
--  la table et ne rend le coût qu'à qui y a droit.
--
--  En PostgreSQL, un droit de colonne ne se soustrait pas d'un
--  droit de table : on retire donc le SELECT global, puis on
--  rend toutes les colonnes sauf `cout`. La liste est construite
--  dynamiquement pour ne pas figer le schéma de la table ici.
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

--  La vue appartient au propriétaire du schéma et contourne donc
--  le RLS de la table : elle DOIT rejouer sa politique de lecture
--  (accès au cheval + premium contextuel, comme soins_select).
--  `security_barrier` : les prédicats de la vue s'évaluent avant
--  toute fonction posée par l'appelant.
create or replace view public.v_soins
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
  and premium_cheval(s.cheval_id, auth.uid());

grant select on public.v_soins to authenticated;

-- ------------------------------------------------------------
--  Ce qui ne change pas — et pourquoi ça continue de marcher
--
--  - Écrire un soin (insert/update/delete, coût compris) reste
--    permis : seuls les droits de LECTURE de la colonne bougent.
--  - v_echeances et v_rappels ne lisent pas `cout` : les alertes
--    et la cloche sont intactes.
--  - Le trigger soins → depenses (0010) et la fiche publique
--    s'exécutent en security definer : rien à ajuster.
--  - Les dépenses (table `depenses`) étaient déjà privées :
--    chacun ne lit que ses propres lignes.
--
--  Contrôle après exécution :
--
--    select count(*) from v_soins;          -- vos soins, coût selon vos droits
--    select cout from soins limit 1;        -- « permission denied for table soins »
-- ------------------------------------------------------------

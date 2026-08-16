-- ============================================================
--  Module « Dépenses » — suivi du budget équestre.
--
--  Réservé au premium, au même titre que le carnet de santé, et
--  par le même mécanisme : les politiques RLS appellent
--  est_premium(). Rien n'est laissé à l'interface.
--
--  À exécuter après 0008.
-- ============================================================

-- ------------------------------------------------------------
--  1. La table
--
--  UNE DÉPENSE APPARTIENT À CELUI QUI L'A SAISIE, pas au cheval.
--  C'est la différence de fond avec `soins`, et elle est
--  volontaire : la pension, le van ou les engagements en concours
--  sont payés par une personne. Deux demi-pensionnaires d'un même
--  cheval n'ont aucune raison de voir le budget l'un de l'autre,
--  et le propriétaire n'a pas à découvrir ce que dépense son
--  demi-pensionnaire.
--
--  D'où `profil_id` en propriétaire de la ligne, et un cheval
--  seulement à titre d'étiquette.
--
--  `cheval_id` est nullable : beaucoup de dépenses ne se
--  rattachent à aucun cheval en particulier — une selle, une paire
--  de bottes, un déplacement. C'est le « tous » de l'interface.
--
--  `on delete set null` plutôt que `cascade` : perdre l'accès à un
--  cheval ne doit pas effacer ce qu'on a dépensé pour lui. La
--  ligne reste, rattachée à « tous ».
-- ------------------------------------------------------------
create table if not exists public.depenses (
  id        uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profils (id) on delete cascade,
  cheval_id uuid references public.chevaux (id) on delete set null,
  montant   numeric(10, 2) not null,
  categorie text not null,
  date      date not null default current_date,
  note      text,
  cree_le   timestamptz not null default now()
);

-- Un montant nul ou négatif n'a pas de sens ici : ce module suit des
-- sorties d'argent, pas un solde. Le plafond écarte la faute de frappe
-- qui ferait exploser tous les totaux du mois.
do $$
begin
  alter table public.depenses drop constraint if exists depenses_montant_valide;
  alter table public.depenses add constraint depenses_montant_valide
    check (montant > 0 and montant <= 1000000);
end $$;

do $$
begin
  alter table public.depenses drop constraint if exists depenses_categorie_valide;
  alter table public.depenses add constraint depenses_categorie_valide
    check (categorie in (
      'pension', 'marechal', 'veterinaire', 'osteo', 'alimentation',
      'materiel', 'concours', 'transport', 'autre'
    ));
end $$;

-- L'écran interroge toujours « mes dépenses, sur une période » :
-- l'index suit cet ordre, et sert aussi bien le mois affiché que les
-- douze mois du graphique.
create index if not exists idx_depenses_profil_date
  on public.depenses (profil_id, date desc);

-- ------------------------------------------------------------
--  2. RLS — premium, et rien que ses propres lignes
--
--  Les quatre opérations sont gardées, lecture comprise, comme
--  pour les soins en 0005. Un retour au plan gratuit masque donc
--  le module sans rien supprimer : les lignes redeviennent
--  visibles au réabonnement.
--
--  Le contrôle du cheval est posé en plus du contrôle du compte :
--  sans lui, un abonné pourrait étiqueter ses dépenses avec
--  l'identifiant d'un cheval qu'il ne connaît pas et en déduire
--  l'existence. `cheval_id is null` reste évidemment permis.
-- ------------------------------------------------------------
alter table public.depenses enable row level security;

drop policy if exists depenses_select on public.depenses;
create policy depenses_select on public.depenses for select to authenticated
  using (profil_id = auth.uid() and est_premium(auth.uid()));

drop policy if exists depenses_insert on public.depenses;
create policy depenses_insert on public.depenses for insert to authenticated
  with check (
    profil_id = auth.uid()
    and est_premium(auth.uid())
    and (cheval_id is null or a_acces_cheval(cheval_id, auth.uid()))
  );

-- USING et WITH CHECK : le premier dit quelles lignes sont
-- modifiables, le second ce qu'elles ont le droit de devenir. Sans
-- le second, une dépense pourrait être réaffectée au compte d'un
-- tiers, ou étiquetée d'un cheval inconnu.
drop policy if exists depenses_update on public.depenses;
create policy depenses_update on public.depenses for update to authenticated
  using (profil_id = auth.uid() and est_premium(auth.uid()))
  with check (
    profil_id = auth.uid()
    and est_premium(auth.uid())
    and (cheval_id is null or a_acces_cheval(cheval_id, auth.uid()))
  );

drop policy if exists depenses_delete on public.depenses;
create policy depenses_delete on public.depenses for delete to authenticated
  using (profil_id = auth.uid() and est_premium(auth.uid()));

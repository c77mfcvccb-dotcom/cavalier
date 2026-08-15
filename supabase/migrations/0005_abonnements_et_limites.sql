-- ============================================================
--  Plan gratuit / Premium — limites appliquées CÔTÉ SERVEUR.
--
--  Rien ici ne dépend de l'interface : les mêmes règles s'imposent
--  à un appel direct de l'API PostgREST, à curl, ou à la console du
--  navigateur. L'interface ne fait que les anticiper pour éviter
--  d'afficher une erreur.
--
--  Limites du plan gratuit :
--    - 1 cheval créé au maximum
--    - module soins entièrement inaccessible (lecture comprise)
--    - aucun créneau créé ou déplacé au-delà du dimanche courant
--
--  À exécuter après 0004.
-- ============================================================

-- ------------------------------------------------------------
--  1. Droits d'abonnement
--
--  Cette table est la seule source de vérité de l'abonnement, et
--  elle n'est JAMAIS écrite depuis le navigateur : aucune politique
--  d'écriture n'est accordée au rôle « authenticated ». Seul le
--  webhook RevenueCat, qui passe par la clé service_role et
--  contourne donc le RLS, y écrit.
-- ------------------------------------------------------------
create table if not exists public.abonnements (
  profil_id      uuid primary key references public.profils (id) on delete cascade,
  statut         text not null default 'gratuit'
                 check (statut in ('gratuit', 'essai', 'actif', 'expire', 'annule')),
  produit        text check (produit in ('premium_mensuel', 'premium_annuel')),
  expire_le      timestamptz,
  rc_app_user_id text,
  maj_le         timestamptz not null default now()
);

alter table public.abonnements enable row level security;

-- Lecture de son propre abonnement uniquement. Pas d'insert, pas
-- d'update, pas de delete : c'est volontaire.
drop policy if exists abonnements_select on public.abonnements;
create policy abonnements_select on public.abonnements for select to authenticated
  using (profil_id = auth.uid());

/**
 * Vrai si le compte a un accès premium à cet instant.
 *
 * « essai » est traité exactement comme « actif » : les 7 jours d'essai
 * donnent l'accès complet. Une date d'échéance passée disqualifie, même
 * si le statut n'a pas encore été mis à jour par le webhook — un webhook
 * peut être retardé ou perdu, la date fait foi.
 */
create or replace function public.est_premium(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- La fonction est en security definer et donc appelable avec n'importe quel
  -- identifiant : on refuse de renseigner sur le statut d'autrui. Les
  -- politiques ci-dessous ne l'appellent jamais qu'avec auth.uid().
  select p_user = auth.uid()
     and exists (
       select 1 from abonnements a
       where a.profil_id = p_user
         and a.statut in ('actif', 'essai')
         and (a.expire_le is null or a.expire_le > now())
     );
$$;

-- ------------------------------------------------------------
--  2. Bornes du plan gratuit
-- ------------------------------------------------------------

/**
 * Premier instant hors de la semaine en cours (lundi 00:00 suivant).
 *
 * Le calcul se fait en heure de Paris et non en UTC : sinon, le dimanche
 * soir, un cavalier français se verrait refuser un créneau qui est
 * pourtant encore dans sa semaine.
 */
create or replace function public.fin_semaine_courante()
returns timestamptz
language sql
stable
as $$
  select ((date_trunc('week', (now() at time zone 'Europe/Paris'))::date + 7)::timestamp
          at time zone 'Europe/Paris');
$$;

/** Nombre de chevaux créés par ce compte. */
create or replace function public.nb_chevaux_crees(p_user uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from chevaux where cree_par = p_user;
$$;

-- ------------------------------------------------------------
--  3. Limite « 1 cheval » à la création
--
--  Rejoindre le cheval de quelqu'un d'autre avec un code reste
--  possible en gratuit : c'est une liaison, pas une création, et
--  c'est ce qui fait vivre la demi-pension.
-- ------------------------------------------------------------
drop policy if exists chevaux_insert on public.chevaux;
create policy chevaux_insert on public.chevaux for insert to authenticated
  with check (
    cree_par = auth.uid()
    and (est_premium(auth.uid()) or nb_chevaux_crees(auth.uid()) < 1)
  );

-- ------------------------------------------------------------
--  4. Module soins réservé au premium
--
--  La lecture est bloquée elle aussi, comme demandé. Les données
--  d'un compte qui repasse en gratuit ne sont pas supprimées :
--  elles redeviennent visibles dès le retour en premium.
--
--  Conséquence voulue : la vue v_echeances, en security_invoker,
--  ne renvoie plus rien — donc plus d'alertes ni de bandeau de
--  rappel en gratuit.
-- ------------------------------------------------------------
drop policy if exists soins_select on public.soins;
create policy soins_select on public.soins for select to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_insert on public.soins;
create policy soins_insert on public.soins for insert to authenticated
  with check (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_update on public.soins;
create policy soins_update on public.soins for update to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists soins_delete on public.soins;
create policy soins_delete on public.soins for delete to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

-- ------------------------------------------------------------
--  5. Calendrier borné à la semaine en cours
--
--  Le WITH CHECK sur l'UPDATE est indispensable : sans lui, un compte
--  gratuit créerait un créneau aujourd'hui puis le déplacerait au mois
--  prochain, ce qui viderait la limite de son sens.
--  La lecture et la suppression restent libres : un compte qui repasse
--  en gratuit garde la vue de son planning déjà posé.
-- ------------------------------------------------------------
drop policy if exists creneaux_insert on public.creneaux;
create policy creneaux_insert on public.creneaux for insert to authenticated
  with check (
    a_acces_cheval(cheval_id, auth.uid())
    and (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (est_premium(auth.uid()) or debut < fin_semaine_courante())
  );

drop policy if exists creneaux_update on public.creneaux;
create policy creneaux_update on public.creneaux for update to authenticated
  using (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
  with check (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (est_premium(auth.uid()) or debut < fin_semaine_courante())
  );

-- ------------------------------------------------------------
--  6. Abonnement à la création du compte
-- ------------------------------------------------------------
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

  insert into public.abonnements (profil_id, statut)
  values (new.id, 'gratuit')
  on conflict (profil_id) do nothing;

  return new;
end;
$$;

-- Comptes déjà créés avant cette migration
insert into public.abonnements (profil_id, statut)
select p.id, 'gratuit' from public.profils p
on conflict (profil_id) do nothing;

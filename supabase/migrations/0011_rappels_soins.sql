-- ============================================================
--  Rappels de soins.
--
--  Trois choses : des périodicités par défaut réglables cheval par
--  cheval, un seuil d'alerte porté à 14 jours, et de quoi alimenter
--  un envoi d'emails planifié sans jamais écrire deux fois le même
--  rappel.
--
--  À exécuter après 0010.
-- ============================================================

-- ------------------------------------------------------------
--  1. Périodicités par défaut
--
--  Ces valeurs sont des usages courants, pas des règles
--  vétérinaires : un cheval au pré et un cheval de concours ne
--  suivent pas le même rythme, d'où le réglage par cheval au
--  paragraphe suivant.
--
--  `veterinaire` et `autre` n'ont pas de périodicité : une visite
--  n'appelle pas mécaniquement la suivante. La date reste
--  saisissable à la main.
-- ------------------------------------------------------------
create or replace function public.intervalle_soin_defaut(p_type text)
returns integer
language sql
immutable
as $$
  select case p_type
    when 'ferrure'    then 49    -- 7 semaines
    when 'vermifuge'  then 120   -- 4 mois
    when 'vaccin'     then 365   -- rappel annuel
    when 'dentiste'   then 365
    when 'osteopathe' then 365
    else null
  end;
$$;

-- ------------------------------------------------------------
--  2. Réglages par cheval
--
--  Le réglage porte sur le cheval, pas sur le compte : il décrit
--  le rythme de soins d'un animal, que tous ses cavaliers
--  partagent. Deux demi-pensionnaires n'ont aucune raison d'avoir
--  chacun leur périodicité de ferrure pour le même cheval.
--
--  C'est l'inverse du choix fait pour les dépenses en 0009, et
--  pour la raison inverse : une dépense est payée par quelqu'un,
--  un rythme de parage appartient au cheval.
--
--  Une ligne absente vaut « périodicité par défaut, rappel
--  actif » : on n'écrit que ce qui s'écarte de la norme.
-- ------------------------------------------------------------
create table if not exists public.rappels_soins (
  cheval_id        uuid not null references public.chevaux (id) on delete cascade,
  type             text not null,
  intervalle_jours integer,
  actif            boolean not null default true,
  maj_le           timestamptz not null default now(),
  primary key (cheval_id, type)
);

do $$
begin
  alter table public.rappels_soins drop constraint if exists rappels_soins_type_valide;
  alter table public.rappels_soins add constraint rappels_soins_type_valide
    check (type in ('ferrure', 'veterinaire', 'vaccin', 'vermifuge',
                    'osteopathe', 'dentiste', 'autre'));

  -- Bornes de bon sens : une périodicité d'un jour ou de vingt ans
  -- ne relève pas du réglage mais de la faute de frappe.
  alter table public.rappels_soins drop constraint if exists rappels_soins_intervalle_valide;
  alter table public.rappels_soins add constraint rappels_soins_intervalle_valide
    check (intervalle_jours is null or (intervalle_jours >= 7 and intervalle_jours <= 1825));
end $$;

alter table public.rappels_soins enable row level security;

-- Mêmes droits que le carnet de santé : premium, et accès au cheval.
-- Régler le rythme de parage est un acte de gestion du cheval, ouvert
-- à ceux qui s'en occupent.
drop policy if exists rappels_soins_select on public.rappels_soins;
create policy rappels_soins_select on public.rappels_soins for select to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists rappels_soins_insert on public.rappels_soins;
create policy rappels_soins_insert on public.rappels_soins for insert to authenticated
  with check (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists rappels_soins_update on public.rappels_soins;
create policy rappels_soins_update on public.rappels_soins for update to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()))
  with check (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists rappels_soins_delete on public.rappels_soins;
create policy rappels_soins_delete on public.rappels_soins for delete to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

-- ------------------------------------------------------------
--  3. Périodicité effective d'un cheval
--
--  Null si le rappel est désactivé, ou si le type n'a pas de
--  périodicité. L'appelant en tire la même conclusion dans les
--  deux cas : rien à proposer comme prochaine échéance.
-- ------------------------------------------------------------
create or replace function public.intervalle_soin(p_cheval uuid, p_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.actif is false then null
    else coalesce(r.intervalle_jours, intervalle_soin_defaut(p_type))
  end
  from (select 1) x
  left join rappels_soins r on r.cheval_id = p_cheval and r.type = p_type;
$$;

-- ------------------------------------------------------------
--  4. Seuil d'alerte à 14 jours, et respect des rappels coupés
--
--  Trois états au lieu de quatre : dépassé, à prévoir sous 14
--  jours, ou rien à signaler. Le palier « ce mois-ci » diluait
--  l'alerte — une échéance à 29 jours n'appelle aucune action, et
--  la voir signalée apprend à ignorer les signalements.
--
--  Un rappel désactivé sort de la vue : un seul interrupteur, un
--  seul effet. Le soin reste évidemment lisible dans le carnet.
-- ------------------------------------------------------------
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
    when s.prochaine_echeance <= current_date + 14 then 'urgent'
    else 'ok'
  end as statut
from public.soins s
join public.chevaux c on c.id = s.cheval_id
where s.prochaine_echeance is not null
  and coalesce(
        (select r.actif from public.rappels_soins r
          where r.cheval_id = s.cheval_id and r.type = s.type),
        true)
  -- seul le soin le plus récent de chaque type porte l'échéance active :
  -- c'est ce qui fait qu'enregistrer un soin recale l'échéance sans rien
  -- avoir à effacer sur le précédent.
  and s.id = (
    select s2.id from public.soins s2
    where s2.cheval_id = s.cheval_id and s2.type = s.type
      and s2.prochaine_echeance is not null
    order by s2.date_realisee desc, s2.cree_le desc
    limit 1
  );

-- ------------------------------------------------------------
--  5. Consentement aux emails
--
--  Par défaut activé, mais désactivable : un rappel non sollicité
--  reste un email non sollicité, et le cavalier doit pouvoir le
--  couper sans quitter le premium.
-- ------------------------------------------------------------
alter table public.profils
  add column if not exists rappels_email boolean not null default true;

-- ------------------------------------------------------------
--  6. Journal des envois
--
--  Sans lui, un cron rejoué — reprise après incident, deux
--  déclenchements le même jour — réexpédie tout. La clé porte
--  l'échéance elle-même : si la date est corrigée, le rappel
--  redevient légitime et repart.
--
--  RLS activé SANS aucune politique : la table n'est lisible et
--  écrivable que par la clé service_role, donc par la seule
--  fonction planifiée. Rien à exposer au navigateur.
-- ------------------------------------------------------------
create table if not exists public.rappels_envoyes (
  soin_id         uuid not null references public.soins (id) on delete cascade,
  destinataire_id uuid not null references public.profils (id) on delete cascade,
  jalon           integer not null check (jalon in (14, 7, 0)),
  echeance        date not null,
  envoye_le       timestamptz not null default now(),
  primary key (soin_id, destinataire_id, jalon, echeance)
);

alter table public.rappels_envoyes enable row level security;

-- ------------------------------------------------------------
--  7. Ce que la fonction planifiée doit envoyer aujourd'hui
--
--  Toute la logique d'éligibilité est ici plutôt que dans la Edge
--  Function : elle a besoin du RLS contourné, des emails de
--  `auth.users`, et d'une jointure sur les abonnements. La
--  fonction TypeScript n'a plus qu'à grouper par destinataire et
--  poster.
--
--  Le premium est vérifié ici aussi : le rappel est une
--  fonctionnalité payante, et un abonnement expiré ne doit pas
--  continuer à produire des emails.
-- ------------------------------------------------------------
create or replace function public.rappels_du_jour()
returns table (
  destinataire_id uuid,
  email           text,
  nom             text,
  soin_id         uuid,
  cheval_nom      text,
  type            text,
  echeance        date,
  jalon           integer
)
language sql
stable
security definer
set search_path = public
as $$
  with echeances as (
    select
      s.id as soin_id,
      s.cheval_id,
      c.nom as cheval_nom,
      c.club_id,
      s.type,
      s.prochaine_echeance,
      (s.prochaine_echeance - current_date)::int as jalon
    from soins s
    join chevaux c on c.id = s.cheval_id
    where s.prochaine_echeance is not null
      and (s.prochaine_echeance - current_date) in (14, 7, 0)
      and coalesce(
            (select r.actif from rappels_soins r
              where r.cheval_id = s.cheval_id and r.type = s.type),
            true)
      and s.id = (
        select s2.id from soins s2
        where s2.cheval_id = s.cheval_id and s2.type = s.type
          and s2.prochaine_echeance is not null
        order by s2.date_realisee desc, s2.cree_le desc
        limit 1
      )
  ),
  -- Tous ceux qui s'occupent du cheval sont prévenus : le cavalier
  -- qui monte comme le club qui héberge. UNION dédoublonne le cas
  -- où le club est aussi rattaché comme cavalier.
  destinataires as (
    select e.soin_id, e.cheval_nom, e.type, e.prochaine_echeance, e.jalon,
           cc.cavalier_id as profil_id
    from echeances e
    join cheval_cavaliers cc on cc.cheval_id = e.cheval_id
    union
    select e.soin_id, e.cheval_nom, e.type, e.prochaine_echeance, e.jalon,
           e.club_id
    from echeances e
    where e.club_id is not null
  )
  select
    d.profil_id,
    u.email::text,
    p.nom,
    d.soin_id,
    d.cheval_nom,
    d.type,
    d.prochaine_echeance,
    d.jalon
  from destinataires d
  join profils p on p.id = d.profil_id
  join auth.users u on u.id = d.profil_id
  join abonnements a on a.profil_id = d.profil_id
  where p.rappels_email
    and u.email is not null
    and a.statut in ('actif', 'essai', 'annule')
    and (a.expire_le is null or a.expire_le > now())
    and not exists (
      select 1 from rappels_envoyes re
      where re.soin_id = d.soin_id
        and re.destinataire_id = d.profil_id
        and re.jalon = d.jalon
        and re.echeance = d.prochaine_echeance
    )
  order by d.profil_id, d.prochaine_echeance, d.cheval_nom;
$$;

-- La fonction lit les emails de tous les comptes : elle ne doit être
-- appelable que par la clé service_role, jamais depuis le navigateur.
revoke all on function public.rappels_du_jour() from public, anon, authenticated;

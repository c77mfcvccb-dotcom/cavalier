-- ============================================================
--  Les événements RevenueCat n'arrivent pas dans l'ordre.
--
--  Le webhook écrasait la ligne d'abonnement à chaque événement,
--  sans regarder si celui-ci était plus récent que le précédent.
--  Or RevenueCat réessaie un envoi échoué pendant des heures : un
--  EXPIRATION rejoué peut arriver APRÈS le RENEWAL qui l'a rendu
--  caduc. Le compte repassait alors en gratuit alors qu'il venait
--  d'être renouvelé — et rien ne le rattrapait jusqu'à l'événement
--  suivant, soit un mois plus tard.
--
--  La correction est posée dans la base plutôt que dans la
--  fonction Edge : c'est la table qui doit refuser un retour en
--  arrière, quel que soit le chemin d'écriture. Un webhook
--  redéployé de travers, un correctif manuel, un futur script de
--  reprise : tous passent par ce trigger.
--
--  À exécuter après 0007.
-- ============================================================

-- ------------------------------------------------------------
--  1. Horodatage de l'événement qui a produit la ligne
--
--  C'est `event_timestamp_ms` du corps RevenueCat — l'instant où
--  l'événement a été PRODUIT, et non celui où il nous parvient.
--  `maj_le` ne peut pas servir : il enregistre la réception, donc
--  précisément la valeur faussée par un rejeu tardif.
--
--  Null sur les lignes existantes, et c'est voulu : on ne sait
--  rien de leur ancienneté, et refuser la prochaine écriture par
--  précaution reviendrait à figer des abonnements bien réels.
-- ------------------------------------------------------------
alter table public.abonnements
  add column if not exists dernier_evenement_le timestamptz;

comment on column public.abonnements.dernier_evenement_le is
  'event_timestamp_ms de l''événement RevenueCat ayant produit cette ligne. '
  'Sert à écarter les événements rejoués dans le désordre.';

-- ------------------------------------------------------------
--  2. Un événement plus ancien ne défait pas un plus récent
--
--  RETURN OLD annule l'écriture sans lever d'erreur : le webhook
--  répond 200, et RevenueCat cesse de réessayer un événement qui
--  n'a effectivement plus rien à apporter. Lever une exception
--  aurait produit l'inverse — un 500, puis des réessais sans fin
--  d'un message périmé.
--
--  Les deux garde-fous à null comptent autant que la comparaison :
--    - ancien null  : première écriture depuis cette migration,
--                     ou ligne héritée. On accepte, sinon la ligne
--                     resterait bloquée à jamais.
--    - nouveau null : écriture qui ne porte pas d'horodatage (SQL
--                     manuel). On la laisse passer, mais on
--                     conserve la date connue plutôt que de
--                     l'effacer — sans quoi la protection se
--                     désarmerait toute seule.
--
--  L'égalité stricte est tolérée : c'est le même événement livré
--  deux fois, et le réappliquer est sans effet.
-- ------------------------------------------------------------
create or replace function public.ignorer_evenement_perime()
returns trigger
language plpgsql
as $$
begin
  if new.dernier_evenement_le is null then
    new.dernier_evenement_le := old.dernier_evenement_le;
    return new;
  end if;

  if old.dernier_evenement_le is not null
     and new.dernier_evenement_le < old.dernier_evenement_le then
    raise log 'Abonnement % : événement du % ignoré, la ligne date du %',
      old.profil_id, new.dernier_evenement_le, old.dernier_evenement_le;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists abonnements_ordre_evenements on public.abonnements;
create trigger abonnements_ordre_evenements
  before update on public.abonnements
  for each row
  execute function public.ignorer_evenement_perime();

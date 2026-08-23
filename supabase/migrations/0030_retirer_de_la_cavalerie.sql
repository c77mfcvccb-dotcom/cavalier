-- ============================================================
--  0030 — Le club peut retirer un cheval de sa cavalerie
--
--  La 0029 a rendu la suppression de la fiche (chevaux_delete)
--  exclusive à la propriétaire désignée — voulu : elle seule doit
--  pouvoir effacer l'historique (soins, documents) de son cheval.
--  Mais le club doit garder un moyen de sortir un cheval de SA
--  cavalerie quand une propriétaire est désignée — le cheval quitte
--  l'écurie, sans que quiconque efface ses données.
--
--  retirer_de_la_cavalerie() fait exactement ce que fait déjà
--  retirer_du_club() (0029) — détacher club_id — mais dans l'autre
--  sens : appelée par le CLUB lui-même, pas par la propriétaire.
--  Comme detacher_de_ecurie (0018) et retirer_du_club, elle « ne
--  sait QUE détacher » : minimum de pouvoir pour le geste précis.
--
--  Garde-fou : refuse si aucune propriétaire n'est désignée — sans
--  cela, retirer un cheval de club sans propriétaire orphelinerait
--  la fiche (plus personne n'y aurait accès, ni le club qui vient
--  de partir, ni qui que ce soit d'autre). Dans ce cas, c'est la
--  suppression de la fiche qu'il faut utiliser (chevaux_delete),
--  déjà ouverte au club tant qu'aucune propriétaire n'existe.
--
--  À exécuter dans le SQL Editor de Supabase, après 0029.
-- ============================================================

create or replace function public.retirer_de_la_cavalerie(p_cheval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from chevaux where id = p_cheval and club_id = auth.uid()
  ) then
    raise exception 'Seul le club gérant ce cheval peut le retirer de sa cavalerie';
  end if;

  if not exists (
    select 1 from cheval_cavaliers where cheval_id = p_cheval and role = 'proprietaire'
  ) then
    raise exception 'CHEVAL_SANS_PROPRIETAIRE'
      using hint = 'Désignez une propriétaire avant de retirer ce cheval de la cavalerie, sinon plus personne n''y aura accès. Sans propriétaire, supprimez plutôt la fiche.';
  end if;

  update chevaux set club_id = null where id = p_cheval;
end;
$$;

-- ------------------------------------------------------------
--  Contrôle après exécution (connecté en club, sur un cheval de
--  la cavalerie SANS propriétaire désignée) :
--
--    select retirer_de_la_cavalerie('<cheval>');
--      -- CHEVAL_SANS_PROPRIETAIRE
--
--  Une fois une propriétaire désignée (designer_proprietaire) :
--
--    select retirer_de_la_cavalerie('<cheval>');
--      -- club_id devient null ; connecté comme la propriétaire,
--      -- la fiche et son historique restent intacts et visibles
-- ------------------------------------------------------------

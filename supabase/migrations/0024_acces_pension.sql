-- ============================================================
--  0024 — L'écurie a accès aux chevaux qu'elle héberge
--
--  La 0020 a rendu la FICHE d'un cheval en pension visible de son
--  écurie, et la 0021 a fait de la pension confirmée le périmètre
--  de l'accès offert. Mais `a_acces_cheval()` — la porte de tout
--  le reste : soins, carnet, créneaux, séances, documents,
--  réglages de rappels — ne connaissait que deux entrées : être
--  lié au cheval, ou être son club (`club_id`). Résultat
--  incohérent : l'écurie voyait la fiche du cheval en pension,
--  mais PAS son carnet de santé — elle ne pouvait ni lire ni
--  écrire un soin, et l'accueil ne pouvait pas lui rappeler le
--  vermifuge d'un cheval dont elle s'occupe tous les jours.
--
--  La fonction gagne donc une troisième entrée : l'écurie d'une
--  pension CONFIRMÉE a accès au cheval. Une demande de pension en
--  attente n'ouvre rien — comme pour l'accès offert (0021), c'est
--  la confirmation qui fait foi.
--
--  Ce qui ne change PAS : `est_gestionnaire_cheval()`. L'écurie
--  n'est pas gestionnaire d'un cheval qui ne lui appartient pas —
--  modifier la fiche, supprimer le cheval, générer le lien public,
--  inviter des cavaliers, poser une indisponibilité et lire les
--  coûts des soins d'autrui restent au propriétaire.
-- ============================================================

create or replace function public.a_acces_cheval(p_cheval uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from cheval_cavaliers cc
           where cc.cheval_id = p_cheval and cc.cavalier_id = p_user
         )
      or exists (
           select 1 from chevaux c
           where c.id = p_cheval
             and (
               c.club_id = p_user
               or (c.ecurie_id = p_user and c.pension_confirmee)
             )
         );
$$;

-- ------------------------------------------------------------
--  Toutes les politiques qui appellent a_acces_cheval() héritent
--  du changement sans être reposées : soins (et la vue v_soins),
--  créneaux, séances, documents, rappels, indisponibilités en
--  lecture. Les dépenses restent cloisonnées par profil_id —
--  l'écurie ne voit que les siennes, comme tout le monde.
--
--  Contrôle après exécution, connecté en club, sur un cheval en
--  pension confirmée chez vous :
--
--    select count(*) from v_soins where cheval_id = '<cheval>';
--      -- son carnet, enfin visible (coûts d'autrui masqués)
--
--    insert into soins (cheval_id, type, date_realisee, cree_par)
--    values ('<cheval>', 'vermifuge', current_date, auth.uid());
--      -- accepté — c'est le geste « Fait » de l'accueil
--
--    -- Sur une pension NON confirmée : les deux échouent.
-- ------------------------------------------------------------

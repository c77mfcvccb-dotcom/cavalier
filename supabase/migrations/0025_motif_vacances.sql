-- ============================================================
--  0025 — « Vacances » comme motif d'indisponibilité
--
--  Sur le tableau physique de l'écurie, un cheval qui part en
--  vacances (ou dont le club ferme quelques semaines) est marqué
--  à part de la case « Repos » du quotidien — c'est un bloc de
--  plusieurs jours qu'on annonce à l'avance, pas une gêne du jour.
--  L'app ne distinguait que boiterie / repos / ostéo / vétérinaire /
--  autre : « vacances » rejoint la liste des motifs autorisés.
-- ============================================================

alter table public.indisponibilites
  drop constraint indisponibilites_motif_check;

alter table public.indisponibilites
  add constraint indisponibilites_motif_check
  check (motif in ('boiterie', 'repos', 'osteo', 'veterinaire', 'vacances', 'autre'));

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    insert into indisponibilites (cheval_id, motif, debut, fin, cree_par)
--    values ('<cheval>', 'vacances', current_date, current_date + 13, auth.uid());
--      -- accepté
--
--    insert into indisponibilites (cheval_id, motif, debut, cree_par)
--    values ('<cheval>', 'ferie', current_date, auth.uid());
--      -- rejeté (motif hors liste)
-- ------------------------------------------------------------

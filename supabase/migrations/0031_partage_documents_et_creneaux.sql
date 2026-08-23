-- ============================================================
--  0031 — Le même choix privé/partagé pour documents et créneaux
--
--  La 0028 posait « prive » sur les soins ; ce n'est qu'une des
--  entrées que la propriétaire peut vouloir garder pour elle. Même
--  colonne, même règle, étendue à documents et creneaux : masqué de
--  tout le monde sauf son auteur (documents.ajoute_par) ou son
--  cavalier (creneaux.cavalier_id) une fois marqué privé.
--
--  Sans risque pour l'accès obligatoire du club aux cours : les
--  cours attribués par le club vivent dans `cours`/`inscriptions_cours`
--  (0017+), une tout autre table, jamais consultée ici — un créneau
--  privé n'y touche pas. Idem pour le carnet de santé : `soins` (0028)
--  n'est pas concerné par cette migration.
--
--  À exécuter dans le SQL Editor de Supabase, après 0030.
-- ============================================================

-- ------------------------------------------------------------
--  1. Documents
-- ------------------------------------------------------------
alter table public.documents add column if not exists prive boolean not null default false;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    a_acces_cheval(cheval_id, auth.uid())
    and (not prive or ajoute_par = auth.uid())
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (
    a_acces_cheval(cheval_id, auth.uid())
    and (not prive or ajoute_par = auth.uid())
  );

-- Le fichier lui-même, dans le bucket privé : sans ce garde-fou, la ligne
-- `documents` masquerait le document dans la liste, mais son chemin
-- resterait lisible par quiconque a accès au cheval (URL signée devinée
-- ou redemandée). La politique de stockage rejoue donc la même règle en
-- rejoignant la table sur le chemin.
drop policy if exists documents_stockage_lecture on storage.objects;
create policy documents_stockage_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
    and not exists (
      select 1 from public.documents d
      where d.chemin = name and d.prive and d.ajoute_par is distinct from auth.uid()
    )
  );

drop policy if exists documents_stockage_suppression on storage.objects;
create policy documents_stockage_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
    and not exists (
      select 1 from public.documents d
      where d.chemin = name and d.prive and d.ajoute_par is distinct from auth.uid()
    )
  );

-- ------------------------------------------------------------
--  2. Créneaux
-- ------------------------------------------------------------
alter table public.creneaux add column if not exists prive boolean not null default false;

drop policy if exists creneaux_select on public.creneaux;
create policy creneaux_select on public.creneaux for select to authenticated
  using (
    a_acces_cheval(cheval_id, auth.uid())
    and (not prive or cavalier_id = auth.uid())
  );

drop policy if exists creneaux_update on public.creneaux;
create policy creneaux_update on public.creneaux for update to authenticated
  using (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (not prive or cavalier_id = auth.uid())
  )
  with check (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (premium_cheval(cheval_id, auth.uid()) or debut < fin_semaine_courante())
  );

drop policy if exists creneaux_delete on public.creneaux;
create policy creneaux_delete on public.creneaux for delete to authenticated
  using (
    (cavalier_id = auth.uid() or est_gestionnaire_cheval(cheval_id, auth.uid()))
    and (not prive or cavalier_id = auth.uid())
  );

-- ------------------------------------------------------------
--  Contrôle après exécution (connecté comme la propriétaire, sur
--  un cheval de club) :
--
--    insert into documents (cheval_id, categorie, nom, chemin, ajoute_par, prive)
--    values ('<cheval>', 'autre', 'Note perso', '<cheval>/x.pdf', auth.uid(), true);
--    insert into creneaux (cheval_id, cavalier_id, debut, fin, prive)
--    values ('<cheval>', auth.uid(), now(), now() + interval '1 hour', true);
--
--    -- reconnecté en club :
--    select count(*) from documents where cheval_id = '<cheval>' and nom = 'Note perso';
--    select count(*) from creneaux where cheval_id = '<cheval>';
--      -- ni l'un ni l'autre n'apparaît
-- ------------------------------------------------------------

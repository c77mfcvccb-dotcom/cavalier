-- ============================================================
--  Documents : quotas par cheval, 5 Mo par fichier, et accès
--  ouvert au plan gratuit.
--
--  La 0015 réservait le module au premium. Il devient freemium :
--  10 documents par cheval en gratuit, 50 en premium. C'est le
--  même mouvement que les chevaux (0005/0006) — une limite basse
--  qui laisse essayer, une limite haute qui laisse vivre.
--
--  Le quota se compte PAR CHEVAL, pas par compte : c'est le
--  carnet du cheval qui se remplit. La limite applicable, elle,
--  dépend du plan de celui qui ajoute — sur un cheval partagé
--  entre une gratuite et une premium, la première bute à 10, la
--  seconde peut aller à 50.
--
--  À exécuter après 0015.
-- ============================================================

-- ------------------------------------------------------------
--  1. Le bucket : 5 Mo par fichier, et le WebP accepté
--
--  15 Mo laissait passer des scans bruts que l'application
--  compresse désormais côté client (1200 px, JPEG qualité 80) :
--  au-delà de 5 Mo après compression, c'est un fichier anormal.
--  La borne du bucket est le verrou serveur — celle de
--  l'interface n'est qu'un message plus aimable.
-- ------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'image/heic', 'image/heif'
    ]
where id = 'documents';

-- ------------------------------------------------------------
--  2. RLS : l'exigence premium disparaît, l'accès au cheval reste
-- ------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    a_acces_cheval(cheval_id, auth.uid())
    and ajoute_par = auth.uid()
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists documents_stockage_lecture on storage.objects;
create policy documents_stockage_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists documents_stockage_envoi on storage.objects;
create policy documents_stockage_envoi on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists documents_stockage_suppression on storage.objects;
create policy documents_stockage_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ------------------------------------------------------------
--  3. Le quota : un trigger, pas une politique
--
--  Même raison qu'en 0006 : un trigger BEFORE INSERT s'applique à
--  tous les chemins d'écriture, et son message d'erreur est un
--  code que l'application sait traduire.
--
--  `premium_actif()` plutôt que `est_premium()` : la seconde
--  refuse de renseigner sur autrui, or le trigger doit juger le
--  plan de celui qui ajoute — qui est bien auth.uid() ici, la
--  politique d'insertion l'impose, mais la fonction s'exécute en
--  security definer où auth.uid() reste fiable de toute façon.
-- ------------------------------------------------------------
create or replace function public.verifier_quota_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer := case when premium_actif(new.ajoute_par) then 50 else 10 end;
  v_nb integer;
begin
  select count(*) into v_nb from documents where cheval_id = new.cheval_id;
  if v_nb >= v_limite then
    raise exception 'QUOTA_DOCUMENTS'
      using hint = format('Limite de %s documents atteinte pour ce cheval.', v_limite);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quota_documents on public.documents;
create trigger trg_quota_documents
  before insert on public.documents
  for each row execute function public.verifier_quota_documents();

-- ------------------------------------------------------------
--  Note sur la suppression des fichiers
--
--  Supprimer un cheval efface ses lignes `documents` en cascade,
--  mais PAS les fichiers du bucket : seule l'API Storage détruit
--  réellement un fichier, et Postgres ne peut pas l'appeler.
--  L'application purge donc le dossier du cheval AVANT de le
--  supprimer (src/pages/onglets/OngletFiche.jsx), et le script
--  `scripts/nettoyer-documents.mjs` rattrape ce qui aurait pu
--  passer entre les mailles (suppression SQL directe, panne
--  réseau au mauvais moment).
--
--  Contrôle des orphelins — fichiers sans ligne :
--
--    select o.name from storage.objects o
--    left join public.documents d on d.chemin = o.name
--    where o.bucket_id = 'documents' and d.id is null;
-- ------------------------------------------------------------

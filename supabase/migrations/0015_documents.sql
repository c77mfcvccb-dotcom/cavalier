-- ============================================================
--  Documents du cheval : papiers d'identification, contrat de
--  demi-pension, attestation d'assurance — stockés une fois,
--  visibles par tous les cavaliers liés au cheval.
--
--  Fonctionnalité premium, sur le même modèle que le carnet de
--  soins (migration 0005) : la politique RLS conditionne l'accès,
--  pas l'interface. Un compte qui repasse en gratuit cesse de
--  voir ses documents sans qu'aucun code front n'ait à s'en
--  soucier — et retrouve tout dès qu'il se réabonne, puisque rien
--  n'est supprimé.
--
--  À exécuter après 0014.
-- ============================================================

-- ------------------------------------------------------------
--  1. Table de métadonnées
--
--  Le fichier lui-même vit dans le bucket `documents` ; cette
--  table porte ce qu'on affiche sans le télécharger, et ce sur
--  quoi le RLS de stockage s'appuie indirectement (le chemin
--  encode le cheval, voir plus bas).
-- ------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  cheval_id     uuid not null references public.chevaux (id) on delete cascade,
  categorie     text not null default 'autre'
                check (categorie in ('identification', 'contrat_dp', 'assurance', 'autre')),
  nom           text not null,
  chemin        text not null unique,
  taille_octets integer,
  type_mime     text,
  ajoute_par    uuid references public.profils (id) on delete set null,
  cree_le       timestamptz not null default now()
);

create index if not exists idx_documents_cheval on public.documents (cheval_id, cree_le desc);

alter table public.documents enable row level security;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    est_premium(auth.uid())
    and a_acces_cheval(cheval_id, auth.uid())
    -- Sans ce filet, l'auteur enregistré pourrait être n'importe qui : la
    -- même faille que soins_insert avait avant d'être corrigée (0013).
    and ajoute_par = auth.uid()
  );

-- Pas de politique update : un document ne se corrige pas, il se remplace
-- (suppression puis nouvel envoi). Ça évite qu'un fichier et sa ligne de
-- métadonnées divergent silencieusement.
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()));

-- ------------------------------------------------------------
--  2. Stockage des fichiers
--
--  Bucket PRIVÉ, à la différence de `photos` : une carte
--  d'immatriculation ou une attestation d'assurance n'a pas
--  vocation à être accessible par une URL publique devinable.
--  Le téléchargement passe donc par une URL signée, dont
--  l'émission est elle-même soumise au RLS ci-dessous.
--
--  Convention de chemin : `{cheval_id}/{uuid}-{nom original}`.
--  Le premier segment du chemin porte le cheval, ce qui permet à
--  la politique de retrouver a_acces_cheval() sans table de
--  jointure — storage.objects ne connaît que le chemin.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false,
  15728640, -- 15 Mo : un PDF scanné dépasse vite le mégaoctet
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

drop policy if exists documents_stockage_lecture on storage.objects;
create policy documents_stockage_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and est_premium(auth.uid())
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists documents_stockage_envoi on storage.objects;
create policy documents_stockage_envoi on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and est_premium(auth.uid())
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists documents_stockage_suppression on storage.objects;
create policy documents_stockage_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and est_premium(auth.uid())
    and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ------------------------------------------------------------
--  Contrôle
--
--    select tablename from pg_tables where tablename = 'documents';
--    select id, public, file_size_limit from storage.buckets where id = 'documents';
-- ------------------------------------------------------------

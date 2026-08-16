-- ============================================================
--  Agenda partagé : diffusion des changements en temps réel
--
--  Deux cavalières d'une même demi-pension posent souvent leurs
--  créneaux ensemble, chacune sur son téléphone. Sans cette
--  publication, la seconde ne voit ce que la première vient
--  d'écrire qu'en rechargeant l'écran.
--
--  Supabase Realtime ne diffuse que les tables inscrites dans la
--  publication `supabase_realtime`. Le RLS continue de
--  s'appliquer : chacun ne reçoit que les lignes qu'il aurait pu
--  lire de toute façon.
--
--  À exécuter après 0013.
-- ============================================================

-- ------------------------------------------------------------
--  1. REPLICA IDENTITY FULL, avant l'inscription
--
--  Par défaut, un DELETE ne transporte que la clé primaire. Deux
--  conséquences fâcheuses ici : le serveur ne peut pas évaluer le
--  RLS sur une ligne qu'il ne connaît plus — il diffuse donc
--  l'identifiant à tout le monde — et il ne peut pas non plus
--  filtrer par cheval.
--
--  `full` fait voyager l'ancienne ligne entière : la suppression
--  d'un créneau parvient à ceux qui y avaient accès, et à eux
--  seuls. Le surcoût en journal de transactions est celui de
--  quelques lignes par jour.
-- ------------------------------------------------------------
alter table public.creneaux replica identity full;
alter table public.soins    replica identity full;

-- ------------------------------------------------------------
--  2. Inscription à la publication
--
--  `create publication` échouerait si elle existe déjà, et
--  `add table` si la table y figure : les deux sont donc
--  conditionnés, pour que la migration se rejoue sans erreur.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  v_table text;
begin
  -- `soins` accompagne `creneaux` : les échéances de soins
  -- s'affichent dans le même calendrier, et une vue à moitié
  -- vivante serait plus déroutante qu'une vue figée.
  foreach v_table in array array['creneaux', 'soins'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
--  Contrôle
--
--    select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public';
--
--  Doit renvoyer au moins `creneaux` et `soins`.
-- ------------------------------------------------------------

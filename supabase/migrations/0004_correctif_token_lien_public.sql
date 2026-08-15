-- ============================================================
--  Correctif : « function gen_random_bytes(integer) does not exist »
--  au clic sur « Créer un lien public ».
--
--  Cause : sur Supabase, pgcrypto est installé dans le schéma
--  « extensions », pas dans « public ». La fonction creer_lien_public
--  est en security definer avec search_path = public : elle ne voit
--  donc pas gen_random_bytes.
--
--  Correctif : ne plus dépendre de pgcrypto du tout. gen_random_uuid()
--  appartient au cœur de PostgreSQL depuis la version 13 et se résout
--  via pg_catalog quel que soit le search_path. Le jeton garde
--  exactement le même format (32 caractères hexadécimaux), donc les
--  liens déjà distribués restent valides et le front n'a pas à bouger.
--
--  Entropie : 122 bits (UUID v4, tiré de pg_strong_random) contre 128
--  auparavant. Sans conséquence pratique : les deux sont hors de portée
--  d'une attaque par énumération.
--
--  À exécuter dans le SQL Editor de Supabase, après 0003.
-- ============================================================

create or replace function public.creer_lien_public(p_cheval uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not est_gestionnaire_cheval(p_cheval, auth.uid()) then
    raise exception 'Seul le propriétaire ou le club peut partager cette fiche';
  end if;

  -- Un seul lien actif à la fois : régénérer révoque le précédent.
  update partages_publics
     set actif = false, revoque_le = now()
   where cheval_id = p_cheval and actif;

  -- gen_random_uuid() est une fonction du cœur (pg_catalog) : contrairement
  -- à gen_random_bytes de pgcrypto, elle ne dépend pas du schéma
  -- d'installation des extensions.
  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into partages_publics (cheval_id, token, cree_par)
  values (p_cheval, v_token, auth.uid());

  return v_token;
end;
$$;

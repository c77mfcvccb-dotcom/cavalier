-- ============================================================
--  0027 — Le cavalier peut proposer son propre cheval à l'inscription
--
--  Jusqu'ici, l'inscription à un cours se faisait « mains vides » :
--  jamais de cheval, jamais de présence — l'attribution restait
--  entièrement au club (policy ic_insert de la 0017, commentaire
--  « ni cheval... l'attribution est au club »). Mais un cavalier qui a
--  SON cheval — propriétaire ou pension à l'écurie, quelle qu'en soit
--  la formule — sait déjà avec lequel il vient : lui laisser le
--  déclarer évite un aller-retour, et le club garde la main pour les
--  cavaliers sans cheval à eux, ou ceux en 'cavalier_club' (rôle sans
--  claim dédiée, où c'est justement au club de décider lequel).
--
--  Rien ne change côté club : il continue d'attribuer ou de corriger
--  n'importe quel cheval, à tout moment (policy ic_update, inchangée).
-- ============================================================

-- ------------------------------------------------------------
--  1. L'insertion accepte désormais un cheval, si c'est le sien
--
--  « Le sien » : une liaison cheval_cavaliers à son nom, dans un
--  rôle qui dit une vraie affectation (propriétaire, demi-pension,
--  tiers de pension, pension complète) — pas 'cavalier_club', qui ne
--  distingue aucun cheval en particulier et laisse donc le choix au
--  club, comme avant.
--
--  L'appartenance du cheval à CE club (ou sa pension confirmée chez
--  lui) n'est pas revérifiée ici : c'est le rôle du trigger
--  verifier_cheval_cours ci-dessous, qui s'applique déjà à toute
--  écriture de cheval_id, quelle que soit sa provenance — RLS répond
--  à « est-ce vraiment son cheval », le trigger à « ce cheval a-t-il
--  sa place à CE cours ».
-- ------------------------------------------------------------
drop policy if exists ic_insert on public.inscriptions_cours;
create policy ic_insert on public.inscriptions_cours for insert to authenticated
  with check (exists (
    select 1 from cours c where c.id = cours_id
      and (
        c.club_id = auth.uid()
        or (
          cavalier_id = auth.uid()
          and present is null
          and est_cavalier_du_club(c.club_id, auth.uid())
          and (
            cheval_id is null
            or exists (
              select 1 from cheval_cavaliers cc
              where cc.cheval_id = inscriptions_cours.cheval_id
                and cc.cavalier_id = auth.uid()
                and cc.role in ('proprietaire', 'demi_pension', 'tiers_pension', 'pension_complete')
            )
          )
        )
      )
  ));

-- ------------------------------------------------------------
--  2. Le trigger d'appartenance accepte aussi un cheval en pension
--     confirmée chez le club du cours
--
--  Un cheval de club (club_id posé) passait déjà. Un cheval de
--  particulier en pension CONFIRMÉE chez ce club (ecurie_id, 0021)
--  est physiquement à l'écurie : il peut tout aussi bien monter sur
--  un cours qui s'y donne. Une pension non confirmée, ou chez une
--  autre écurie, continue d'échouer — CHEVAL_HORS_CLUB.
-- ------------------------------------------------------------
create or replace function public.verifier_cheval_cours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cours cours%rowtype;
begin
  if new.cheval_id is null then
    return new;
  end if;

  select * into v_cours from cours where id = new.cours_id;

  if not exists (
    select 1 from chevaux
    where id = new.cheval_id
      and (
        club_id = v_cours.club_id
        or (ecurie_id = v_cours.club_id and pension_confirmee)
      )
  ) then
    raise exception 'CHEVAL_HORS_CLUB'
      using hint = 'Ce cheval n''appartient pas à la cavalerie du club.';
  end if;

  if exists (
    select 1 from indisponibilites
    where cheval_id = new.cheval_id
      and debut <= v_cours.debut::date
      and (fin is null or fin >= v_cours.debut::date)
  ) then
    raise exception 'CHEVAL_INDISPONIBLE'
      using hint = 'Ce cheval est indisponible à la date du cours.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
--  Contrôle après exécution :
--
--    -- connecté en cavalier, propriétaire ou en pension d'un cheval
--    -- de CE club, sur un cours de ce club :
--    insert into inscriptions_cours (cours_id, cavalier_id, cheval_id)
--    values ('<cours>', auth.uid(), '<mon_cheval>');
--      -- passe
--
--    -- même cavalier, cheval d'un autre club ou pension non confirmée :
--    insert into inscriptions_cours (cours_id, cavalier_id, cheval_id)
--    values ('<cours>', auth.uid(), '<cheval_etranger>');
--      -- CHEVAL_HORS_CLUB
--
--    -- même cavalier, cheval de club sur lequel il n'est que
--    -- 'cavalier_club' (pas de claim dédiée) :
--    insert into inscriptions_cours (cours_id, cavalier_id, cheval_id)
--    values ('<cours>', auth.uid(), '<cheval_de_club_pas_le_sien>');
--      -- rejeté par la policy RLS (new row violates row-level security)
--
--    -- sans cheval, comme avant :
--    insert into inscriptions_cours (cours_id, cavalier_id) values ('<cours>', auth.uid());
--      -- passe, cheval_id reste nul, le club attribue plus tard
-- ------------------------------------------------------------

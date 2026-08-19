/**
 * Le modèle club, côté interface — miroir de la migration 0018.
 *
 * Comme lib/abonnement.js : tout ceci n'est qu'une anticipation des règles
 * appliquées par le serveur. La fonction qui fait foi est premium_cheval()
 * en SQL ; celles-ci évitent seulement d'afficher un écran fermé ou une
 * erreur brute.
 */

/**
 * L'adhésion qui couvre ce cheval, ou null.
 *
 * Couvrir = avoir un siège dans une écurie dont l'abonnement est actif, et
 * que le cheval soit dans son périmètre : propriété du club (`club_id`) ou
 * pension chez lui (`ecurie_id`). Rien n'est jamais stocké : la réponse
 * découle des adhésions chargées, comme la fonction SQL relit les tables.
 */
export function couvertureClub(cheval, adhesions) {
  if (!cheval) return null
  return (
    (adhesions || []).find(
      (a) =>
        a.siege &&
        a.club_premium &&
        (cheval.club_id === a.club_id ||
          // Une pension ne compte qu'ACCEPTÉE par l'écurie (0021) : la
          // demande seule n'ouvre rien.
          (cheval.ecurie_id === a.club_id && cheval.pension_confirmee))
    ) || null
  )
}

/**
 * Le premium contextuel : l'abonnement personnel ouvre tout, la couverture
 * club n'ouvre que son périmètre. L'accès le plus favorable gagne.
 */
export function premiumPourCheval(cheval, { estPremium, adhesions }) {
  return Boolean(estPremium || couvertureClub(cheval, adhesions))
}

/** Au moins une écurie offre l'accès à ce cavalier (siège + club abonné). */
export function accesOffert(adhesions) {
  return (adhesions || []).some((a) => a.siege && a.club_premium)
}

/** Les erreurs de la 0018, traduites. */
export function traduireErreurClub(message) {
  if (message?.includes('PENSION_A_CONFIRMER'))
    return "Seule l'écurie peut accepter une pension — la demande lui a été transmise."
  if (message?.includes('ECURIE_NON_MEMBRE'))
    return "Adhérez d'abord à cette écurie avec son code, dans « Mon club »."
  if (message?.includes('ECURIE_INVALIDE')) return "Ce compte n'est pas une écurie."
  if (message?.includes('ADHESION_INVALIDE')) return "Cette adhésion n'est pas possible."
  return message?.replace(/^.*?:\s*/, '') || 'Une erreur est survenue.'
}

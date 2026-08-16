/**
 * Récupération de mot de passe : mémoire du fait qu'un lien de
 * réinitialisation vient d'être ouvert.
 *
 * Le lien reçu par mail ouvre une session ordinaire. Sans cette mémoire,
 * l'application se contente de constater « une session est ouverte » et
 * affiche l'accueil : l'écran de saisie du nouveau mot de passe n'est jamais
 * atteint, alors même que c'est la seule raison du clic.
 *
 * Deux détections plutôt qu'une, parce que ni l'une ni l'autre ne suffit :
 *
 * - `type=recovery` dans l'URL est lu **à l'import**, avant que le client
 *   Supabase ne soit créé. Le SDK efface le fragment dès qu'il a consommé le
 *   jeton, souvent avant que React n'ait monté le moindre composant : lire
 *   l'URL depuis un `useEffect` arrive trop tard, et par intermittence.
 * - L'événement `PASSWORD_RECOVERY` (voir `AuthContexte`) couvre le cas
 *   inverse, où le jeton n'est pas dans le fragment.
 *
 * Le drapeau vit dans `sessionStorage` : il survit à un rechargement de la
 * page — le SDK en provoque un en nettoyant l'URL — mais meurt avec l'onglet,
 * de sorte qu'aucun état ne s'installe durablement.
 */

const CLE = 'licol.recuperation-mot-de-passe'

/** Repli si sessionStorage est indisponible (navigation privée verrouillée). */
let enMemoire = false

function lire() {
  try {
    return sessionStorage.getItem(CLE) === '1'
  } catch {
    return enMemoire
  }
}

export function ouvrirRecuperation() {
  enMemoire = true
  try {
    sessionStorage.setItem(CLE, '1')
  } catch {
    /* le repli en mémoire suffit le temps de la navigation */
  }
}

export function cloreRecuperation() {
  enMemoire = false
  try {
    sessionStorage.removeItem(CLE)
  } catch {
    /* idem */
  }
}

export function recuperationEnCours() {
  return lire()
}

/** `type=recovery` arrive en fragment (flot implicite) ou en requête (PKCE). */
function urlDeRecuperation() {
  const fragment = new URLSearchParams(
    window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  )
  const requete = new URLSearchParams(window.location.search)
  return (fragment.get('type') || requete.get('type')) === 'recovery'
}

if (typeof window !== 'undefined' && urlDeRecuperation()) ouvrirRecuperation()

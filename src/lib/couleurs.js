import { TYPES_SOIN } from './constantes'

/**
 * Couleur d'un cavalier, dérivée de son identifiant.
 *
 * Le choix du hash plutôt que d'une colonne en base est délibéré : la table
 * cheval_cavaliers portait une couleur par paire (cheval, cavalier), si bien
 * qu'un même cavalier changeait de couleur d'un cheval à l'autre. Dérivée de
 * l'id, la couleur est la même partout, sans requête ni migration.
 *
 * Chaque entrée fournit un fond pastel, un texte foncé de la même teinte
 * (contraste vérifié au-delà de 4,5:1) et un trait plein pour les liserés.
 */
export const PALETTE_CAVALIERS = [
  { nom: 'vert', fond: '#d7ecdd', texte: '#1a5c36', trait: '#2f8f57' },
  { nom: 'bleu', fond: '#d9e6fa', texte: '#17457c', trait: '#3573c7' },
  { nom: 'violet', fond: '#e4dcf8', texte: '#4a2a8c', trait: '#7355c9' },
  { nom: 'orange', fond: '#fbe4cf', texte: '#8a4a0e', trait: '#cf7529' },
  { nom: 'rose', fond: '#fadce6', texte: '#8d2749', trait: '#d1547f' },
  { nom: 'jaune', fond: '#f8ecc6', texte: '#77560c', trait: '#c39422' },
  { nom: 'turquoise', fond: '#d0ecec', texte: '#0d5b5f', trait: '#249598' },
  { nom: 'corail', fond: '#fadfd8', texte: '#93331f', trait: '#d66450' },
]

/** Couleur neutre des échéances de soins : un soin n'appartient à personne. */
export const COULEUR_SOIN = { fond: '#e5e2dd', texte: '#443f38', trait: '#57534e' }

/** FNV-1a — bonne répartition sur des UUID, et stable d'une session à l'autre. */
function empreinte(texte) {
  let hash = 2166136261
  for (let i = 0; i < texte.length; i++) {
    hash ^= texte.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function couleurCavalier(cavalierId) {
  if (!cavalierId) return PALETTE_CAVALIERS[0]
  return PALETTE_CAVALIERS[empreinte(String(cavalierId)) % PALETTE_CAVALIERS.length]
}

/** Raccourci pour les liserés et pastilles, qui n'ont besoin que du trait. */
export function traitCavalier(cavalierId) {
  return couleurCavalier(cavalierId).trait
}

export function prenom(nom) {
  return nom?.trim().split(/\s+/)[0] || '?'
}

/**
 * Étiquette d'un événement dans la grille du mois : prénom du cavalier pour
 * un créneau, emoji du type de soin pour une échéance.
 */
export function etiquetteEvenement(evenement) {
  if (evenement.genre === 'soin') {
    const type = TYPES_SOIN[evenement.type] || TYPES_SOIN.autre
    // Priorité 1 : dans une case étroite, savoir qui monte prime sur le soin,
    // sinon l'échéance occupe la seule place visible et masque les prénoms.
    return { cle: `soin-${evenement.type}`, libelle: type.emoji, priorite: 1, ...COULEUR_SOIN }
  }

  const couleur = couleurCavalier(evenement.cavalier_id)
  return {
    cle: `cavalier-${evenement.cavalier_id}`,
    libelle: prenom(evenement.cavalier?.nom),
    priorite: 0,
    ...couleur,
  }
}

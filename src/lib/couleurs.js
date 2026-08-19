import { TYPES_SOIN } from './constantes'

/**
 * Couleur d'un cavalier, dérivée de son identifiant.
 *
 * Le choix du hash plutôt que d'une colonne en base est délibéré : la table
 * cheval_cavaliers portait une couleur par paire (cheval, cavalier), si bien
 * qu'un même cavalier changeait de couleur d'un cheval à l'autre. Dérivée de
 * l'id, la couleur est la même partout, sans requête ni migration.
 *
 * Le hash seul ne suffit toutefois pas dès qu'un cheval compte plusieurs
 * cavaliers : deux identifiants tombent vite sur la même case. Avec cinq
 * cavaliers et dix couleurs, la collision est probable une fois sur trois.
 * `repertoireCavaliers` ci-dessous garde la couleur préférée quand elle est
 * libre et décale les autres, ce qui rend les couleurs distinctes au sein
 * d'un cheval sans les faire varier inutilement d'un écran à l'autre.
 *
 * Chaque entrée fournit un fond pastel, un texte foncé de la même teinte
 * (contraste vérifié au-delà de 4,5:1) et un trait plein pour les liserés.
 * Dix entrées, soit exactement le nombre maximal de cavaliers d'un cheval de
 * particulier (migration 0013) : chacun y a sa couleur.
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
  // Les deux dernières comblent les plus grands écarts de teinte de la
  // palette d'origine — jaune → vert, et violet → rose — plutôt que de
  // resserrer des voisines déjà proches.
  { nom: 'anis', fond: '#e6efc9', texte: '#4d5c12', trait: '#7f9524' },
  { nom: 'prune', fond: '#eedaeb', texte: '#6b2560', trait: '#a2479a' },
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

/** Comparaison de prénoms insensible à la casse et aux accents. */
function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Étiquettes distinctes pour les cavaliers d'un même cheval.
 *
 * Deux formes, parce que deux places très différentes les accueillent :
 *
 * - `libelle`, complet, pour la légende et les listes : prénom seul, prénom
 *   + initiale si un autre cavalier porte le même prénom, prénom + nom
 *   entier si l'initiale ne tranche pas non plus — deux « Marie D. » ne
 *   valent pas mieux que deux « Marie ».
 * - `court`, pour les cases du calendrier, larges d'une cinquantaine de
 *   pixels. On s'y arrête à l'initiale : « Marie Dupont » y serait de toute
 *   façon coupé en « Marie … », et deux étiquettes tronquées à l'identique
 *   ne distinguent plus rien. La couleur prend alors le relais, et le nom
 *   complet reste dans l'infobulle et sous la grille.
 */
function etiquettesDistinctes(cavaliers) {
  const etiquettes = new Map()
  const groupes = new Map()

  for (const cavalier of cavaliers) {
    const cle = normaliser(prenom(cavalier.nom))
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle).push(cavalier)
  }

  for (const groupe of groupes.values()) {
    if (groupe.length === 1) {
      const seul = prenom(groupe[0].nom)
      etiquettes.set(groupe[0].id, { libelle: seul, court: seul })
      continue
    }

    const avecInitiale = new Map()
    for (const cavalier of groupe) {
      const suite = String(cavalier.nom || '').trim().split(/\s+/).slice(1).join(' ')
      const court = suite
        ? `${prenom(cavalier.nom)} ${suite[0].toUpperCase()}.`
        : prenom(cavalier.nom)
      if (!avecInitiale.has(court)) avecInitiale.set(court, [])
      avecInitiale.get(court).push({ cavalier, suite })
    }

    for (const [court, membres] of avecInitiale) {
      for (const { cavalier, suite } of membres) {
        etiquettes.set(cavalier.id, {
          libelle: membres.length > 1 && suite ? `${prenom(cavalier.nom)} ${suite}` : court,
          court,
        })
      }
    }
  }

  return etiquettes
}

/**
 * Répertoire des cavaliers d'un cheval : pour chacun, une couleur et une
 * étiquette qu'aucun autre participant du même cheval ne porte.
 *
 * Accepte aussi bien les lignes de `cheval_cavaliers` (avec `profil`) que
 * des objets déjà aplatis.
 */
export function repertoireCavaliers(liaisons = []) {
  const cavaliers = []
  const vus = new Set()

  for (const liaison of liaisons) {
    const id = liaison?.cavalier_id ?? liaison?.id
    if (!id || vus.has(id)) continue
    vus.add(id)
    cavaliers.push({ id, nom: liaison.profil?.nom ?? liaison.cavalier?.nom ?? liaison.nom ?? '' })
  }

  // Ordre stable, indépendant de celui des lignes reçues : sans cela, la
  // couleur d'un cavalier dépendrait de la requête qui l'a chargé.
  cavaliers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const total = PALETTE_CAVALIERS.length
  const occupees = new Array(total).fill(null)
  const indices = new Map()

  // Premier tour : chacun garde la couleur qu'il porte partout ailleurs.
  for (const cavalier of cavaliers) {
    const voulue = empreinte(cavalier.id) % total
    if (occupees[voulue] === null) {
      occupees[voulue] = cavalier.id
      indices.set(cavalier.id, voulue)
    }
  }

  // Second tour : les évincés prennent la première couleur libre à droite.
  // Au-delà de dix cavaliers — un cheval de club, donc — les couleurs se
  // répètent ; l'étiquette reste, elle, toujours distincte.
  for (const cavalier of cavaliers) {
    if (indices.has(cavalier.id)) continue
    const voulue = empreinte(cavalier.id) % total
    let place = voulue
    for (let ecart = 1; ecart < total; ecart++) {
      const essai = (voulue + ecart) % total
      if (occupees[essai] === null) {
        place = essai
        break
      }
    }
    occupees[place] = cavalier.id
    indices.set(cavalier.id, place)
  }

  const etiquettes = etiquettesDistinctes(cavaliers)

  return new Map(
    cavaliers.map((cavalier) => [
      cavalier.id,
      { ...PALETTE_CAVALIERS[indices.get(cavalier.id)], ...etiquettes.get(cavalier.id) },
    ])
  )
}

/** Repli quand le répertoire du cheval n'est pas disponible. */
export function identiteCavalier(repertoire, cavalierId, nom) {
  return (
    repertoire?.get(cavalierId) ?? {
      ...couleurCavalier(cavalierId),
      libelle: prenom(nom),
      court: prenom(nom),
    }
  )
}

/**
 * Étiquette d'un événement dans la grille du mois : prénom du cavalier pour
 * un créneau, emoji du type de soin pour une échéance.
 */
export function etiquetteEvenement(evenement) {
  // Un passage en cours : le cheval travaille sous la bannière du club.
  // Une seule étiquette par jour quel que soit le cavalier — dans une case
  // de grille, « il y a cours » suffit, le détail vit dans la liste du jour.
  if (evenement.genre === 'cours') {
    return {
      cle: 'cours',
      libelle: 'Cours',
      court: '🎓',
      priorite: 0,
      fond: '#e3ecf7',
      texte: '#2b6cb0',
      trait: '#2b6cb0',
    }
  }

  if (evenement.genre === 'soin') {
    const type = TYPES_SOIN[evenement.type] || TYPES_SOIN.autre
    // Priorité 1 : dans une case étroite, savoir qui monte prime sur le soin,
    // sinon l'échéance occupe la seule place visible et masque les prénoms.
    return {
      cle: `soin-${evenement.type}`,
      libelle: type.libelle ?? type.emoji,
      court: type.emoji,
      priorite: 1,
      ...COULEUR_SOIN,
    }
  }

  // `etiquette` est posée au chargement, à partir du répertoire du cheval :
  // c'est elle qui garantit des couleurs et des prénoms distincts entre
  // co-cavaliers. Le repli sur le hash sert aux événements chargés hors de
  // ce chemin.
  const identite = identiteCavalier(
    null,
    evenement.cavalier_id,
    evenement.cavalier?.nom
  )
  const resolue = evenement.etiquette ?? identite

  return {
    cle: `cavalier-${evenement.cavalier_id}`,
    libelle: resolue.libelle,
    court: resolue.court ?? resolue.libelle,
    priorite: 0,
    fond: resolue.fond,
    texte: resolue.texte,
    trait: resolue.trait,
  }
}

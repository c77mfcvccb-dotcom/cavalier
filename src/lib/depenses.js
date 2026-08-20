/**
 * Calculs du module « Dépenses ».
 *
 * Tout est fait côté client, sur les douze derniers mois : c'est quelques
 * centaines de lignes au plus pour un compte, soit moins que ce que coûterait
 * un aller-retour supplémentaire vers la base à chaque changement de mois.
 * Le filtre par cheval et la navigation mensuelle sont donc instantanés.
 */
import { CATEGORIES_DEPENSE } from './constantes'
import { enDateLocale } from './format'

/** Nombre de mois affichés par le graphique, mois courant compris. */
export const MOIS_GLISSANTS = 12

/**
 * Montants en euros.
 *
 * Les centimes sont masqués sur les totaux — un budget mensuel se lit en
 * euros — mais conservés sur une ligne de dépense, où « 89,90 € » saisi ne
 * doit pas se relire « 90 € ».
 */
export function euros(montant, { centimes = false } = {}) {
  return Number(montant || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: centimes ? 2 : 0,
    maximumFractionDigits: centimes ? 2 : 0,
  })
}

/** Premier jour du mois, à midi — à l'abri des bascules d'heure d'été. */
export function debutMois(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

export function decalerMois(date, decalage) {
  return new Date(date.getFullYear(), date.getMonth() + decalage, 1, 12)
}

/** Clé « AAAA-MM », qui sert d'identité de mois dans tous les regroupements. */
export function cleMois(date) {
  const d = enDateLocale(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Bornes SQL du mois, en « AAAA-MM-JJ » pour une colonne DATE. */
export function bornesMois(date) {
  const premier = debutMois(date)
  const dernier = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)
  return { debut: cleJourSql(premier), fin: cleJourSql(dernier) }
}

function cleJourSql(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** Fenêtre couvrant les 12 mois qui se terminent au mois de `reference`. */
export function fenetreGlissante(reference) {
  return {
    debut: cleJourSql(decalerMois(reference, -(MOIS_GLISSANTS - 1))),
    fin: bornesMois(reference).fin,
  }
}

/** Un mois ne se filtre pas : il n'y a pas d'avenir à afficher. */
export function moisSuivantPossible(mois) {
  return debutMois(mois) < debutMois(new Date())
}

/**
 * Douze points mensuels, y compris les mois sans dépense.
 *
 * Les trous comptent autant que les pics : un graphique qui saute les mois
 * vides laisse croire à une dépense continue et fausse la lecture de
 * l'évolution.
 */
export function seriesMensuelle(depenses, reference) {
  const totaux = new Map()
  for (const d of depenses) {
    const cle = cleMois(d.date)
    totaux.set(cle, (totaux.get(cle) || 0) + Number(d.montant))
  }

  return Array.from({ length: MOIS_GLISSANTS }, (_, i) => {
    const date = decalerMois(reference, -(MOIS_GLISSANTS - 1 - i))
    const cle = cleMois(date)
    return { cle, date, total: totaux.get(cle) || 0 }
  })
}

/**
 * Sous-totaux par cheval, du plus lourd au plus léger.
 *
 * Construits à partir des dépenses et non de la cavalerie : un cheval
 * partagé sur lequel on a engagé quelque chose doit apparaître, et un
 * cheval sans dépense du mois n'a rien à faire dans une liste de montants.
 *
 * Les dépenses sans cheval — une selle, un déplacement — sont regroupées
 * en fin de liste plutôt que réparties d'office : les imputer à un cheval
 * fausserait les sous-totaux.
 */
export function repartitionParCheval(depenses, nomDuCheval) {
  const totaux = new Map()
  for (const d of depenses) {
    const cle = d.cheval_id || null
    const actuel = totaux.get(cle) || { montant: 0, nombre: 0 }
    totaux.set(cle, { montant: actuel.montant + Number(d.montant), nombre: actuel.nombre + 1 })
  }

  const total = [...totaux.values()].reduce((s, v) => s + v.montant, 0)
  return [...totaux.entries()]
    .map(([chevalId, v]) => ({
      chevalId,
      nom: chevalId ? nomDuCheval(chevalId) : 'Sans cheval',
      montant: v.montant,
      nombre: v.nombre,
      part: total > 0 ? v.montant / total : 0,
    }))
    .sort((a, b) => {
      if (!a.chevalId) return 1
      if (!b.chevalId) return -1
      return b.montant - a.montant
    })
}

/** Postes du mois, du plus lourd au plus léger — l'ordre qui informe. */
export function repartitionParCategorie(depenses) {
  const totaux = new Map()
  for (const d of depenses) {
    totaux.set(d.categorie, (totaux.get(d.categorie) || 0) + Number(d.montant))
  }

  const total = [...totaux.values()].reduce((s, v) => s + v, 0)
  return [...totaux.entries()]
    .map(([categorie, montant]) => ({
      categorie,
      libelle: CATEGORIES_DEPENSE[categorie]?.libelle ?? categorie,
      montant,
      part: total > 0 ? montant / total : 0,
    }))
    .sort((a, b) => b.montant - a.montant)
}

export function total(depenses) {
  return depenses.reduce((s, d) => s + Number(d.montant), 0)
}

/** `null` vaut « tous les chevaux » : le filtre ne doit pas l'écarter. */
export function filtrerParCheval(depenses, chevalId) {
  if (!chevalId) return depenses
  return depenses.filter((d) => d.cheval_id === chevalId)
}

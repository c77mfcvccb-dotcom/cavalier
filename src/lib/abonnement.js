/**
 * Plan gratuit et premium — côté interface.
 *
 * Tout ce fichier n'est qu'une anticipation des règles appliquées par le
 * serveur (migration 0005). Il évite d'afficher une erreur brute, mais ne
 * protège rien : les limites qui comptent sont dans les politiques RLS.
 */

export const LIMITE_CHEVAUX_GRATUIT = 1

/**
 * Les deux formules, dans l'ordre d'affichage.
 *
 * Les clés sont les identifiants produits RevenueCat — ce sont aussi ceux
 * que le webhook écrit dans `abonnements.produit`, et ceux que contraint la
 * migration 0005. Un renommage côté RevenueCat casserait les trois.
 *
 * Les prix ci-dessous ne sont qu'un **repli** : à l'écran, ce sont ceux
 * renvoyés par RevenueCat qui s'affichent, avec la bonne devise et le bon
 * format local. Ils ne servent que si le catalogue n'a pas pu être chargé.
 */
export const OFFRES = {
  premium_mensuel: {
    paquet: '$rc_monthly',
    libelle: 'Mensuel',
    prix: '4,99 €',
    periode: 'par mois',
    detail: 'Sans engagement, résiliable à tout moment.',
  },
  premium_annuel: {
    paquet: '$rc_annual',
    libelle: 'Annuel',
    prix: '39,99 €',
    periode: 'par an',
    detail: 'Soit 3,33 € par mois.',
    miseEnAvant: '2 mois offerts',
  },
}

/** Identifiant de package RevenueCat → produit interne. */
export const PRODUIT_PAR_PAQUET = Object.fromEntries(
  Object.entries(OFFRES).map(([produit, offre]) => [offre.paquet, produit])
)

export const JOURS_ESSAI = 7

/** Ordre d'affichage : le mensuel d'abord, l'annuel mis en avant ensuite. */
const ORDRE_PAQUETS = Object.values(OFFRES).map((offre) => offre.paquet)

/**
 * Traduit un package RevenueCat en ce qu'attend l'écran d'abonnement.
 *
 * Le libellé, la mise en avant et le descriptif restent maison : ils sont
 * en français, et calés sur le ton du reste de l'application. Seuls le prix
 * et la période viennent de RevenueCat, parce qu'eux seuls peuvent varier
 * (devise du visiteur, promotion, changement de tarif).
 */
export function decrireOffre(paquet) {
  const produit = paquet.webBillingProduct
  const cle = PRODUIT_PAR_PAQUET[paquet.identifier] ?? produit?.identifier
  const repli = OFFRES[cle] ?? {}

  return {
    cle,
    paquet,
    libelle: repli.libelle ?? produit?.title ?? '',
    detail: repli.detail ?? produit?.description ?? '',
    miseEnAvant: repli.miseEnAvant ?? null,
    prix: produit?.price?.formattedPrice ?? repli.prix ?? '',
    periode: periodeLisible(produit?.period) ?? repli.periode ?? '',
    joursEssai: joursEssai(produit) ?? JOURS_ESSAI,
    remise: decrireRemise(produit),
  }
}

/**
 * Remise appliquée par un code promo, ou `null` si le catalogue n'en porte
 * aucune — ce qui est aussi la façon de savoir qu'un code n'a pas pris.
 *
 * `discountPhase` n'appartient pas encore aux types publics du SDK, bien
 * qu'il soit renseigné à l'exécution. On le lit donc défensivement : si la
 * forme change à une prochaine version, on retombe sur « pas de remise »
 * plutôt que sur un écran cassé — et le tunnel de paiement, lui, appliquera
 * la remise de toute façon.
 */
function decrireRemise(produit) {
  const phase = produit?.discountPhase
  const prix = phase?.price?.formattedPrice
  if (!phase || !prix) return null

  return {
    prix,
    // « −20 % » quand RevenueCat le donne, sinon le nom de la promotion.
    etiquette:
      typeof phase.percentage === 'number' && phase.percentage > 0
        ? `−${Math.round(phase.percentage)} %`
        : phase.name || 'Remise',
    duree: dureeRemise(phase),
  }
}

/** Vrai pour une remise qui ne s'arrête jamais. */
export const REMISE_PERMANENTE = 'toute la durée de l’abonnement'

/**
 * « toute la durée de l'abonnement », « le premier mois », « les 3 premiers
 * mois »… sans préposition, pour que l'appelant compose sa phrase.
 *
 * La durée compte autant que le montant : une remise sur un seul mois et
 * une remise à vie n'ont pas la même valeur, et l'afficher évite la
 * mauvaise surprise au deuxième prélèvement.
 */
const DUREES = {
  day: { premier: 'le premier jour', pluriel: 'premiers jours' },
  week: { premier: 'la première semaine', pluriel: 'premières semaines' },
  month: { premier: 'le premier mois', pluriel: 'premiers mois' },
  year: { premier: 'la première année', pluriel: 'premières années' },
}

function dureeRemise(phase) {
  if (phase.durationMode === 'forever') return REMISE_PERMANENTE

  const duree = DUREES[phase.period?.unit]
  if (!duree) return null

  const cycles = phase.cycleCount || 1
  return cycles === 1 ? duree.premier : `les ${cycles} ${duree.pluriel}`
}

/** Trie les packages de l'offering dans l'ordre voulu à l'écran. */
export function trierOffres(paquets = []) {
  return [...paquets].sort(
    (a, b) =>
      (ORDRE_PAQUETS.indexOf(a.identifier) + 1 || 99) -
      (ORDRE_PAQUETS.indexOf(b.identifier) + 1 || 99)
  )
}

/** « par mois », « par an »… à partir de la période renvoyée par le SDK. */
function periodeLisible(periode) {
  if (!periode) return null
  const { number, unit } = periode
  if (number === 1) {
    if (unit === 'month') return 'par mois'
    if (unit === 'year') return 'par an'
    if (unit === 'week') return 'par semaine'
    if (unit === 'day') return 'par jour'
  }
  const pluriels = { day: 'jours', week: 'semaines', month: 'mois', year: 'ans' }
  return `tous les ${number} ${pluriels[unit] ?? unit}`
}

/** Durée de l'essai gratuit configurée dans RevenueCat, en jours. */
function joursEssai(produit) {
  const periode = produit?.freeTrialPhase?.period
  if (!periode) return null
  const enJours = { day: 1, week: 7, month: 30, year: 365 }
  return periode.number * (enJours[periode.unit] ?? 1)
}

export const AVANTAGES_PREMIUM = [
  {
    titre: 'Chevaux illimités',
    texte: 'Le plan gratuit s’arrête à un cheval, qu’il soit créé ou rejoint avec un code.',
  },
  {
    titre: 'Carnet de santé complet',
    texte: 'Ferrure, vaccins, vermifuges, ostéo — avec les rappels d’échéance.',
  },
  {
    titre: 'Calendrier sans limite',
    texte: 'Le plan gratuit s’arrête au dimanche de la semaine en cours.',
  },
]

/**
 * Premier instant hors de la semaine en cours (lundi 00:00 à venir).
 * Doit rester aligné sur la fonction SQL fin_semaine_courante().
 */
export function finSemaineCourante(reference = new Date()) {
  const d = new Date(reference)
  d.setHours(0, 0, 0, 0)
  const versLundi = (7 - ((d.getDay() + 6) % 7)) % 7 || 7
  d.setDate(d.getDate() + versLundi)
  return d
}

/** Dernier jour saisissable en gratuit : le dimanche courant. */
export function dernierJourGratuit(reference = new Date()) {
  const fin = finSemaineCourante(reference)
  fin.setDate(fin.getDate() - 1)
  return fin
}

export function creneauHorsPlanGratuit(debut, reference = new Date()) {
  return new Date(debut) >= finSemaineCourante(reference)
}

/** Message d'erreur levé par la base quand le quota gratuit est atteint. */
export const ERREUR_QUOTA = 'PLAN_GRATUIT_UN_CHEVAL'

export function estErreurQuota(erreur) {
  return Boolean(erreur?.message?.includes(ERREUR_QUOTA))
}

/** Portail de gestion de repli, si le webhook n'a pas transmis l'URL propre au compte. */
export const LIEN_PORTAIL = import.meta.env.VITE_REVENUECAT_LIEN_PORTAIL || ''

/** URL où l'abonné gère et résilie lui-même son abonnement. */
export function lienGestion(abonnement) {
  return abonnement?.url_gestion || LIEN_PORTAIL || ''
}

/** Résilié mais encore dans la période payée. */
export function estResilie(abonnement) {
  return abonnement?.statut === 'annule'
}

export function libelleStatut(abonnement) {
  if (!abonnement) return 'Plan gratuit'
  if (abonnement.statut === 'essai') return `Essai ${JOURS_ESSAI} jours`
  if (abonnement.statut === 'annule') return 'Résilié'
  if (abonnement.statut === 'actif') return 'Actif'
  return 'Plan gratuit'
}

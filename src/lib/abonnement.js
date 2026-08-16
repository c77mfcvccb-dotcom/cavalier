/**
 * Plan gratuit et premium — côté interface.
 *
 * Tout ce fichier n'est qu'une anticipation des règles appliquées par le
 * serveur (migration 0005). Il évite d'afficher une erreur brute, mais ne
 * protège rien : les limites qui comptent sont dans les politiques RLS.
 */

export const LIMITE_CHEVAUX_GRATUIT = 1

export const OFFRES = {
  premium_mensuel: {
    libelle: 'Mensuel',
    prix: '4,99 €',
    periode: 'par mois',
    detail: 'Sans engagement, résiliable à tout moment.',
  },
  premium_annuel: {
    libelle: 'Annuel',
    prix: '39,99 €',
    periode: 'par an',
    detail: 'Soit 3,33 € par mois — deux mois offerts.',
    recommande: true,
  },
}

export const JOURS_ESSAI = 7

export const AVANTAGES_PREMIUM = [
  {
    emoji: '🐴',
    titre: 'Chevaux illimités',
    texte: 'Le plan gratuit s’arrête à un cheval, qu’il soit créé ou rejoint avec un code.',
  },
  {
    emoji: '🩺',
    titre: 'Carnet de santé complet',
    texte: 'Ferrure, vaccins, vermifuges, ostéo — avec les rappels d’échéance.',
  },
  {
    emoji: '📅',
    titre: 'Calendrier sans limite',
    texte: 'Le plan gratuit s’arrête au dimanche de la semaine en cours.',
  },
  { emoji: '💶', titre: 'Suivi des dépenses', texte: 'Totaux par mois, par type et par cheval.' },
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

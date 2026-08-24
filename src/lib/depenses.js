/**
 * Utilitaires de date et de montant partagés — nés du module Dépenses
 * (retiré côté cavalier), réutilisés depuis par le récapitulatif mensuel
 * et les tarifs du club : navigation par mois et formatage en euros.
 */
import { enDateLocale } from './format'

/**
 * Montants en euros.
 *
 * Les centimes sont masqués sur les totaux — un budget mensuel se lit en
 * euros — mais conservés sur une ligne à l'unité, où « 89,90 € » saisi ne
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

/** Un mois ne se filtre pas : il n'y a pas d'avenir à afficher. */
export function moisSuivantPossible(mois) {
  return debutMois(mois) < debutMois(new Date())
}

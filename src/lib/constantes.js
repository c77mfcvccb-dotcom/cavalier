// Libellés et réglages partagés par toute l'application.

export const ROLES = {
  proprietaire: { libelle: 'Propriétaire', court: 'Proprio' },
  demi_pension: { libelle: 'Demi-pension', court: 'DP' },
  tiers_pension: { libelle: 'Tiers de pension', court: 'TP' },
  pension_complete: { libelle: 'Pension complète', court: 'Pension' },
  cavalier_club: { libelle: 'Cheval de club', court: 'Club' },
}

/**
 * Les rôles qu'une écurie peut poser à l'attribution (migration 0023),
 * complétés par « propriétaire » (migration 0029) : l'attribuer ici lie
 * d'abord le cavalier normalement, puis le désigne aussitôt propriétaire
 * (deux appels RPC enchaînés côté écran — voir attribuer() dans
 * OngletCavaliers.jsx et MonClub.jsx).
 */
export const ROLES_ATTRIBUTION = ['demi_pension', 'tiers_pension', 'pension_complete', 'cavalier_club', 'proprietaire']

/**
 * Les rôles où un cheval est vraiment « le sien » — à l'inverse de
 * cavalier_club, qui ne distingue aucune monture en particulier et laisse
 * donc le club choisir. Sert à proposer son propre cheval à l'inscription
 * à un cours (migration 0027) ; la base applique la même liste côté RLS.
 */
export const ROLES_CHEVAL_PROPRE = ['proprietaire', 'demi_pension', 'tiers_pension', 'pension_complete']

export const TYPES_SEANCE = {
  plat: 'Plat',
  dressage: 'Dressage',
  obstacle: 'Obstacle',
  cross: 'Cross',
  balade: 'Balade',
  longe: 'Longe',
  repos: 'Repos',
  autre: 'Autre',
}

export const TYPES_CRENEAU = {
  monte: 'Monte',
  seance: 'Séance',
  balade: 'Balade',
  cours: 'Cours',
  soin: 'Soin',
  autre: 'Autre',
}

// Intervalle habituel avant la prochaine échéance, en jours.
//
// Ce sont les valeurs PAR DÉFAUT, reprises de la fonction SQL
// intervalle_soin_defaut() (migration 0011) : les deux doivent rester
// alignées, sinon le formulaire propose une date que le rappel par email
// ne confirmera pas. Un réglage par cheval peut les remplacer
// (« Rappels » sur la fiche du cheval).
//
// Vétérinaire et « autre » n'en ont pas : une visite n'appelle pas
// mécaniquement la suivante.
export const TYPES_SOIN = {
  ferrure: { libelle: 'Ferrure', intervalleJours: 49 },
  veterinaire: { libelle: 'Vétérinaire', intervalleJours: null },
  vaccin: { libelle: 'Vaccin', intervalleJours: 365 },
  vermifuge: { libelle: 'Vermifuge', intervalleJours: 120 },
  osteopathe: { libelle: 'Ostéopathe', intervalleJours: 365 },
  dentiste: { libelle: 'Dentiste', intervalleJours: 365 },
  autre: { libelle: 'Autre', intervalleJours: null },
}

/** Ressenti noté après une séance — le signal faible qui compte en demi-pension. */
export const RESSENTIS = {
  ras: { libelle: 'RAS', alerte: false },
  en_forme: { libelle: 'En forme', alerte: false },
  fatigue: { libelle: 'Fatigué', alerte: false },
  tendu: { libelle: 'Tendu', alerte: false },
  boiterie_suspectee: { libelle: 'Boiterie suspectée', alerte: true },
  blessure: { libelle: 'Blessure', alerte: true },
  autre: { libelle: 'Autre', alerte: false },
}

/**
 * Protocoles de vaccination courants. Les délais correspondent à la primo
 * (deux injections rapprochées) puis au rappel.
 * La grippe équine suit le rappel réglementaire FFE : un an moins un jour,
 * d'où 364 jours — la date doit être strictement dans l'année pour concourir.
 */
export const PROTOCOLES_VACCIN = {
  grippe_rappel: {
    libelle: 'Grippe — rappel annuel (compétition)',
    intervalleJours: 364,
    aide: 'Rappel FFE : valable moins d’un an pour être en règle en compétition.',
  },
  grippe_primo_2: {
    libelle: 'Grippe — primo, 2ᵉ injection',
    intervalleJours: 30,
    aide: '21 à 92 jours après la 1re injection ; 30 jours par défaut.',
  },
  grippe_primo_3: {
    libelle: 'Grippe — primo, 3ᵉ injection',
    intervalleJours: 180,
    aide: '5 à 7 mois après la 2e injection.',
  },
  tetanos: {
    libelle: 'Tétanos',
    intervalleJours: 1095,
    aide: 'Rappel tous les 3 ans en général.',
  },
  rhinopneumonie: {
    libelle: 'Rhinopneumonie',
    intervalleJours: 182,
    aide: 'Rappel semestriel.',
  },
  autre_vaccin: { libelle: 'Autre vaccin', intervalleJours: 365, aide: null },
}

/**
 * Trois états, calés sur la vue v_echeances (migration 0011) : dépassé,
 * à prévoir sous 14 jours, ou rien à signaler.
 *
 * Le palier « ce mois-ci » a été retiré : une échéance à 29 jours
 * n'appelle aucune action, et la signaler apprend à ignorer les
 * signalements.
 */
export const STATUTS_ECHEANCE = {
  retard: { libelle: 'En retard', classe: 'retard' },
  urgent: { libelle: 'À prévoir', classe: 'urgent' },
  ok: { libelle: 'À jour', classe: 'ok' },
}

/**
 * Seuil de l'état « à prévoir », en jours.
 *
 * Doit rester égal à celui de `v_echeances` (migration 0011). Il vivait
 * jusqu'ici en clair dans deux fichiers, avec deux valeurs différentes —
 * 7 d'un côté, 14 de l'autre : la fiche d'un cheval annonçait « à jour »
 * une échéance que l'accueil signalait en orange.
 */
export const SEUIL_URGENCE_JOURS = 14

/**
 * Catégories de documents administratifs du cheval.
 *
 * Quatre, volontairement peu nombreuses : au-delà, le choix à la saisie
 * devient une hésitation plutôt qu'un classement. « Vaccination » n'en fait
 * pas partie — un carnet de vaccins existe déjà dans les soins, et dupliquer
 * la notion créerait deux endroits où chercher la même information.
 */
export const CATEGORIES_DOCUMENT = {
  identification: { libelle: 'Document d’identification' },
  contrat_dp: { libelle: 'Contrat de demi-pension' },
  assurance: { libelle: 'Assurance' },
  autre: { libelle: 'Autre' },
}

/**
 * Nombre maximal de documents par cheval, selon le plan de celui qui ajoute.
 *
 * Le quota se compte par cheval — c'est son carnet qui se remplit — mais la
 * limite applicable dépend du plan de l'ajouteur : sur un cheval partagé,
 * la cavalière gratuite bute à 10 quand la premium peut aller à 50.
 *
 * La limite qui fait foi est le trigger de la migration 0016 ; ces
 * constantes ne servent qu'à l'annoncer avant de buter dessus.
 */
export const QUOTA_DOCUMENTS = { gratuit: 10, premium: 50 }

/**
 * Disciplines d'un cours de club. Les clés sont contraintes en base
 * (migration 0017) : en ajouter une ici sans toucher au `check` ferait
 * échouer la création du cours.
 */
export const DISCIPLINES_COURS = {
  dressage: { libelle: 'Dressage' },
  obstacle: { libelle: 'Obstacle' },
  cross: { libelle: 'Cross' },
  balade: { libelle: 'Balade' },
  poney: { libelle: 'Poney' },
  autre: { libelle: 'Autre' },
}

/** Périodicités des tarifs du club (migration 0033), contraintes en base. */
export const PERIODICITES_TARIF = {
  mois: { libelle: 'Par mois', suffixe: '/mois' },
  seance: { libelle: 'Par séance', suffixe: '/séance' },
  unique: { libelle: 'Prix unique', suffixe: '' },
}

/**
 * Types d'annonce du club (migration 0034), contraints en base. Une
 * fermeture se distingue visuellement (badge urgent) — c'est celle qui
 * change le quotidien d'un adhérent, contrairement à une actualité.
 */
export const TYPES_ANNONCE = {
  info: { libelle: 'Actualité', classe: 'contour' },
  fermeture: { libelle: 'Fermeture exceptionnelle', classe: 'urgent' },
  stage: { libelle: 'Stage', classe: 'ok' },
}

/**
 * Motifs d'indisponibilité d'un cheval (migration 0017, même règle : les
 * clés sont contraintes en base). « Repos » est le motif par défaut — c'est
 * le plus fréquent, et le moins alarmant.
 */
export const MOTIFS_INDISPO = {
  repos: { libelle: 'Repos' },
  boiterie: { libelle: 'Boiterie' },
  osteo: { libelle: 'Ostéopathie' },
  veterinaire: { libelle: 'Vétérinaire' },
  vacances: { libelle: 'Vacances' },
  autre: { libelle: 'Autre' },
}

export const SEXES = {
  jument: 'Jument',
  hongre: 'Hongre',
  entier: 'Entier',
}

export const ORDRE_STATUTS = ['retard', 'urgent', 'ok']

/**
 * Nombre maximal de cavaliers sur un cheval de particulier.
 *
 * Rien n'oblige techniquement à plafonner : la base tient sans peine un
 * cheval à trente cavaliers. La borne existe pour deux raisons plus
 * concrètes — la palette du calendrier compte dix couleurs, et un code
 * d'invitation qui circule dans un groupe de messagerie n'a plus de garde-fou
 * sans elle.
 *
 * Un cheval de club en est exempté : une cavalerie d'école tourne
 * couramment avec vingt cavaliers, et c'est son usage normal.
 *
 * La limite qui fait foi reste celle de la base (migration 0013) ; cette
 * constante ne sert qu'à l'annoncer avant de buter dessus.
 */
export const PARTICIPANTS_MAX = 10

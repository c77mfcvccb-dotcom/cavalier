// Libellés et réglages partagés par toute l'application.

export const ROLES = {
  proprietaire: { libelle: 'Propriétaire', court: 'Proprio' },
  demi_pension: { libelle: 'Demi-pension', court: 'DP' },
  cavalier_club: { libelle: 'Cheval de club', court: 'Club' },
}

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
// Sert à pré-remplir le champ « prochaine échéance » à la saisie d'un soin.
export const TYPES_SOIN = {
  ferrure: { libelle: 'Ferrure', emoji: '🔨', intervalleJours: 42 },
  veterinaire: { libelle: 'Vétérinaire', emoji: '🩺', intervalleJours: 365 },
  vaccin: { libelle: 'Vaccin', emoji: '💉', intervalleJours: 365 },
  vermifuge: { libelle: 'Vermifuge', emoji: '💊', intervalleJours: 90 },
  osteopathe: { libelle: 'Ostéopathe', emoji: '🖐️', intervalleJours: 180 },
  dentiste: { libelle: 'Dentiste', emoji: '🦷', intervalleJours: 365 },
  autre: { libelle: 'Autre', emoji: '📋', intervalleJours: null },
}

/**
 * Couleur des échéances de soins dans les calendriers. Volontairement neutre
 * et absente de la palette des cavaliers (voir couleur_libre en SQL) : un soin
 * n'appartient à personne, il concerne le cheval.
 */
export const COULEUR_SOIN = '#57534e'

/** Ressenti noté après une séance — le signal faible qui compte en demi-pension. */
export const RESSENTIS = {
  ras: { libelle: 'RAS', emoji: '🙂', alerte: false },
  en_forme: { libelle: 'En forme', emoji: '💪', alerte: false },
  fatigue: { libelle: 'Fatigué', emoji: '😮‍💨', alerte: false },
  tendu: { libelle: 'Tendu', emoji: '😬', alerte: false },
  boiterie_suspectee: { libelle: 'Boiterie suspectée', emoji: '⚠️', alerte: true },
  blessure: { libelle: 'Blessure', emoji: '🩹', alerte: true },
  autre: { libelle: 'Autre', emoji: '📝', alerte: false },
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

export const STATUTS_ECHEANCE = {
  retard: { libelle: 'En retard', classe: 'retard' },
  urgent: { libelle: 'Cette semaine', classe: 'urgent' },
  bientot: { libelle: 'Ce mois-ci', classe: 'bientot' },
  ok: { libelle: 'À jour', classe: 'ok' },
}

export const SEXES = {
  jument: 'Jument',
  hongre: 'Hongre',
  entier: 'Entier',
}

export const ORDRE_STATUTS = ['retard', 'urgent', 'bientot', 'ok']

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

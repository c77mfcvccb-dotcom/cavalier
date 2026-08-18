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
  ferrure: { libelle: 'Ferrure', emoji: '🔨', intervalleJours: 49 },
  veterinaire: { libelle: 'Vétérinaire', emoji: '🩺', intervalleJours: null },
  vaccin: { libelle: 'Vaccin', emoji: '💉', intervalleJours: 365 },
  vermifuge: { libelle: 'Vermifuge', emoji: '💊', intervalleJours: 120 },
  osteopathe: { libelle: 'Ostéopathe', emoji: '🖐️', intervalleJours: 365 },
  dentiste: { libelle: 'Dentiste', emoji: '🦷', intervalleJours: 365 },
  autre: { libelle: 'Autre', emoji: '📋', intervalleJours: null },
}

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

/**
 * Postes de dépense. Les clés sont contraintes en base (migration 0009) :
 * en ajouter une ici sans toucher au `check` ferait échouer l'insertion.
 *
 * L'ordre est celui du formulaire, et il n'est pas alphabétique : la
 * pension et le maréchal reviennent tous les mois, le reste est plus rare.
 */
export const CATEGORIES_DEPENSE = {
  pension: { libelle: 'Pension', emoji: '🏠' },
  marechal: { libelle: 'Maréchal', emoji: '🔨' },
  veterinaire: { libelle: 'Vétérinaire', emoji: '🩺' },
  osteo: { libelle: 'Ostéopathe', emoji: '🖐️' },
  alimentation: { libelle: 'Alimentation', emoji: '🌾' },
  materiel: { libelle: 'Matériel', emoji: '🎒' },
  concours: { libelle: 'Concours', emoji: '🏆' },
  transport: { libelle: 'Transport', emoji: '🚚' },
  autre: { libelle: 'Autre', emoji: '💶' },
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
  identification: { libelle: 'Document d’identification', emoji: '🪪' },
  contrat_dp: { libelle: 'Contrat de demi-pension', emoji: '📄' },
  assurance: { libelle: 'Assurance', emoji: '🛡️' },
  autre: { libelle: 'Autre', emoji: '📎' },
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

/**
 * Identité de l'éditeur et des prestataires, pour les pages légales.
 *
 * Tout est réuni ici : les trois pages n'écrivent aucune coordonnée en dur,
 * de sorte qu'un changement d'adresse ou de statut se fait en un seul point,
 * sans risque d'oublier une mention.
 *
 * ⚠️ Les valeurs marquées À_COMPLETER doivent être renseignées avant la mise
 * en ligne. Tant qu'il en reste une, `mentionsIncompletes` vaut true et les
 * pages légales affichent un bandeau d'avertissement : mieux vaut un
 * avertissement visible qu'une mention légale fausse, qui engagerait
 * l'éditeur bien plus sûrement qu'une mention absente.
 */

/** Sentinelle : toute valeur restée égale à ceci bloque la publication. */
const A_COMPLETER = 'À_COMPLETER'

/**
 * Éditeur du service, au sens de l'article 6 III de la LCEN.
 *
 * `forme` : « entrepreneur individuel », « SASU au capital de X € »…
 * `tva` : numéro intracommunautaire, ou la mention de franchise en base.
 */
export const EDITEUR = {
  nom: A_COMPLETER,
  forme: A_COMPLETER,
  siret: A_COMPLETER,
  rcs: A_COMPLETER,
  adresse: A_COMPLETER,
  email: A_COMPLETER,
  telephone: A_COMPLETER,
  directeurPublication: A_COMPLETER,
  tva: A_COMPLETER,
}

/**
 * Médiateur de la consommation.
 *
 * L'adhésion à un dispositif de médiation est **obligatoire** pour tout
 * professionnel vendant à des consommateurs (article L612-1 du code de la
 * consommation), et ses coordonnées doivent figurer dans les CGV. Ce n'est
 * pas une formalité facultative : son absence est sanctionnée.
 */
export const MEDIATEUR = {
  nom: A_COMPLETER,
  adresse: A_COMPLETER,
  site: A_COMPLETER,
}

/**
 * Sous-traitants au sens de l'article 28 du RGPD.
 *
 * Les adresses n'ont pas pu être vérifiées à la rédaction : à confirmer sur
 * les pages légales de chaque prestataire avant publication. Une adresse
 * d'hébergeur erronée dans les mentions légales est un défaut d'information,
 * pas un détail.
 */
export const PRESTATAIRES = [
  {
    cle: 'vercel',
    nom: 'Vercel Inc.',
    role: 'Hébergement du site',
    adresse: A_COMPLETER,
    traitement: 'Diffusion des pages et des fichiers de l’application.',
    donnees: 'Journaux techniques : adresse IP, date, page demandée.',
    zone: 'États-Unis',
  },
  {
    cle: 'supabase',
    nom: 'Supabase',
    role: 'Hébergement des données',
    adresse: A_COMPLETER,
    traitement:
      'Base de données, authentification et stockage des photos. C’est ici que vivent toutes les données du compte.',
    donnees: 'L’ensemble des données décrites plus haut.',
    zone: 'Union européenne (région choisie à la création du projet)',
  },
  {
    cle: 'revenuecat',
    nom: 'RevenueCat, Inc.',
    role: 'Gestion des abonnements',
    adresse: A_COMPLETER,
    traitement:
      'Suivi du cycle de vie de l’abonnement : essai, renouvellement, résiliation, portail client.',
    donnees: 'Identifiant du compte, email, formule souscrite, dates d’échéance.',
    zone: 'États-Unis',
  },
  {
    cle: 'stripe',
    nom: 'Stripe',
    role: 'Encaissement',
    adresse: A_COMPLETER,
    traitement:
      'Traitement du paiement par carte. Les coordonnées bancaires sont saisies chez Stripe et ne transitent jamais par nos serveurs.',
    donnees: 'Coordonnées de carte, email de facturation, montant.',
    zone: 'Irlande et États-Unis',
  },
]

/** Tarifs affichés dans les CGV. Doivent rester alignés sur RevenueCat. */
export const TARIFS = {
  mensuel: '4,99 € TTC par mois',
  annuel: '39,99 € TTC par an',
  essaiJours: 7,
}

/**
 * Version des CGV, enregistrée au moment de l'acceptation.
 *
 * À incrémenter à chaque modification de fond : c'est ce qui permet de
 * savoir quelle version un compte a acceptée, et donc de redemander une
 * acceptation si le texte change substantiellement.
 */
export const VERSION_CGV = '2026-08-16'

/** Date affichée en bas de chaque page. */
export const DERNIERE_MAJ = '16 août 2026'

/** Vrai tant qu'une coordonnée obligatoire n'est pas renseignée. */
export const mentionsIncompletes = [
  ...Object.values(EDITEUR),
  ...Object.values(MEDIATEUR),
  ...PRESTATAIRES.map((p) => p.adresse),
].includes(A_COMPLETER)

/** Affiche une valeur, ou un repère visible si elle manque. */
export function valeur(v) {
  return v === A_COMPLETER ? '⚠️ à compléter' : v
}

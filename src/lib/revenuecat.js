/**
 * RevenueCat Web Billing — pont vers le SDK `@revenuecat/purchases-js`.
 *
 * L'achat se fait désormais **dans la page**, via le tunnel hébergé par
 * RevenueCat (Stripe côté paiement), et non plus par une redirection vers un
 * Web Purchase Link. Deux conséquences qui comptent :
 *
 *   1. Le cavalier ne quitte plus l'application — donc plus de retour
 *      `?achat=ok` à espérer, ni de PWA qui se rouvre sur un écran froid.
 *   2. `app_user_id` n'est plus un paramètre d'URL falsifiable : c'est le
 *      SDK qui le porte, et c'est l'identifiant Supabase du compte connecté.
 *      Le webhook sait donc toujours quel compte créditer.
 *
 * Le SDK n'est chargé qu'à l'ouverture de l'écran d'abonnement
 * (`import()` dynamique) : il pèse plus lourd que tout le reste de
 * l'application, et la très grande majorité des visites ne le croise jamais.
 *
 * ⚠️ Le SDK ne fait pas foi. Il affiche les prix et encaisse ; l'accès
 * premium, lui, vient de la table `abonnements` remplie par le webhook, et
 * des politiques RLS qui s'appuient dessus. Un `customerInfo` optimiste ne
 * déverrouille rien côté serveur.
 */

/**
 * Clé publique du SDK (Web Billing). Elle est faite pour vivre dans le
 * front : elle ne permet que de lire le catalogue et de démarrer un achat.
 *
 * La clé de production vit dans `VITE_REVENUECAT_CLE_PUBLIQUE` — variables
 * d'environnement Vercel pour le site en ligne, fichier `.env` en local.
 *
 * Le repli reste **délibérément** celui du bac à sable, et non celui de
 * production. Une variable oubliée, un fichier `.env` absent, un
 * environnement de préproduction monté à la hâte : dans tous ces cas, le
 * pire qui puisse arriver est qu'aucun paiement ne soit encaissé. L'inverse
 * — débiter une vraie carte par accident de configuration — ne se rattrape
 * pas d'un redéploiement.
 */
const CLE_BAC_A_SABLE = 'rcb_sb_GMMCEAyVBmaXZZrFpcYBDlqLT'

export const CLE_PUBLIQUE = import.meta.env.VITE_REVENUECAT_CLE_PUBLIQUE || CLE_BAC_A_SABLE

/** Vrai tant qu'aucun paiement réel n'est encaissé. */
export const EN_BAC_A_SABLE = CLE_PUBLIQUE.startsWith('rcb_sb_')

/** Droit unique vendu par l'application, tel que nommé dans RevenueCat. */
export const ENTITLEMENT = 'premium'

/** Offering contenant $rc_monthly et $rc_annual. */
export const OFFERING = 'default'

let moduleSdk = null
let instance = null
let utilisateurConfigure = null

/** Charge le SDK une seule fois, à la demande. */
async function sdk() {
  if (!moduleSdk) moduleSdk = await import('@revenuecat/purchases-js')
  return moduleSdk
}

/**
 * Configure le SDK pour le compte connecté, ou le rebranche si l'utilisateur
 * a changé (déconnexion puis reconnexion dans le même onglet).
 *
 * `appUserId` est l'identifiant Supabase : c'est la clé de jointure avec la
 * table `abonnements`, et le webhook refuse tout ce qui n'est pas un UUID.
 */
export async function configurer(idUtilisateur) {
  if (!idUtilisateur) throw new Error('RevenueCat : identifiant de compte manquant')

  const { Purchases } = await sdk()

  if (!Purchases.isConfigured()) {
    instance = Purchases.configure({ apiKey: CLE_PUBLIQUE, appUserId: idUtilisateur })
    utilisateurConfigure = idUtilisateur
    return instance
  }

  instance = Purchases.getSharedInstance()
  if (utilisateurConfigure !== idUtilisateur) {
    await instance.changeUser(idUtilisateur)
    utilisateurConfigure = idUtilisateur
  }
  return instance
}

/**
 * Offering « default » et ses packages.
 *
 * On demande l'offering par son identifiant plutôt que de se contenter de
 * `current` : si un jour une expérimentation ou un ciblage change l'offering
 * courant, l'écran continue d'afficher celui que l'application connaît.
 * `current` reste le repli, pour ne jamais rendre une page vide.
 */
export async function chargerOffre(idUtilisateur, codePromo = null) {
  const purchases = await configurer(idUtilisateur)
  const offerings = await purchases.getOfferings({
    offeringIdentifier: OFFERING,
    // Transmis au catalogue, RevenueCat renvoie alors les produits assortis
    // de leur phase de remise. C'est ce qui permet d'afficher le prix
    // remisé AVANT d'ouvrir le tunnel de paiement.
    ...(codePromo ? { discountCode: codePromo } : {}),
  })
  return offerings.all?.[OFFERING] ?? offerings.current ?? null
}

/**
 * Ouvre le tunnel de paiement RevenueCat par-dessus la page.
 *
 * `customerEmail` évite de redemander une adresse que l'on connaît déjà ;
 * sans elle, RevenueCat la réclame dans son formulaire.
 */
export async function acheter({ idUtilisateur, paquet, email, acceptationCgv, codePromo }) {
  const purchases = await configurer(idUtilisateur)
  return purchases.purchase({
    rcPackage: paquet,
    customerEmail: email || undefined,
    selectedLocale: 'fr',
    defaultLocale: 'fr',
    // Propagée jusqu'à la transaction RevenueCat : la version des CGV
    // acceptée est ainsi horodatée par le prestataire de paiement, et non
    // par une déclaration de notre propre front.
    ...(acceptationCgv ? { metadata: { cgv_version: acceptationCgv } } : {}),
    // Le code saisi chez nous arrive déjà appliqué dans le tunnel. Le champ
    // natif de RevenueCat reste affiché : c'est lui qui fait foi sur la
    // validité, et il permet de corriger une faute de frappe sans repartir
    // en arrière.
    ...(codePromo ? { discountCode: codePromo } : {}),
    showDiscountCodeField: true,
  })
}

/** État côté RevenueCat, utile pour rattraper un webhook perdu. */
export async function infosClient(idUtilisateur) {
  const purchases = await configurer(idUtilisateur)
  return purchases.getCustomerInfo()
}

/** Le droit « premium » est-il actif dans le `customerInfo` renvoyé ? */
export function aDroitPremium(infos) {
  return Boolean(infos?.entitlements?.active?.[ENTITLEMENT])
}

/**
 * Fermeture du tunnel par le cavalier : ce n'est pas une erreur, et cela ne
 * doit donc pas afficher de bandeau rouge.
 */
export async function estAnnulationClient(erreur) {
  const { ErrorCode } = await sdk()
  return erreur?.errorCode === ErrorCode.UserCancelledError
}

/** Achat impossible parce que le compte est déjà abonné. */
export async function estDejaAbonne(erreur) {
  const { ErrorCode } = await sdk()
  return erreur?.errorCode === ErrorCode.ProductAlreadyPurchasedError
}

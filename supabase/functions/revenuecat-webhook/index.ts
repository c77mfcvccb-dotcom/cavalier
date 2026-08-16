/**
 * Webhook RevenueCat → table « abonnements ».
 *
 * C'est le seul chemin par lequel un compte devient premium. Le navigateur
 * n'écrit jamais cette table : aucune politique RLS ne le lui permet, et cette
 * fonction utilise la clé service_role, qui contourne le RLS. Le SDK
 * `@revenuecat/purchases-js` encaisse, mais ne donne aucun droit : un
 * `customerInfo` favorable ne vaut rien tant que cette fonction n'a pas écrit.
 *
 * Déploiement :
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 *   supabase secrets set REVENUECAT_SECRET_WEBHOOK=<valeur choisie>
 *
 * Puis, dans RevenueCat → Integrations → Webhooks, renseigner l'URL de la
 * fonction et la même valeur dans l'en-tête Authorization.
 *
 * --no-verify-jwt est nécessaire : RevenueCat n'envoie pas de JWT Supabase.
 * L'authentification repose donc entièrement sur le secret partagé ci-dessous.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SECRET = Deno.env.get('REVENUECAT_SECRET_WEBHOOK')
const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Droit vendu par l'application, tel que nommé dans RevenueCat. */
const ENTITLEMENT = 'premium'

/** Événements RevenueCat qui ouvrent l'accès, et ceux qui le ferment. */
const OUVRE = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
])
const FERME = new Set(['EXPIRATION'])

/**
 * Événements qui coupent le renouvellement sans couper le service : l'accès
 * court jusqu'à l'échéance déjà payée (statut « annule », voir 0007).
 *
 * BILLING_ISSUE en fait partie, et c'est un piège : RevenueCat l'émet dès
 * le premier échec de prélèvement, alors que l'abonnement est encore valide
 * — période payée non écoulée, ou délai de grâce en cours. Le traiter comme
 * une expiration fermait le carnet de santé à un abonné à jour, dont la
 * carte venait simplement d'expirer. C'est EXPIRATION qui met fin au
 * service, et la date fait foi dans tous les cas.
 */
const SURSIS = new Set(['CANCELLATION', 'BILLING_ISSUE'])

/** Identifiants produits RevenueCat → produits internes. */
const PRODUITS: Record<string, string> = {
  premium_mensuel: 'premium_mensuel',
  premium_annuel: 'premium_annuel',
}

/**
 * Identifiant produit de l'événement → clé de la table `abonnements`.
 *
 * Selon la boutique, RevenueCat suffixe l'identifiant par l'offre souscrite
 * (`produit:mensuel` sur Play, options d'abonnement sur Web Billing). La
 * colonne `produit` est contrainte aux deux valeurs internes : on tronque
 * donc au séparateur plutôt que d'écrire null et de perdre le libellé de la
 * formule dans l'écran de profil.
 */
function produitInterne(brut: string): string | null {
  return PRODUITS[brut] ?? PRODUITS[brut.split(':')[0]] ?? null
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return new Response('Méthode non autorisée', { status: 405 })
  }

  // Secret partagé : sans lui, n'importe qui pourrait s'offrir le premium
  // en appelant cette URL.
  if (!SECRET || requete.headers.get('Authorization') !== SECRET) {
    return new Response('Non autorisé', { status: 401 })
  }

  let corps: { event?: Record<string, unknown> }
  try {
    corps = await requete.json()
  } catch {
    return new Response('Corps illisible', { status: 400 })
  }

  const evenement = corps.event
  if (!evenement) return new Response('Événement absent', { status: 400 })

  const type = String(evenement.type ?? '')
  const profilId = String(evenement.app_user_id ?? '')
  const periodType = String(evenement.period_type ?? '')

  // Date de fin d'accès. Sur un échec de prélèvement, RevenueCat peut ouvrir
  // un délai de grâce qui court au-delà de l'échéance : c'est la plus
  // lointaine des deux dates qui borne réellement le service.
  const finAcces = Math.max(
    Number(evenement.expiration_at_ms ?? 0),
    Number(evenement.grace_period_expiration_at_ms ?? 0)
  )
  const expiration = finAcces > 0 ? new Date(finAcces).toISOString() : null

  // Portail client RevenueCat, d'où l'abonné résilie lui-même. Le nom du
  // champ a varié selon les versions de l'API : on accepte les deux, et on
  // conserve la valeur déjà en base si l'événement ne la porte pas.
  const urlGestion =
    (evenement.management_url as string | undefined) ??
    (evenement.managementURL as string | undefined) ??
    null

  // app_user_id doit être l'identifiant Supabase du compte : c'est celui que
  // le SDK Web Billing porte, `Purchases.configure({ appUserId })` étant
  // appelé avec l'identifiant du compte connecté.
  if (!/^[0-9a-f-]{36}$/i.test(profilId)) {
    return new Response('app_user_id inattendu', { status: 400 })
  }

  // L'application ne vend qu'un droit. Un futur produit hors « premium » ne
  // doit pas ouvrir le carnet de santé au passage. RevenueCat ne transmet pas
  // toujours ce champ (événements de résiliation notamment) : son absence ne
  // vaut donc pas refus.
  const droits = Array.isArray(evenement.entitlement_ids)
    ? (evenement.entitlement_ids as string[])
    : null
  if (droits && !droits.includes(ENTITLEMENT)) {
    return new Response('Droit hors périmètre', { status: 200 })
  }

  let statut: string
  if (OUVRE.has(type)) {
    statut = periodType === 'TRIAL' ? 'essai' : 'actif'
  } else if (FERME.has(type)) {
    statut = 'expire'
  } else if (SURSIS.has(type)) {
    // Renouvellement coupé, service maintenu jusqu'à `expire_le`.
    statut = 'annule'
  } else {
    // TRANSFER, SUBSCRIBER_ALIAS, TEST… : rien à faire, mais on répond 200
    // pour que RevenueCat cesse de réessayer.
    return new Response('Ignoré', { status: 200 })
  }

  const supabase = createClient(URL_SUPABASE, CLE_SERVICE, {
    auth: { persistSession: false },
  })

  // Comme pour l'URL de gestion : un identifiant produit absent ou inconnu ne
  // doit pas effacer la formule déjà connue, sans quoi l'écran de profil
  // afficherait « Premium » à un abonné dont on sait qu'il est à l'année.
  const produit = produitInterne(String(evenement.product_id ?? ''))

  const { error } = await supabase.from('abonnements').upsert(
    {
      profil_id: profilId,
      statut,
      expire_le: expiration,
      rc_app_user_id: profilId,
      ...(produit ? { produit } : {}),
      ...(urlGestion ? { url_gestion: urlGestion } : {}),
      maj_le: new Date().toISOString(),
    },
    { onConflict: 'profil_id' }
  )

  if (error) {
    console.error('Écriture de l’abonnement impossible', error)
    // 500 : RevenueCat réessaiera, ce qui est le comportement voulu.
    return new Response('Erreur base', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})

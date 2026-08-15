/**
 * Webhook RevenueCat → table « abonnements ».
 *
 * C'est le seul chemin par lequel un compte devient premium. Le navigateur
 * n'écrit jamais cette table : aucune politique RLS ne le lui permet, et cette
 * fonction utilise la clé service_role, qui contourne le RLS.
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

/** Événements RevenueCat qui ouvrent l'accès, et ceux qui le ferment. */
const OUVRE = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
])
const FERME = new Set(['EXPIRATION', 'BILLING_ISSUE'])

/** Identifiants produits RevenueCat → produits internes. */
const PRODUITS: Record<string, string> = {
  premium_mensuel: 'premium_mensuel',
  premium_annuel: 'premium_annuel',
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
  const expiration = evenement.expiration_at_ms
    ? new Date(Number(evenement.expiration_at_ms)).toISOString()
    : null

  // app_user_id doit être l'identifiant Supabase du compte : c'est ce que
  // l'écran d'abonnement transmet dans le lien d'achat.
  if (!/^[0-9a-f-]{36}$/i.test(profilId)) {
    return new Response('app_user_id inattendu', { status: 400 })
  }

  let statut: string
  if (OUVRE.has(type)) {
    statut = periodType === 'TRIAL' ? 'essai' : 'actif'
  } else if (FERME.has(type)) {
    statut = 'expire'
  } else if (type === 'CANCELLATION') {
    // Résiliation : l'accès court jusqu'à l'échéance déjà payée.
    statut = 'annule'
  } else {
    // TRANSFER, SUBSCRIBER_ALIAS, TEST… : rien à faire, mais on répond 200
    // pour que RevenueCat cesse de réessayer.
    return new Response('Ignoré', { status: 200 })
  }

  const supabase = createClient(URL_SUPABASE, CLE_SERVICE, {
    auth: { persistSession: false },
  })

  const { error } = await supabase.from('abonnements').upsert(
    {
      profil_id: profilId,
      statut,
      produit: PRODUITS[String(evenement.product_id ?? '')] ?? null,
      expire_le: expiration,
      rc_app_user_id: profilId,
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

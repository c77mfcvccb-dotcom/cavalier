import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, configurationManquante } from '../lib/supabase'

const AuthContexte = createContext(null)

/**
 * Miroir local de est_premium() en SQL : la date prime sur le statut.
 * « annule » compte encore : la période déjà payée est due, l'accès ne
 * s'arrête qu'à l'échéance.
 */
function abonnementActif(abonnement) {
  if (!abonnement) return false
  if (!['actif', 'essai', 'annule'].includes(abonnement.statut)) return false
  return !abonnement.expire_le || new Date(abonnement.expire_le) > new Date()
}

export function FournisseurAuth({ children }) {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null)
  const [abonnement, setAbonnement] = useState(null)
  const [chargement, setChargement] = useState(true)

  const chargerAbonnement = useCallback(async (utilisateur) => {
    if (!utilisateur) {
      setAbonnement(null)
      return
    }
    // La table n'est jamais écrite depuis ici : seul le webhook RevenueCat
    // y touche, via la clé service_role.
    const { data } = await supabase
      .from('abonnements')
      .select('statut, produit, expire_le, url_gestion')
      .eq('profil_id', utilisateur.id)
      .maybeSingle()
    setAbonnement(data ?? null)
  }, [])

  const chargerProfil = useCallback(async (utilisateur) => {
    if (!utilisateur) {
      setProfil(null)
      return
    }
    const { data, error } = await supabase
      .from('profils')
      .select('*')
      .eq('id', utilisateur.id)
      .maybeSingle()

    if (error) {
      console.error('Chargement du profil impossible', error)
      setProfil(null)
      return
    }

    // Filet de sécurité si le trigger d'inscription n'a pas encore tourné
    // (cas d'une connexion Google en tout premier accès).
    if (!data) {
      const { data: cree } = await supabase
        .from('profils')
        .insert({
          id: utilisateur.id,
          type_compte: utilisateur.user_metadata?.type_compte || 'cavalier',
          nom:
            utilisateur.user_metadata?.nom ||
            utilisateur.user_metadata?.full_name ||
            utilisateur.email?.split('@')[0] ||
            '',
        })
        .select()
        .single()
      setProfil(cree ?? null)
      return
    }

    setProfil(data)
  }, [])

  useEffect(() => {
    if (configurationManquante) {
      setChargement(false)
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await Promise.all([chargerProfil(data.session?.user), chargerAbonnement(data.session?.user)])
      setChargement(false)
    })

    const { data: ecoute } = supabase.auth.onAuthStateChange(async (_evenement, nouvelle) => {
      setSession(nouvelle)
      await Promise.all([chargerProfil(nouvelle?.user), chargerAbonnement(nouvelle?.user)])
      setChargement(false)
    })

    return () => ecoute.subscription.unsubscribe()
  }, [chargerProfil, chargerAbonnement])

  const valeur = useMemo(
    () => ({
      session,
      utilisateur: session?.user ?? null,
      profil,
      chargement,
      estClub: profil?.type_compte === 'club',
      abonnement,
      estPremium: abonnementActif(abonnement),
      rafraichirProfil: () => chargerProfil(session?.user),
      // Après un retour de RevenueCat, le webhook peut n'avoir pas encore
      // écrit : l'écran d'abonnement rappelle cette fonction en boucle courte.
      rafraichirAbonnement: () => chargerAbonnement(session?.user),

      async inscription({ email, motDePasse, nom, typeCompte }) {
        const { error } = await supabase.auth.signUp({
          email,
          password: motDePasse,
          options: { data: { nom, type_compte: typeCompte } },
        })
        if (error) throw error
      },

      async connexion({ email, motDePasse }) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: motDePasse,
        })
        if (error) throw error
      },

      async connexionGoogle(typeCompte) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            queryParams: { prompt: 'select_account' },
            data: typeCompte ? { type_compte: typeCompte } : undefined,
          },
        })
        if (error) throw error
      },

      async deconnexion() {
        await supabase.auth.signOut()
        setProfil(null)
        setAbonnement(null)
      },
    }),
    [session, profil, abonnement, chargement, chargerProfil, chargerAbonnement]
  )

  return <AuthContexte.Provider value={valeur}>{children}</AuthContexte.Provider>
}

export function useAuth() {
  const contexte = useContext(AuthContexte)
  if (!contexte) throw new Error("useAuth doit être utilisé dans un FournisseurAuth")
  return contexte
}

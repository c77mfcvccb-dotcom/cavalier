import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, configurationManquante } from '../lib/supabase'

const AuthContexte = createContext(null)

export function FournisseurAuth({ children }) {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null)
  const [chargement, setChargement] = useState(true)

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
      await chargerProfil(data.session?.user)
      setChargement(false)
    })

    const { data: abonnement } = supabase.auth.onAuthStateChange(async (_evenement, nouvelle) => {
      setSession(nouvelle)
      await chargerProfil(nouvelle?.user)
      setChargement(false)
    })

    return () => abonnement.subscription.unsubscribe()
  }, [chargerProfil])

  const valeur = useMemo(
    () => ({
      session,
      utilisateur: session?.user ?? null,
      profil,
      chargement,
      estClub: profil?.type_compte === 'club',
      rafraichirProfil: () => chargerProfil(session?.user),

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
      },
    }),
    [session, profil, chargement, chargerProfil]
  )

  return <AuthContexte.Provider value={valeur}>{children}</AuthContexte.Provider>
}

export function useAuth() {
  const contexte = useContext(AuthContexte)
  if (!contexte) throw new Error("useAuth doit être utilisé dans un FournisseurAuth")
  return contexte
}

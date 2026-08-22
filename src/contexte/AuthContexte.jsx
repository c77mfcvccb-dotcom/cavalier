import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, configurationManquante } from '../lib/supabase'
import { cloreRecuperation, ouvrirRecuperation, recuperationEnCours } from '../lib/recuperation'

const AuthContexte = createContext(null)

/** Type de compte choisi avant une redirection OAuth, le temps de l'aller-retour. */
const CLE_TYPE_COMPTE = 'licol.type-compte-souhaite'

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
  const [adhesions, setAdhesions] = useState([])
  const [chargement, setChargement] = useState(true)
  // Lu dès le premier rendu : le drapeau est posé à l'import, donc déjà là.
  const [recuperation, setRecuperation] = useState(recuperationEnCours)

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

  // Les adhésions aux écuries (migration 0018) : c'est par elles qu'un
  // cavalier gratuit peut avoir le premium sur le périmètre de son club.
  // Une erreur — migration pas encore exécutée, réseau — vaut « aucune » :
  // l'application retombe sur le plan du compte, jamais sur un écran cassé.
  const chargerAdhesions = useCallback(async (utilisateur) => {
    if (!utilisateur) {
      setAdhesions([])
      return
    }
    const { data, error } = await supabase.rpc('mes_adhesions')
    setAdhesions(error ? [] : (data ?? []))
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
          type_compte:
            utilisateur.user_metadata?.type_compte ||
            localStorage.getItem(CLE_TYPE_COMPTE) ||
            'cavalier',
          nom:
            utilisateur.user_metadata?.nom ||
            utilisateur.user_metadata?.full_name ||
            utilisateur.email?.split('@')[0] ||
            '',
        })
        .select()
        .single()
      // Consommée une seule fois : sans cela, un club qui se reconnecte
      // plus tard avec un autre compte hériterait de l'ancien choix.
      localStorage.removeItem(CLE_TYPE_COMPTE)
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
      await Promise.all([
        chargerProfil(data.session?.user),
        chargerAbonnement(data.session?.user),
        chargerAdhesions(data.session?.user),
      ])
      setChargement(false)
    })

    const { data: ecoute } = supabase.auth.onAuthStateChange(async (evenement, nouvelle) => {
      // Seconde détection, complémentaire de la lecture d'URL : elle attrape
      // les flots où le jeton ne passe pas par le fragment. Elle ne peut pas
      // s'y substituer — l'écoute est posée après le montage, et l'événement
      // peut avoir déjà été émis.
      if (evenement === 'PASSWORD_RECOVERY') {
        ouvrirRecuperation()
        setRecuperation(true)
      }
      setSession(nouvelle)
      await Promise.all([
        chargerProfil(nouvelle?.user),
        chargerAbonnement(nouvelle?.user),
        chargerAdhesions(nouvelle?.user),
      ])
      setChargement(false)
    })

    return () => ecoute.subscription.unsubscribe()
  }, [chargerProfil, chargerAbonnement, chargerAdhesions])

  const valeur = useMemo(
    () => ({
      session,
      utilisateur: session?.user ?? null,
      profil,
      chargement,
      estClub: profil?.type_compte === 'club',
      recuperation,
      abonnement,
      estPremium: abonnementActif(abonnement),
      adhesions,
      rafraichirProfil: () => chargerProfil(session?.user),
      // Après un retour de RevenueCat, le webhook peut n'avoir pas encore
      // écrit : l'écran d'abonnement rappelle cette fonction en boucle courte.
      rafraichirAbonnement: () => chargerAbonnement(session?.user),
      rafraichirAdhesions: () => chargerAdhesions(session?.user),

      /**
       * `versionCgv` conserve la trace de l'acceptation : sans elle, une case
       * cochée ne prouve rien une fois la page fermée. Elle vit dans les
       * métadonnées du compte, ce qui évite une colonne et une migration.
       */
      async inscription({ email, motDePasse, nom, typeCompte, versionCgv }) {
        const { error } = await supabase.auth.signUp({
          email,
          password: motDePasse,
          options: {
            data: {
              nom,
              type_compte: typeCompte,
              cgv_version: versionCgv ?? null,
              cgv_acceptees_le: versionCgv ? new Date().toISOString() : null,
            },
          },
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
        // `options.data` n'existe PAS sur signInWithOAuth : c'est une option
        // de signUp, silencieusement ignorée ici. Le type de compte choisi à
        // l'inscription était donc perdu, et tout compte Google atterrissait
        // en « cavalier », y compris un club.
        //
        // Il n'y a pas de canal pour transporter une métadonnée à travers la
        // redirection OAuth : on la met de côté localement, et le repli de
        // création de profil la relit au retour.
        if (typeCompte) localStorage.setItem(CLE_TYPE_COMPTE, typeCompte)

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            // Doit figurer dans Supabase → Authentication → URL Configuration
            // → Redirect URLs, sinon Supabase refuse la redirection retour.
            redirectTo: window.location.origin,
            queryParams: { prompt: 'select_account' },
          },
        })
        if (error) throw error
      },

      /**
       * Connexion sans mot de passe, par lien reçu par email. `shouldCreateUser`
       * à false : cet écran sert à se connecter à un compte existant, la
       * création passe par /inscription, qui pose le type de compte
       * (cavalier ou club) avant tout — un compte créé ici en serait dépourvu.
       */
      async connexionMagicLien(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            // Doit figurer dans Supabase → Authentication → URL Configuration
            // → Redirect URLs, sinon le lien du mail retombe sur la Site URL.
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
      },

      /**
       * Supabase répond 200 que l'adresse existe ou non : c'est voulu, et
       * l'écran appelant affiche le même message dans les deux cas. Une
       * erreur remontée ici est donc une panne réelle, jamais un « compte
       * inconnu » — la distinguer ne révèle rien.
       */
      async demanderReinitialisation(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Doit figurer dans Supabase → Authentication → URL Configuration
          // → Redirect URLs, sinon le lien du mail retombe sur la Site URL.
          redirectTo: `${window.location.origin}/reinitialisation`,
        })
        if (error) throw error
      },

      /** Sur la session ouverte par le lien de réinitialisation, ou sur la sienne. */
      async definirMotDePasse(motDePasse) {
        const { error } = await supabase.auth.updateUser({ password: motDePasse })
        if (error) throw error
        // Le mot de passe est posé : plus rien à retenir, l'application peut
        // reprendre son cours normal.
        cloreRecuperation()
        setRecuperation(false)
      },

      /** Sortie de la récupération sans avoir changé de mot de passe. */
      abandonnerRecuperation() {
        cloreRecuperation()
        setRecuperation(false)
      },

      async deconnexion() {
        await supabase.auth.signOut()
        cloreRecuperation()
        setRecuperation(false)
        setProfil(null)
        setAbonnement(null)
        setAdhesions([])
      },
    }),
    [session, profil, abonnement, adhesions, chargement, recuperation, chargerProfil, chargerAbonnement, chargerAdhesions]
  )

  return <AuthContexte.Provider value={valeur}>{children}</AuthContexte.Provider>
}

export function useAuth() {
  const contexte = useContext(AuthContexte)
  if (!contexte) throw new Error("useAuth doit être utilisé dans un FournisseurAuth")
  return contexte
}

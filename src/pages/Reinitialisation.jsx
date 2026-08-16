import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Chargement, Erreur } from '../composants/Ui'
import PiedDePage from '../composants/PiedDePage'

/**
 * Supabase renvoie ses refus dans l'URL, tantôt en fragment (flot implicite),
 * tantôt en paramètres de requête. On lit les deux plutôt que de parier sur
 * la configuration du projet.
 */
function problemeDansUrl() {
  const fragment = new URLSearchParams(
    window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  )
  const requete = new URLSearchParams(window.location.search)
  const code = fragment.get('error_code') || requete.get('error_code')
  const erreur = fragment.get('error') || requete.get('error')
  if (!code && !erreur) return null
  return code === 'otp_expired' ? 'expire' : 'invalide'
}

const MESSAGES = {
  expire: 'Ce lien de réinitialisation a expiré. Les liens ne sont valables qu’une heure.',
  invalide:
    'Ce lien n’est plus valable. Il a peut-être déjà servi : un lien de réinitialisation ne fonctionne qu’une seule fois.',
}

export default function Reinitialisation() {
  const { session, definirMotDePasse } = useAuth()
  const navigate = useNavigate()

  const [probleme, setProbleme] = useState(problemeDansUrl)
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Le SDK consomme le jeton du lien au chargement ; l'absence de session
  // n'est concluante qu'une fois ce traitement passé. Sans ce délai, un
  // lien parfaitement valide s'annoncerait périmé le temps d'un battement.
  useEffect(() => {
    if (probleme || session) return
    const minuterie = setTimeout(() => setProbleme('invalide'), 2500)
    return () => clearTimeout(minuterie)
  }, [probleme, session])

  async function surSoumission(evenement) {
    evenement.preventDefault()
    setErreur('')

    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques')
      return
    }

    setEnvoi(true)
    try {
      await definirMotDePasse(motDePasse)
      // La session ouverte par le lien devient une session ordinaire :
      // inutile de repasser par l'écran de connexion.
      navigate('/', { replace: true })
    } catch (e) {
      const message = e.message || ''
      if (/session|expired|invalid/i.test(message) && !/different/i.test(message)) {
        setProbleme('invalide')
      } else if (/different/i.test(message)) {
        setErreur('Choisissez un mot de passe différent de l’ancien')
      } else {
        setErreur(message || 'Modification impossible')
      }
      setEnvoi(false)
    }
  }

  if (probleme) {
    return (
      <div className="ecran-auth">
        <div className="marque">
          <img src="/logo.svg" alt="" />
          <h1>Lien inutilisable</h1>
        </div>

        <div className="erreur">{MESSAGES[probleme]}</div>

        <Link to="/mot-de-passe-oublie" className="bouton pleine-largeur">
          Demander un nouveau lien
        </Link>

        <p className="centre doux" style={{ marginTop: 22 }}>
          <Link to="/connexion" className="gras">‹ Retour à la connexion</Link>
        </p>

        <PiedDePage />
      </div>
    )
  }

  if (!session) return <Chargement texte="Vérification du lien…" />

  return (
    <div className="ecran-auth">
      <div className="marque">
        <img src="/logo.svg" alt="" />
        <h1>Nouveau mot de passe</h1>
      </div>

      <form onSubmit={surSoumission}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Nouveau mot de passe" aide="8 caractères minimum">
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="new-password"
            autoFocus
            required
          />
        </Champ>

        <Champ label="Confirmer le mot de passe">
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer et me connecter'}
        </button>
      </form>

      <PiedDePage />
    </div>
  )
}

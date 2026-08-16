import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Erreur } from '../composants/Ui'
import PiedDePage from '../composants/PiedDePage'

/**
 * Le message de confirmation est le même que l'adresse existe ou non.
 * Répondre « aucun compte avec cet email » transformerait cet écran en
 * annuaire : n'importe qui pourrait y tester une adresse pour savoir si son
 * propriétaire est inscrit. Supabase suit la même règle côté serveur.
 */
export default function MotDePasseOublie() {
  const { demanderReinitialisation } = useAuth()
  const [email, setEmail] = useState('')
  const [envoye, setEnvoye] = useState(false)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function surSoumission(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)
    try {
      await demanderReinitialisation(email.trim())
      setEnvoye(true)
    } catch (e) {
      const message = e.message || ''
      // Supabase ne distingue pas une adresse inconnue ; si une version le
      // faisait, la remonter telle quelle rendrait cet écran bavard. On la
      // ramène au message neutre.
      if (/user not found|not_found/i.test(message)) {
        setEnvoye(true)
      } else if (e.status === 429 || /security purposes|rate limit/i.test(message)) {
        setErreur('Trop de demandes en peu de temps. Réessayez dans quelques minutes.')
      } else {
        // Le reste est une panne réelle : le taire ferait attendre un mail
        // qui ne partira pas.
        setErreur('Envoi impossible pour le moment. Vérifiez votre connexion et réessayez.')
      }
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="ecran-auth">
      <div className="marque">
        <img src="/logo.svg" alt="" />
        <h1>Mot de passe oublié</h1>
      </div>

      {envoye ? (
        <>
          <div className="succes">
            Si un compte existe avec cette adresse, un email a été envoyé.
          </div>

          <div className="carte">
            <p className="doux">
              Le lien reçu est valable une heure et ne sert qu'une fois. S'il
              n'arrive pas, regardez dans les indésirables, puis vérifiez
              l'adresse saisie.
            </p>
          </div>

          <button
            type="button"
            className="bouton secondaire pleine-largeur"
            style={{ marginTop: 16 }}
            onClick={() => setEnvoye(false)}
          >
            Renvoyer un email
          </button>
        </>
      ) : (
        <form onSubmit={surSoumission}>
          <Erreur>{erreur}</Erreur>

          <p className="doux" style={{ marginBottom: 16 }}>
            Indiquez l'adresse de votre compte : vous recevrez un lien pour
            choisir un nouveau mot de passe.
          </p>

          <Champ label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </Champ>

          <button className="bouton pleine-largeur" disabled={envoi}>
            {envoi ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
      )}

      {/* Un compte créé avec Google n'a pas de mot de passe : le lien de
          réinitialisation existerait mais ne servirait à rien tant que
          l'intéressé cherche à se connecter comme avant. */}
      <div className="carte" style={{ marginTop: 22 }}>
        <p className="doux">
          <strong>Compte créé avec Google ?</strong> Vous n'avez pas de mot de
          passe à récupérer : revenez à l'écran de connexion et utilisez{' '}
          <em>Continuer avec Google</em>.
        </p>
      </div>

      <p className="centre doux" style={{ marginTop: 22 }}>
        <Link to="/connexion" className="gras">‹ Retour à la connexion</Link>
      </p>

      <PiedDePage />
    </div>
  )
}

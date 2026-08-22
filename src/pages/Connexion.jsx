import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Erreur } from '../composants/Ui'
import PiedDePage from '../composants/PiedDePage'

export default function Connexion() {
  const { connexion, connexionGoogle, connexionMagicLien } = useAuth()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [envoiLien, setEnvoiLien] = useState(false)
  const [lienEnvoye, setLienEnvoye] = useState(false)

  async function surSoumission(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)
    try {
      await connexion({ email: email.trim(), motDePasse })
    } catch (e) {
      setErreur(
        e.message?.includes('Invalid login')
          ? 'Email ou mot de passe incorrect'
          : e.message || 'Connexion impossible'
      )
      setEnvoi(false)
    }
  }

  async function surLienMagique() {
    if (!email.trim()) {
      setErreur('Indiquez votre email ci-dessus pour recevoir le lien.')
      return
    }
    setErreur('')
    setEnvoiLien(true)
    try {
      await connexionMagicLien(email.trim())
      setLienEnvoye(true)
    } catch (e) {
      const message = e.message || ''
      setErreur(
        /not found|not allowed|signups/i.test(message)
          ? "Aucun compte avec cet email. Créez-en un d'abord."
          : message || 'Envoi du lien impossible'
      )
    } finally {
      setEnvoiLien(false)
    }
  }

  return (
    <div className="ecran-auth">
      <div className="marque">
        <img src="/logo.svg" alt="" />
        <h1>Licol</h1>
        <p>Le carnet partagé de votre cheval.</p>
      </div>

      <form onSubmit={surSoumission}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Champ>

        <Champ label="Mot de passe">
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Champ>

        {/* Sous le champ concerné, là où l'oubli se constate — et non en bas
            de page, après le bouton, où il faudrait le chercher. */}
        <p className="ligne-oubli">
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </p>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="separateur">ou</div>

      <button
        className="bouton secondaire pleine-largeur"
        onClick={async () => {
          // Sans ce rattrapage, un provider Google désactivé ou mal
          // configuré rejetait la promesse dans le vide : le bouton
          // semblait ne rien faire.
          try {
            await connexionGoogle()
          } catch (e) {
            setErreur(e.message || 'Connexion Google impossible')
          }
        }}
      >
        Continuer avec Google
      </button>

      {lienEnvoye ? (
        <div className="succes" style={{ marginTop: 12 }}>
          Lien envoyé à {email.trim()}. Ouvrez-le depuis votre boîte mail pour
          vous connecter — pas besoin de mot de passe.
        </div>
      ) : (
        <button
          type="button"
          className="bouton secondaire pleine-largeur"
          style={{ marginTop: 12 }}
          disabled={envoiLien}
          onClick={surLienMagique}
        >
          {envoiLien ? 'Envoi…' : 'Recevoir un lien de connexion par email'}
        </button>
      )}

      <p className="centre doux" style={{ marginTop: 22 }}>
        Pas encore de compte ? <Link to="/inscription" className="gras">Créer un compte</Link>
      </p>

      <PiedDePage />
    </div>
  )
}

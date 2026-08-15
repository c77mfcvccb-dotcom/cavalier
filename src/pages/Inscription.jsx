import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Erreur, Succes } from '../composants/Ui'

export default function Inscription() {
  const { inscription, connexionGoogle } = useAuth()
  const [etape, setEtape] = useState(1)
  const [typeCompte, setTypeCompte] = useState('cavalier')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function surSoumission(evenement) {
    evenement.preventDefault()
    setErreur('')
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    setEnvoi(true)
    try {
      await inscription({ email: email.trim(), motDePasse, nom: nom.trim(), typeCompte })
      // Si la confirmation par email est activée, aucune session n'est ouverte.
      setMessage('Compte créé. Vérifiez votre boîte mail si une confirmation vous est demandée.')
    } catch (e) {
      setErreur(
        e.message?.includes('already registered')
          ? 'Un compte existe déjà avec cet email'
          : e.message || 'Inscription impossible'
      )
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="ecran-auth">
      <div className="marque">
        <img src="/icone.svg" alt="" />
        <h1>Créer un compte</h1>
      </div>

      <Erreur>{erreur}</Erreur>
      <Succes>{message}</Succes>

      {etape === 1 ? (
        <>
          <p className="doux" style={{ marginBottom: 14 }}>Vous êtes…</p>

          <div className="choix-compte">
            <button
              type="button"
              className={typeCompte === 'cavalier' ? 'actif' : undefined}
              onClick={() => setTypeCompte('cavalier')}
            >
              <span className="emoji">🧑‍🌾</span>
              <span>
                <span className="titre">Cavalier</span>
                <span className="desc">
                  Mes chevaux, ma demi-pension partagée, le suivi de leur santé
                </span>
              </span>
            </button>

            <button
              type="button"
              className={typeCompte === 'club' ? 'actif' : undefined}
              onClick={() => setTypeCompte('club')}
            >
              <span className="emoji">🏇</span>
              <span>
                <span className="titre">Club / écurie</span>
                <span className="desc">
                  Piloter ma cavalerie, les soins et le planning de mes cavaliers
                </span>
              </span>
            </button>
          </div>

          <button className="bouton pleine-largeur" onClick={() => setEtape(2)}>
            Continuer
          </button>
        </>
      ) : (
        <form onSubmit={surSoumission}>
          <Champ label={typeCompte === 'club' ? 'Nom du club' : 'Votre nom'}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </Champ>

          <Champ label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Champ>

          <Champ label="Mot de passe" aide="8 caractères minimum">
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Champ>

          <button className="bouton pleine-largeur" disabled={envoi}>
            {envoi ? 'Création…' : 'Créer mon compte'}
          </button>

          <div className="separateur">ou</div>

          <button
            type="button"
            className="bouton secondaire pleine-largeur"
            onClick={() => connexionGoogle(typeCompte)}
          >
            Continuer avec Google
          </button>

          <button
            type="button"
            className="bouton fantome pleine-largeur"
            style={{ marginTop: 10 }}
            onClick={() => setEtape(1)}
          >
            ‹ Changer de type de compte
          </button>
        </form>
      )}

      <p className="centre doux" style={{ marginTop: 22 }}>
        Déjà inscrit ? <Link to="/connexion" className="gras">Se connecter</Link>
      </p>
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Erreur, Succes } from '../composants/Ui'
import PiedDePage from '../composants/PiedDePage'
import { VERSION_CGV } from '../lib/legal'

export default function Inscription() {
  const { inscription, connexionGoogle } = useAuth()
  const [etape, setEtape] = useState(1)
  const [typeCompte, setTypeCompte] = useState('cavalier')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [cgvAcceptees, setCgvAcceptees] = useState(false)
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
    if (!cgvAcceptees) {
      setErreur('Vous devez accepter les conditions générales pour créer un compte')
      return
    }

    setEnvoi(true)
    try {
      // Posé AVANT la création : dès que la session s'ouvre, le routeur
      // bascule en mode connecté et ce composant disparaît — le drapeau
      // fait alors rediriger l'accueil vers « Rejoindre une écurie ».
      if (typeCompte === 'cavalier') sessionStorage.setItem('licol.bienvenue', '1')
      await inscription({
        email: email.trim(),
        motDePasse,
        nom: nom.trim(),
        typeCompte,
        versionCgv: VERSION_CGV,
      })
      // Si la confirmation par email est activée, aucune session n'est ouverte.
      setMessage('Compte créé. Vérifiez votre boîte mail si une confirmation vous est demandée.')
    } catch (e) {
      sessionStorage.removeItem('licol.bienvenue')
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
        <img src="/logo.svg" alt="" />
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

          {/* Case décochée par défaut et distincte de toute autre : une
              acceptation pré-cochée ou noyée dans un paragraphe ne vaut pas
              consentement. Elle conditionne les deux voies d'inscription. */}
          <label className="case-acceptation">
            <input
              type="checkbox"
              checked={cgvAcceptees}
              onChange={(e) => setCgvAcceptees(e.target.checked)}
            />
            <span>
              J’ai lu et j’accepte les{' '}
              <Link to="/cgv" target="_blank" rel="noopener noreferrer">
                conditions générales
              </Link>{' '}
              et la{' '}
              <Link to="/confidentialite" target="_blank" rel="noopener noreferrer">
                politique de confidentialité
              </Link>
              .
            </span>
          </label>

          <button className="bouton pleine-largeur" disabled={envoi || !cgvAcceptees}>
            {envoi ? 'Création…' : 'Créer mon compte'}
          </button>

          <div className="separateur">ou</div>

          <button
            type="button"
            className="bouton secondaire pleine-largeur"
            disabled={!cgvAcceptees}
            onClick={async () => {
              try {
                // Même drapeau que la voie email : il survit à l'aller-retour
                // OAuth (sessionStorage est propre à l'onglet) et l'accueil
                // proposera le code d'écurie au retour.
                if (typeCompte === 'cavalier') sessionStorage.setItem('licol.bienvenue', '1')
                await connexionGoogle(typeCompte)
              } catch (e) {
                sessionStorage.removeItem('licol.bienvenue')
                setErreur(e.message || 'Connexion Google impossible')
              }
            }}
          >
            Continuer avec Google
          </button>

          {!cgvAcceptees && (
            <p className="aide centre" style={{ marginTop: 8 }}>
              Cochez la case ci-dessus pour continuer.
            </p>
          )}

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

      <PiedDePage />
    </div>
  )
}

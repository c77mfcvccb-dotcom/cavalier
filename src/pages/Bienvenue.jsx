import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import CodeClub from '../composants/CodeClub'

/** Le drapeau posé par l'inscription : « ce compte cavalier vient de naître ». */
export const CLE_BIENVENUE = 'licol.bienvenue'

/**
 * La première question posée à un compte cavalier tout neuf : par où
 * commencer ? Deux portes d'entrée équivalentes — créer son propre cheval,
 * ou rejoindre une écurie avec le code qu'elle a transmis — plutôt qu'un
 * choix imposé, car les deux publics (propriétaire isolé, pensionnaire
 * envoyé par son club) sont aussi fréquents l'un que l'autre.
 *
 * L'écran vit dans l'arbre CONNECTÉ (l'inscription ouvre une session, qui
 * fait basculer le routeur) : l'inscription pose un drapeau, l'accueil y
 * redirige une seule fois, et chaque porte sort sans insister — les deux
 * chemins restent possibles plus tard, depuis l'onglet Club ou Chevaux.
 */
export default function Bienvenue() {
  const { profil, estClub } = useAuth()
  const navigate = useNavigate()
  const [rejoint, setRejoint] = useState(null)
  const [etape, setEtape] = useState('choix')

  // Une seule visite : le drapeau tombe dès l'arrivée, pour que la barre
  // du bas et l'accueil redeviennent immédiatement navigables.
  useEffect(() => {
    sessionStorage.removeItem(CLE_BIENVENUE)
  }, [])

  // Un club n'a rien à faire ici — il distribue les codes, il n'en saisit pas.
  if (estClub) return <Navigate to="/" replace />

  return (
    <main className="contenu" style={{ paddingTop: 40 }}>
      <div className="marque" style={{ textAlign: 'center', marginBottom: 6 }}>
        <img src="/logo.svg" alt="" style={{ width: 56, margin: '0 auto 10px' }} />
        <h1 style={{ fontSize: '1.5rem' }}>
          Bienvenue{profil?.nom ? `, ${profil.nom}` : ''} !
        </h1>
      </div>

      {etape === 'choix' && (
        <>
          <p className="doux centre" style={{ marginBottom: 22 }}>
            Par où commencer ? Ajoutez votre propre cheval, ou rejoignez une
            écurie avec le code d'adhésion qu'elle vous a transmis.
          </p>

          <button
            className="bouton pleine-largeur"
            onClick={() => navigate('/chevaux/nouveau')}
          >
            Créer mon premier cheval
          </button>

          <button
            className="bouton secondaire pleine-largeur"
            style={{ marginTop: 12 }}
            onClick={() => setEtape('code')}
          >
            J'ai un code d'invitation
          </button>

          <button
            className="bouton fantome pleine-largeur"
            style={{ marginTop: 12 }}
            onClick={() => navigate('/', { replace: true })}
          >
            Plus tard
          </button>
        </>
      )}

      {etape === 'code' && (
        <>
          <p className="doux centre" style={{ marginBottom: 18 }}>
            Saisissez le code d'adhésion : vous verrez les cours de l'écurie,
            vos chevaux attribués, et l'accès qu'elle offre.
          </p>

          <div className="carte">
            <CodeClub onRejoint={setRejoint} />
          </div>

          {rejoint ? (
            <button
              className="bouton pleine-largeur"
              style={{ marginTop: 16 }}
              onClick={() => navigate('/', { replace: true })}
            >
              C'est parti →
            </button>
          ) : (
            <button
              className="bouton fantome pleine-largeur"
              style={{ marginTop: 16 }}
              onClick={() => setEtape('choix')}
            >
              ‹ Retour
            </button>
          )}
        </>
      )}

      <p className="aide centre" style={{ marginTop: 10 }}>
        Vous pourrez faire tout cela plus tard, depuis l'onglet Club ou Chevaux.
      </p>
    </main>
  )
}

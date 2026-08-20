import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import CodeClub from '../composants/CodeClub'

/** Le drapeau posé par l'inscription : « ce compte cavalier vient de naître ». */
export const CLE_BIENVENUE = 'licol.bienvenue'

/**
 * La première question posée à un compte cavalier tout neuf : avez-vous un
 * code d'écurie ? La plupart des cavaliers arrivent envoyés par leur club —
 * autant brancher l'adhésion avant même le premier écran, plutôt que
 * d'espérer qu'ils trouvent « Mon club » tout seuls.
 *
 * L'écran vit dans l'arbre CONNECTÉ (l'inscription ouvre une session, qui
 * fait basculer le routeur) : l'inscription pose un drapeau, l'accueil y
 * redirige une seule fois, et « Je n'ai pas de code » sort sans insister —
 * l'adhésion reste possible plus tard depuis l'onglet Club.
 */
export default function Bienvenue() {
  const { profil, estClub } = useAuth()
  const navigate = useNavigate()
  const [rejoint, setRejoint] = useState(null)

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
        <h1 style={{ fontSize: '1.5rem' }}>Rejoindre une écurie</h1>
      </div>

      <p className="doux centre" style={{ marginBottom: 18 }}>
        Bienvenue{profil?.nom ? ` ${profil.nom}` : ''} ! Votre écurie vous a
        transmis un code d'adhésion ? Saisissez-le maintenant : vous verrez
        ses cours, vos chevaux attribués, et l'accès qu'elle offre.
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
          onClick={() => navigate('/', { replace: true })}
        >
          Je n'ai pas de code
        </button>
      )}

      <p className="aide centre" style={{ marginTop: 10 }}>
        Vous pourrez rejoindre une écurie plus tard, depuis l'onglet Club.
      </p>
    </main>
  )
}

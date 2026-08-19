import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import Cloche from './Cloche'

/**
 * Onglets de la barre du bas.
 *
 * Six entrées est la limite absolue sur un écran de téléphone, et elle ne
 * se paie qu'avec des libellés courts : « Agenda » plutôt que
 * « Calendrier », « Club » plutôt que « Mon club ».
 *
 * Les cours ont leur onglet des deux côtés — c'est le cœur du produit
 * club — et les dépenses sortent de la barre : elles restent accessibles
 * depuis le Profil et depuis la fiche de chaque cheval, mais un suivi de
 * budget n'a pas à occuper une place de premier plan.
 */
const ONGLETS_CAVALIER = [
  { to: '/', icone: '🏠', libelle: 'Accueil' },
  { to: '/chevaux', icone: '🐴', libelle: 'Chevaux' },
  { to: '/calendrier', icone: '📅', libelle: 'Agenda' },
  { to: '/cours', icone: '🎓', libelle: 'Cours' },
  { to: '/club', icone: '🏇', libelle: 'Club' },
  { to: '/profil', icone: '👤', libelle: 'Profil' },
]

const ONGLETS_CLUB = [
  { to: '/', icone: '🐴', libelle: 'Chevaux' },
  { to: '/club', icone: '👥', libelle: 'Cavaliers' },
  { to: '/sante', icone: '🩺', libelle: 'Santé' },
  { to: '/planning', icone: '📅', libelle: 'Planning' },
  { to: '/cours', icone: '🎓', libelle: 'Cours' },
  { to: '/profil', icone: '👤', libelle: 'Profil' },
]

export function NavBas() {
  const { estClub } = useAuth()
  const onglets = estClub ? ONGLETS_CLUB : ONGLETS_CAVALIER

  return (
    <nav className="nav-bas">
      {onglets.map((onglet) => (
        <NavLink
          key={onglet.to}
          to={onglet.to}
          end={onglet.to === '/'}
          className={({ isActive }) => (isActive ? 'actif' : undefined)}
        >
          <span className="icone">{onglet.icone}</span>
          <span>{onglet.libelle}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function Entete({ titre, sousTitre, retour = false, action }) {
  const navigate = useNavigate()

  return (
    <header className="entete">
      {retour && (
        <button className="retour" onClick={() => navigate(-1)} aria-label="Retour">
          ‹
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>{titre}</h1>
        {sousTitre && <div className="sous-titre">{sousTitre}</div>}
      </div>
      {action}
      {/* Posée dans l'en-tête commun plutôt qu'écran par écran : un rappel
          de soin doit être atteignable d'où qu'on soit. Le composant se
          retire de lui-même hors session et en plan gratuit. */}
      <Cloche />
    </header>
  )
}

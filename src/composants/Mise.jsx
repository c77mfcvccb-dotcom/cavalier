import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import Cloche from './Cloche'

/**
 * Onglets de la barre du bas.
 *
 * Cinq entrées est le maximum tenable sur un écran de téléphone : au-delà,
 * les libellés passent sous la limite de lisibilité. « Chevaux » plutôt que
 * « Mes chevaux » pour cette raison — à cinq colonnes, le libellé long
 * revenait à la ligne.
 */
const ONGLETS_CAVALIER = [
  { to: '/', icone: '🏠', libelle: 'Accueil' },
  { to: '/chevaux', icone: '🐴', libelle: 'Chevaux' },
  { to: '/calendrier', icone: '📅', libelle: 'Calendrier' },
  { to: '/depenses', icone: '💶', libelle: 'Dépenses' },
  { to: '/profil', icone: '👤', libelle: 'Profil' },
]

const ONGLETS_CLUB = [
  { to: '/', icone: '🐴', libelle: 'Cavalerie' },
  { to: '/sante', icone: '🩺', libelle: 'Santé' },
  { to: '/planning', icone: '📅', libelle: 'Planning' },
  { to: '/depenses', icone: '💶', libelle: 'Dépenses' },
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

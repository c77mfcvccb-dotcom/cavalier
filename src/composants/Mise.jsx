import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import Icone from './Icone'
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
  { to: '/', icone: 'accueil', libelle: 'Accueil' },
  { to: '/chevaux', icone: 'chevaux', libelle: 'Chevaux' },
  { to: '/calendrier', icone: 'agenda', libelle: 'Agenda' },
  { to: '/cours', icone: 'cours', libelle: 'Cours' },
  { to: '/club', icone: 'club', libelle: 'Club' },
  { to: '/profil', icone: 'profil', libelle: 'Profil' },
]

const ONGLETS_CLUB = [
  // L'accueil remplace l'écran Santé : les échéances y deviennent des
  // TÂCHES à cocher, et l'historique reste sur la fiche de chaque cheval.
  { to: '/', icone: 'accueil', libelle: 'Accueil' },
  { to: '/chevaux', icone: 'chevaux', libelle: 'Chevaux' },
  { to: '/club', icone: 'club', libelle: 'Cavaliers' },
  { to: '/planning', icone: 'agenda', libelle: 'Planning' },
  { to: '/cours', icone: 'cours', libelle: 'Cours' },
  { to: '/profil', icone: 'profil', libelle: 'Profil' },
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
          <span className="icone"><Icone nom={onglet.icone} /></span>
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

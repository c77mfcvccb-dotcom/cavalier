import { Link } from 'react-router-dom'

/**
 * Liens légaux.
 *
 * Placé sur les écrans qui n'ont pas de barre de navigation basse — les
 * écrans d'authentification — et au bas du profil, seul endroit où un abonné
 * connecté vient chercher ce genre de chose. L'ajouter partout aurait
 * bousculé la barre du bas sans rien apporter.
 */
export default function PiedDePage() {
  return (
    <nav className="liens-legaux">
      <Link to="/cgv">CGV / CGU</Link>
      <Link to="/mentions-legales">Mentions légales</Link>
      <Link to="/confidentialite">Confidentialité</Link>
    </nav>
  )
}

import { Link } from 'react-router-dom'
import { JOURS_ESSAI } from '../lib/abonnement'

/**
 * Panneau affiché à la place d'un module réservé au premium.
 *
 * Il ne « cache » rien : le serveur refuse déjà l'accès aux données
 * (politiques RLS de la migration 0005). Ce panneau explique le refus
 * plutôt que de laisser une liste vide.
 */
export default function BloquePremium({
  emoji = '🔒',
  titre,
  texte,
  motif,
  action = 'Découvrir Premium',
}) {
  return (
    <div className="etat-vide">
      <span className="emoji">{emoji}</span>
      <h3 style={{ marginBottom: 6 }}>{titre}</h3>
      <p>{texte}</p>
      <Link to={`/premium${motif ? `?motif=${motif}` : ''}`} className="bouton">
        {action}
      </Link>
      <p className="aide" style={{ marginTop: 10 }}>
        {JOURS_ESSAI} jours d'essai gratuit.
      </p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import Icone from './Icone'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerEcheances } from '../lib/requetes'
import { cleJour } from '../lib/format'
import {
  bandeauMasqueAujourdhui,
  demanderPermissionNotifications,
  estAlerte,
  majBadgeApplication,
  masquerBandeau,
  notificationsDisponibles,
  notifierNouvellesEcheances,
  permissionNotifications,
} from '../lib/rappels'

/**
 * Bandeau de rappel affiché en tête d'application quand des soins sont en
 * retard ou à faire dans la semaine. Pose aussi la pastille sur l'icône et
 * déclenche les notifications locales si elles sont autorisées.
 */
export default function Rappels() {
  const { estClub } = useAuth()
  const [alertes, setAlertes] = useState([])
  const [masque, setMasque] = useState(() => bandeauMasqueAujourdhui(cleJour(new Date())))
  const [permission, setPermission] = useState(permissionNotifications)

  useEffect(() => {
    let annule = false

    chargerEcheances()
      .then((echeances) => {
        if (annule) return
        const aTraiter = echeances.filter(estAlerte)
        setAlertes(aTraiter)
        majBadgeApplication(aTraiter.length)
        return notifierNouvellesEcheances(echeances)
      })
      .catch(() => {
        // Un rappel n'est jamais bloquant : en cas d'échec, on n'affiche rien.
      })

    return () => {
      annule = true
    }
  }, [])

  if (alertes.length === 0 || masque) return null

  const retards = alertes.filter((e) => e.statut === 'retard').length
  const resume =
    retards > 0
      ? `${retards} soin${retards > 1 ? 's' : ''} en retard`
      : `${alertes.length} soin${alertes.length > 1 ? 's' : ''} cette semaine`

  const proposerActivation = notificationsDisponibles() && permission === 'default'

  async function activerNotifications() {
    const resultat = await demanderPermissionNotifications()
    setPermission(resultat)
    if (resultat === 'granted') notifierNouvellesEcheances(alertes)
  }

  return (
    <div className={`bandeau-rappel ${retards > 0 ? 'retard' : 'urgent'}`}>
      <div className="rangee" style={{ alignItems: 'flex-start' }}>
        <Icone nom={retards > 0 ? 'alerte' : 'cloche'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gras">{resume}</div>
          <div className="doux" style={{ fontSize: '0.82rem' }}>
            {alertes
              .slice(0, 3)
              .map((e) => e.cheval_nom)
              .filter((nom, i, tout) => tout.indexOf(nom) === i)
              .join(', ')}
          </div>
        </div>
        <button
          className="bouton fantome petit"
          onClick={() => {
            masquerBandeau(cleJour(new Date()))
            setMasque(true)
          }}
          aria-label="Masquer pour aujourd'hui"
        >
          ✕
        </button>
      </div>

      <div className="rangee" style={{ marginTop: 10 }}>
        <Link to={estClub ? '/sante' : '/'} className="bouton petit secondaire">
          Voir les échéances
        </Link>
        {proposerActivation && (
          <button className="bouton petit" onClick={activerNotifications}>
            Activer les rappels
          </button>
        )}
      </div>
    </div>
  )
}

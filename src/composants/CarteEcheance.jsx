import { Link } from 'react-router-dom'
import { formatDate, joursRelatifs } from '../lib/format'
import { STATUTS_ECHEANCE, TYPES_SOIN } from '../lib/constantes'

/** Ligne d'alerte utilisée par le tableau de bord cavalier et la vue santé du club. */
export default function CarteEcheance({ echeance, avecCheval = true }) {
  const type = TYPES_SOIN[echeance.type] || TYPES_SOIN.autre
  const statut = STATUTS_ECHEANCE[echeance.statut] || STATUTS_ECHEANCE.ok

  return (
    <Link to={`/chevaux/${echeance.cheval_id}?onglet=soins`} className="element">

      <div className="corps">
        <div className="titre">
          {type.libelle}
          {avecCheval && <span className="doux"> · {echeance.cheval_nom}</span>}
        </div>
        <div className="meta">
          {formatDate(echeance.prochaine_echeance, { court: true })} —{' '}
          {joursRelatifs(echeance.jours_restants)}
        </div>
      </div>

      <span className={`badge ${statut.classe}`}>{statut.libelle}</span>
    </Link>
  )
}

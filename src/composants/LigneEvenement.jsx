import { Link } from 'react-router-dom'
import { formatHeure, joursRelatifs } from '../lib/format'
import { STATUTS_ECHEANCE, TYPES_CRENEAU, TYPES_SOIN } from '../lib/constantes'

/**
 * Une ligne du calendrier, créneau de monte ou échéance de soin.
 * Les deux genres partagent la même structure pour que la liste du jour reste
 * lisible, mais le soin porte son emoji et son badge d'urgence.
 */
export default function LigneEvenement({ evenement, avecCheval = true }) {
  if (evenement.genre === 'soin') {
    const type = TYPES_SOIN[evenement.type] || TYPES_SOIN.autre
    const statut = STATUTS_ECHEANCE[evenement.statut] || STATUTS_ECHEANCE.ok

    return (
      <Link to={`/chevaux/${evenement.cheval_id}?onglet=soins`} className="element">
        <span className="bordure-couleur" style={{ background: evenement.couleur }} />
        <span style={{ fontSize: '1.3rem' }}>{type.emoji}</span>
        <div className="corps">
          <div className="titre">
            {type.libelle}
            {avecCheval && <span className="doux"> · {evenement.cheval?.nom}</span>}
          </div>
          <div className="meta">
            Échéance — {joursRelatifs(evenement.jours_restants)}
            {evenement.praticien ? ` · ${evenement.praticien}` : ''}
          </div>
        </div>
        <span className={`badge ${statut.classe}`}>{statut.libelle}</span>
      </Link>
    )
  }

  return (
    <Link to={`/chevaux/${evenement.cheval_id}?onglet=calendrier`} className="element">
      <span className="bordure-couleur" style={{ background: evenement.couleur }} />
      <div className="corps">
        <div className="titre">
          {avecCheval ? evenement.cheval?.nom : evenement.titre || TYPES_CRENEAU[evenement.type]}
          {avecCheval && (
            <span className="doux"> · {evenement.titre || TYPES_CRENEAU[evenement.type]}</span>
          )}
        </div>
        <div className="meta">
          {formatHeure(evenement.debut)} – {formatHeure(evenement.fin)} ·{' '}
          {evenement.cavalier?.nom}
        </div>
      </div>
      <span className="fleche">›</span>
    </Link>
  )
}

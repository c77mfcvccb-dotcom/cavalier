import { formatMoisAnnee } from '../lib/format'
import { euros } from '../lib/depenses'

const MOIS_INITIALES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * Évolution mensuelle, en barres.
 *
 * Une seule série, donc une seule teinte et aucune légende : le titre dit
 * déjà ce qui est mesuré. La couleur ne porte pas d'information — c'est la
 * hauteur qui la porte — et la sélection se marque par un contraste de ton,
 * jamais par une teinte supplémentaire qui suggérerait une seconde série.
 *
 * Les barres sont aussi la navigation : sur un téléphone, toucher le mois
 * qu'on regarde est plus direct que viser une flèche. Chacune est donc un
 * vrai bouton, avec sa zone tactile pleine hauteur et son libellé lisible
 * par un lecteur d'écran.
 *
 * Aucune valeur n'est écrite au-dessus des barres : douze nombres empilés
 * sur 320 px se chevaucheraient. Seul le mois sélectionné est chiffré, dans
 * le bandeau au-dessus — c'est le « label sélectif » qui garde la silhouette
 * lisible.
 */
export default function GraphiqueMensuel({ series, moisActif, onChoisirMois }) {
  const maximum = Math.max(...series.map((point) => point.total), 1)
  const HAUTEUR = 96

  return (
    <div className="graphique-mois" role="group" aria-label="Évolution des dépenses sur 12 mois">
      {series.map((point) => {
        const actif = point.cle === moisActif
        const hauteur = point.total > 0 ? Math.max(3, (point.total / maximum) * HAUTEUR) : 2
        const libelle = `${formatMoisAnnee(point.date)} : ${euros(point.total)}`

        return (
          <button
            key={point.cle}
            type="button"
            className={actif ? 'barre actif' : 'barre'}
            onClick={() => onChoisirMois(point.date)}
            title={libelle}
            aria-label={libelle}
            aria-pressed={actif}
          >
            <span className="piste" style={{ height: HAUTEUR }}>
              <span
                className={point.total > 0 ? 'remplissage' : 'remplissage vide'}
                style={{ height: hauteur }}
              />
            </span>
            <span className="mois" aria-hidden="true">
              {MOIS_INITIALES[point.date.getMonth()]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

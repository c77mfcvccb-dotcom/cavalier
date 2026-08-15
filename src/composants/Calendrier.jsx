import { useMemo, useState } from 'react'
import { cleJour, formatMoisAnnee, grilleMois, JOURS_COURTS } from '../lib/format'

/**
 * Grille mensuelle des événements du calendrier.
 * `evenements` : [{ id, debut, couleur, genre }] — `genre` vaut « creneau »
 * (pastille ronde à la couleur du cavalier) ou « soin » (carré neutre).
 */
export default function Calendrier({ evenements = [], jourSelectionne, onSelectionJour }) {
  const [curseur, setCurseur] = useState(() => {
    const d = jourSelectionne ? new Date(jourSelectionne) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const parJour = useMemo(() => {
    const carte = new Map()
    for (const evenement of evenements) {
      const cle = cleJour(evenement.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(evenement)
    }
    return carte
  }, [evenements])

  const semaines = useMemo(
    () => grilleMois(curseur.getFullYear(), curseur.getMonth()),
    [curseur]
  )

  const cleAujourdhui = cleJour(new Date())
  const cleSelection = jourSelectionne ? cleJour(jourSelectionne) : null

  const changerMois = (pas) =>
    setCurseur(new Date(curseur.getFullYear(), curseur.getMonth() + pas, 1))

  return (
    <div>
      <div className="calendrier-entete">
        <button onClick={() => changerMois(-1)} aria-label="Mois précédent">‹</button>
        <span className="mois">{formatMoisAnnee(curseur)}</span>
        <button onClick={() => changerMois(1)} aria-label="Mois suivant">›</button>
      </div>

      <div className="grille-jours">
        {JOURS_COURTS.map((jour, i) => (
          <div key={i}>{jour}</div>
        ))}
      </div>

      <div className="grille-mois">
        {semaines.flat().map((date) => {
          const cle = cleJour(date)
          const duJour = parJour.get(cle) || []

          // Une marque par couleur et par genre, 4 au maximum pour rester lisible
          const marques = []
          for (const evenement of duJour) {
            const genre = evenement.genre || 'creneau'
            if (!marques.some((m) => m.couleur === evenement.couleur && m.genre === genre)) {
              marques.push({ couleur: evenement.couleur, genre })
            }
          }

          const classes = ['jour']
          if (date.getMonth() !== curseur.getMonth()) classes.push('hors-mois')
          if (cle === cleAujourdhui) classes.push('aujourdhui')
          if (cle === cleSelection) classes.push('selectionne')

          return (
            <button
              key={cle}
              className={classes.join(' ')}
              onClick={() => onSelectionJour(date)}
            >
              <span>{date.getDate()}</span>
              <span className="pastilles">
                {marques.slice(0, 4).map((marque) => (
                  <i
                    key={`${marque.genre}-${marque.couleur}`}
                    className={marque.genre === 'soin' ? 'marque-soin' : undefined}
                    style={{ background: marque.couleur }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

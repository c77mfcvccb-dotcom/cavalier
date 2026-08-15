import { useMemo, useState } from 'react'
import { cleJour, formatMoisAnnee, grilleMois, JOURS_COURTS } from '../lib/format'

/**
 * Grille mensuelle avec pastilles de couleur par cavalier.
 * `creneaux` : [{ id, debut, couleur }] — la couleur vient de cheval_cavaliers.
 */
export default function Calendrier({ creneaux = [], jourSelectionne, onSelectionJour }) {
  const [curseur, setCurseur] = useState(() => {
    const d = jourSelectionne ? new Date(jourSelectionne) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const parJour = useMemo(() => {
    const carte = new Map()
    for (const creneau of creneaux) {
      const cle = cleJour(creneau.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(creneau)
    }
    return carte
  }, [creneaux])

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
          const couleurs = [...new Set(duJour.map((c) => c.couleur))].slice(0, 4)

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
                {couleurs.map((couleur) => (
                  <i key={couleur} style={{ background: couleur }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

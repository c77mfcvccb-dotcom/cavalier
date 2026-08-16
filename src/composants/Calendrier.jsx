import { useMemo, useState } from 'react'
import { cleJour, formatMoisAnnee, grilleMois, JOURS_COURTS } from '../lib/format'
import { etiquetteEvenement } from '../lib/couleurs'

/** Au-delà de deux cavaliers, la case bascule sur « premier + N ». */
const ETIQUETTES_MAX = 2

/**
 * Grille mensuelle. Chaque jour porte des étiquettes lisibles plutôt que des
 * pastilles : prénom du cavalier qui monte, à sa couleur, ou emoji du soin.
 *
 * `onAjout` rend la grille active : un premier appui choisit le jour — c'est
 * ce qui permet d'en lire le détail, affiché au-dessus — et un second sur le
 * même jour ouvre la création d'un créneau. Ouvrir dès le premier appui
 * empêcherait de simplement consulter une journée, ce qui est l'usage le
 * plus fréquent. Sans `onAjout`, la grille reste un sélecteur.
 */
export default function Calendrier({
  evenements = [],
  jourSelectionne,
  onSelectionJour,
  onAjout,
}) {
  const [curseur, setCurseur] = useState(() => {
    const d = jourSelectionne ? new Date(jourSelectionne) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  /** Une étiquette par cavalier (ou par type de soin) et par jour, sans doublon. */
  const parJour = useMemo(() => {
    const carte = new Map()

    for (const evenement of evenements) {
      const cle = cleJour(evenement.debut)
      if (!carte.has(cle)) carte.set(cle, new Map())

      const etiquette = etiquetteEvenement(evenement)
      const duJour = carte.get(cle)
      if (!duJour.has(etiquette.cle)) duJour.set(etiquette.cle, etiquette)
    }

    // Les cavaliers passent devant les soins : c'est « qui monte » qu'on doit
    // pouvoir lire sans ouvrir le jour.
    return new Map(
      [...carte].map(([cle, duJour]) => [
        cle,
        [...duJour.values()].sort((a, b) => a.priorite - b.priorite),
      ])
    )
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
          const etiquettes = parJour.get(cle) || []

          // Deux étiquettes tiennent empilées ; au-delà, la première puis « +N »
          const visibles = etiquettes.slice(0, ETIQUETTES_MAX)
          const surplus = etiquettes.length - visibles.length
          const affichees = surplus > 0 ? etiquettes.slice(0, ETIQUETTES_MAX - 1) : visibles
          const restantes = etiquettes.length - affichees.length

          const classes = ['jour']
          if (date.getMonth() !== curseur.getMonth()) classes.push('hors-mois')
          if (cle === cleAujourdhui) classes.push('aujourdhui')
          if (cle === cleSelection) classes.push('selectionne')

          const resume = etiquettes.map((e) => e.libelle).join(', ')
          const estSelectionne = cle === cleSelection
          const ajoutPossible = Boolean(onAjout) && estSelectionne

          return (
            <button
              key={cle}
              className={classes.join(' ')}
              onClick={() => (ajoutPossible ? onAjout(date) : onSelectionJour(date))}
              aria-label={
                [
                  String(date.getDate()),
                  resume || null,
                  ajoutPossible ? 'appuyez à nouveau pour ajouter un créneau' : null,
                ]
                  .filter(Boolean)
                  .join(' — ')
              }
            >
              {ajoutPossible && (
                <span className="marque-ajout" aria-hidden="true">
                  +
                </span>
              )}
              <span className="numero">{date.getDate()}</span>

              {etiquettes.length > 0 && (
                <span className="etiquettes">
                  {affichees.map((etiquette) => (
                    <span
                      key={etiquette.cle}
                      className="etiquette-jour"
                      // La case tronque : le nom complet reste accessible au
                      // survol, et sous la grille dans le détail du jour.
                      title={etiquette.libelle}
                      style={{ background: etiquette.fond, color: etiquette.texte }}
                    >
                      {etiquette.court}
                    </span>
                  ))}

                  {restantes > 0 && (
                    <span className="etiquette-jour surplus">+{restantes}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {onAjout && (
        <p className="aide centre" style={{ marginTop: 8 }}>
          Touchez un jour, puis à nouveau pour y ajouter un créneau.
        </p>
      )}
    </div>
  )
}

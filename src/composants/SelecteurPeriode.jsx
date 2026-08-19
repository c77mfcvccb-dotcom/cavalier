import { debutSemaine, formatDate, formatMoisAnnee } from '../lib/format'

/**
 * Sélecteur de période des écrans de planning du club : Jour, Semaine ou
 * Mois, avec les flèches de navigation. Le JOUR est le réglage d'office —
 * la question du gérant en ouvrant l'écran est « qu'est-ce qui se passe
 * aujourd'hui », pas « à quoi ressemble le mois ».
 *
 * Le composant ne garde aucun état : l'écran possède `periode` et `ancre`
 * (une date quelconque à l'intérieur de la période), et recharge ses
 * données sur la fenêtre correspondante via fenetrePeriode().
 */
export const PERIODES = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
}

/** Bornes [debut, fin] de la période contenant l'ancre. */
export function fenetrePeriode(periode, ancre) {
  if (periode === 'jour') {
    const debut = new Date(ancre)
    debut.setHours(0, 0, 0, 0)
    const fin = new Date(debut)
    fin.setHours(23, 59, 59, 999)
    return { debut, fin }
  }

  if (periode === 'mois') {
    const debut = new Date(ancre.getFullYear(), ancre.getMonth(), 1)
    const fin = new Date(ancre.getFullYear(), ancre.getMonth() + 1, 0, 23, 59, 59, 999)
    return { debut, fin }
  }

  // Semaine : du lundi au dernier instant du dimanche — la borne est un <=
  // sur l'horodatage, un jour « pile » exclurait tout ce qui suit minuit.
  const debut = debutSemaine(ancre)
  const fin = new Date(debut)
  fin.setDate(fin.getDate() + 6)
  fin.setHours(23, 59, 59, 999)
  return { debut, fin }
}

/** L'ancre décalée d'une période dans un sens ou l'autre. */
export function decalerAncre(periode, ancre, pas) {
  const suivante = new Date(ancre)
  if (periode === 'jour') suivante.setDate(suivante.getDate() + pas)
  else if (periode === 'semaine') suivante.setDate(suivante.getDate() + pas * 7)
  else suivante.setMonth(suivante.getMonth() + pas, 1)
  return suivante
}

function libelle(periode, ancre) {
  if (periode === 'jour') return formatDate(ancre, { avecJour: true, court: true })
  if (periode === 'mois') return formatMoisAnnee(ancre)
  const { debut, fin } = fenetrePeriode('semaine', ancre)
  return `${formatDate(debut, { court: true })} – ${formatDate(fin, { court: true })}`
}

export default function SelecteurPeriode({ periode, ancre, onPeriode, onAncre }) {
  return (
    <>
      <div className="choix-puces" style={{ justifyContent: 'center', marginBottom: 8 }}>
        {Object.entries(PERIODES).map(([cle, nom]) => (
          <button
            key={cle}
            type="button"
            className={periode === cle ? 'actif' : undefined}
            onClick={() => onPeriode(cle)}
          >
            {nom}
          </button>
        ))}
      </div>

      <div className="calendrier-entete">
        <button
          onClick={() => onAncre(decalerAncre(periode, ancre, -1))}
          aria-label={`${PERIODES[periode]} précédent`}
        >
          ‹
        </button>
        <span className="mois">{libelle(periode, ancre)}</span>
        <button
          onClick={() => onAncre(decalerAncre(periode, ancre, 1))}
          aria-label={`${PERIODES[periode]} suivant`}
        >
          ›
        </button>
      </div>
    </>
  )
}

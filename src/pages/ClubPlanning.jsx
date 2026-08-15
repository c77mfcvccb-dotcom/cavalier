import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexte/AuthContexte'
import { chargerChevauxClub, chargerEvenements } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import LigneEvenement from '../composants/LigneEvenement'
import { COULEUR_SOIN } from '../lib/couleurs'
import { cleJour, debutSemaine, formatDate } from '../lib/format'

/**
 * Planning global du club, semaine par semaine : qui monte quel cheval quand,
 * et les échéances de soins de la cavalerie sur la même vue.
 */
export default function ClubPlanning() {
  const { profil } = useAuth()
  const [evenements, setEvenements] = useState([])
  const [semaine, setSemaine] = useState(() => debutSemaine(new Date()))
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false
    setChargement(true)

    // Dernier instant du dimanche : la borne est un <= sur l'horodatage des
    // créneaux, un jour « pile » exclurait tout ce qui suit minuit.
    const fin = new Date(semaine)
    fin.setDate(fin.getDate() + 6)
    fin.setHours(23, 59, 59, 999)

    chargerChevauxClub(profil.id)
      .then(async (cavalerie) => {
        const tous = await chargerEvenements({
          chevauxIds: cavalerie.map((c) => c.id),
          debut: semaine,
          fin,
        })
        if (!annule) setEvenements(tous)
      })
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [profil.id, semaine])

  const jours = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semaine)
        d.setDate(semaine.getDate() + i)
        return d
      }),
    [semaine]
  )

  // Regroupé par jour affiché, et non sur la liste brute : l'état « semaine
  // vide » reste ainsi cohérent avec ce que la page rend réellement, même si
  // la requête ramène un événement hors de la fenêtre.
  const joursRemplis = useMemo(() => {
    const carte = new Map()
    for (const evenement of evenements) {
      const cle = cleJour(evenement.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(evenement)
    }
    return jours
      .map((jour) => ({ jour, elements: carte.get(cleJour(jour)) || [] }))
      .filter((entree) => entree.elements.length > 0)
  }, [evenements, jours])

  const decalerSemaine = (pas) => {
    const suivante = new Date(semaine)
    suivante.setDate(semaine.getDate() + pas * 7)
    setSemaine(suivante)
  }

  const fin = new Date(semaine)
  fin.setDate(semaine.getDate() + 6)

  return (
    <>
      <Entete titre="Planning" sousTitre="Qui monte quel cheval" />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <div className="calendrier-entete">
          <button onClick={() => decalerSemaine(-1)} aria-label="Semaine précédente">‹</button>
          <span className="mois">
            {formatDate(semaine, { court: true })} – {formatDate(fin, { court: true })}
          </span>
          <button onClick={() => decalerSemaine(1)} aria-label="Semaine suivante">›</button>
        </div>

        <div className="puces" style={{ marginBottom: 6 }}>
          <span className="badge contour">
            <i className="pastille" style={{ background: 'var(--vert-clair)' }} />
            Créneau de monte
          </span>
          <span className="badge contour">
            <i className="pastille carree" style={{ background: COULEUR_SOIN.trait }} />
            Échéance de soin
          </span>
        </div>

        {chargement ? (
          <Chargement />
        ) : joursRemplis.length === 0 ? (
          <EtatVide
            emoji="📅"
            titre="Semaine vide"
            texte="Aucun créneau ni échéance de soin sur les chevaux du club cette semaine."
          />
        ) : (
          joursRemplis.map(({ jour, elements }) => (
            <section key={cleJour(jour)} className="section">
              <div className="titre-section">
                <h2 style={{ fontSize: '1rem' }}>
                  {formatDate(jour, { avecJour: true, court: true })}
                </h2>
                <span className="doux">{elements.length}</span>
              </div>

              <div className="liste">
                {elements.map((evenement) => (
                  <LigneEvenement key={evenement.id} evenement={evenement} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  )
}

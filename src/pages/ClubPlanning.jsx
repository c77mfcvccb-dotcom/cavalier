import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerChevauxClub, chargerCreneaux } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { TYPES_CRENEAU } from '../lib/constantes'
import { cleJour, debutSemaine, formatDate, formatHeure } from '../lib/format'

/** Planning global du club, semaine par semaine : qui monte quel cheval quand. */
export default function ClubPlanning() {
  const { profil } = useAuth()
  const [creneaux, setCreneaux] = useState([])
  const [semaine, setSemaine] = useState(() => debutSemaine(new Date()))
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false
    setChargement(true)

    const fin = new Date(semaine)
    fin.setDate(fin.getDate() + 7)

    chargerChevauxClub(profil.id)
      .then(async (cavalerie) => {
        const tous = await chargerCreneaux({
          chevauxIds: cavalerie.map((c) => c.id),
          debut: semaine,
          fin,
        })
        if (!annule) setCreneaux(tous)
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

  const parJour = useMemo(() => {
    const carte = new Map()
    for (const creneau of creneaux) {
      const cle = cleJour(creneau.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(creneau)
    }
    return carte
  }, [creneaux])

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

        {chargement ? (
          <Chargement />
        ) : creneaux.length === 0 ? (
          <EtatVide
            emoji="📅"
            titre="Semaine vide"
            texte="Aucun créneau posé sur les chevaux du club cette semaine."
          />
        ) : (
          jours.map((jour) => {
            const duJour = parJour.get(cleJour(jour)) || []
            if (duJour.length === 0) return null

            return (
              <section key={cleJour(jour)} className="section">
                <div className="titre-section">
                  <h2 style={{ fontSize: '1rem' }}>
                    {formatDate(jour, { avecJour: true, court: true })}
                  </h2>
                  <span className="doux">{duJour.length}</span>
                </div>

                <div className="liste">
                  {duJour.map((creneau) => (
                    <Link
                      key={creneau.id}
                      to={`/chevaux/${creneau.cheval_id}?onglet=calendrier`}
                      className="element"
                    >
                      <span className="bordure-couleur" style={{ background: creneau.couleur }} />
                      <div className="corps">
                        <div className="titre">{creneau.cheval?.nom}</div>
                        <div className="meta">
                          {formatHeure(creneau.debut)} – {formatHeure(creneau.fin)} ·{' '}
                          {creneau.cavalier?.nom}
                        </div>
                      </div>
                      <span className="badge contour">
                        {creneau.titre || TYPES_CRENEAU[creneau.type]}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </main>
    </>
  )
}

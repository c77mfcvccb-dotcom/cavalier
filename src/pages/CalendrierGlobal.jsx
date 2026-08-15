import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerCreneaux, chargerMesChevaux } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import Calendrier from '../composants/Calendrier'
import { TYPES_CRENEAU } from '../lib/constantes'
import { cleJour, formatDate, formatHeure } from '../lib/format'

/** Tous les chevaux du cavalier fusionnés dans un seul calendrier. */
export default function CalendrierGlobal() {
  const { utilisateur } = useAuth()
  const [creneaux, setCreneaux] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [jour, setJour] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false

    chargerMesChevaux(utilisateur.id)
      .then(async (mesChevaux) => {
        if (annule) return
        setChevaux(mesChevaux)
        const tous = await chargerCreneaux({ chevauxIds: mesChevaux.map((c) => c.id) })
        if (!annule) setCreneaux(tous)
      })
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [utilisateur.id])

  if (chargement) return <Chargement />

  const cleSelection = cleJour(jour)
  const duJour = creneaux.filter((c) => cleJour(c.debut) === cleSelection)

  return (
    <>
      <Entete titre="Calendrier" sousTitre="Tous mes chevaux" />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {chevaux.length === 0 ? (
          <EtatVide
            emoji="📅"
            titre="Rien à afficher"
            texte="Ajoutez un cheval pour commencer à poser vos créneaux."
            action={<Link to="/chevaux/nouveau" className="bouton">Ajouter un cheval</Link>}
          />
        ) : (
          <>
            <Calendrier creneaux={creneaux} jourSelectionne={jour} onSelectionJour={setJour} />

            <section className="section">
              <div className="titre-section">
                <h2>
                  {formatDate(jour, { avecJour: true })}
                </h2>
              </div>

              {duJour.length === 0 ? (
                <div className="carte centre doux">Aucun créneau ce jour-là</div>
              ) : (
                <div className="liste">
                  {duJour.map((creneau) => (
                    <Link
                      key={creneau.id}
                      to={`/chevaux/${creneau.cheval_id}?onglet=calendrier`}
                      className="element"
                    >
                      <span className="bordure-couleur" style={{ background: creneau.couleur }} />
                      <div className="corps">
                        <div className="titre">
                          {creneau.cheval?.nom}
                          <span className="doux">
                            {' '}
                            · {creneau.titre || TYPES_CRENEAU[creneau.type]}
                          </span>
                        </div>
                        <div className="meta">
                          {formatHeure(creneau.debut)} – {formatHeure(creneau.fin)} ·{' '}
                          {creneau.cavalier?.nom}
                        </div>
                      </div>
                      <span className="fleche">›</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  )
}

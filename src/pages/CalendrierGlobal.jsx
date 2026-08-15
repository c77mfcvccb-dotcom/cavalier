import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerEvenements, chargerMesChevaux } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import Calendrier from '../composants/Calendrier'
import LigneEvenement from '../composants/LigneEvenement'
import { COULEUR_SOIN } from '../lib/couleurs'
import { cleJour, formatDate } from '../lib/format'

/** Tous les chevaux du cavalier fusionnés : créneaux de monte et échéances de soins. */
export default function CalendrierGlobal() {
  const { utilisateur } = useAuth()
  const [evenements, setEvenements] = useState([])
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
        const tous = await chargerEvenements({ chevauxIds: mesChevaux.map((c) => c.id) })
        if (!annule) setEvenements(tous)
      })
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [utilisateur.id])

  if (chargement) return <Chargement />

  const cleSelection = cleJour(jour)
  const duJour = evenements.filter((e) => cleJour(e.debut) === cleSelection)

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
            {/* Détail du jour au-dessus de la grille, comme sur la fiche cheval */}
            <section style={{ marginBottom: 20 }}>
              <div className="titre-section">
                <h2>{formatDate(jour, { avecJour: true })}</h2>
              </div>

              {duJour.length === 0 ? (
                <div className="carte centre doux">Rien de prévu ce jour-là</div>
              ) : (
                <div className="liste">
                  {duJour.map((evenement) => (
                    <LigneEvenement key={evenement.id} evenement={evenement} />
                  ))}
                </div>
              )}
            </section>

            <Calendrier evenements={evenements} jourSelectionne={jour} onSelectionJour={setJour} />

            <p className="aide" style={{ marginTop: 12 }}>
              Dans la grille, le prénom indique qui monte ;{' '}
              <span
                className="etiquette-jour"
                style={{
                  display: 'inline-block',
                  width: 'auto',
                  background: COULEUR_SOIN.fond,
                  color: COULEUR_SOIN.texte,
                }}
              >
                🔨
              </span>{' '}
              une échéance de soin.
            </p>
          </>
        )}
      </main>
    </>
  )
}

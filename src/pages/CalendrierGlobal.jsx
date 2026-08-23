import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerEvenements, chargerMesChevaux } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Chargement, Erreur, EtatVide, Feuille, PhotoCheval } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import Calendrier from '../composants/Calendrier'
import LigneEvenement from '../composants/LigneEvenement'
import { COULEUR_SOIN } from '../lib/couleurs'
import { ROLES } from '../lib/constantes'
import { cleJour, formatDate } from '../lib/format'

/** Tous les chevaux du cavalier fusionnés : créneaux de monte et échéances de soins. */
export default function CalendrierGlobal() {
  const { utilisateur } = useAuth()
  const navigate = useNavigate()
  const [evenements, setEvenements] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [jour, setJour] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  /** Jour en attente d'un cheval, quand le cavalier en a plusieurs. */
  const [jourAAttribuer, setJourAAttribuer] = useState(null)

  const recharger = useCallback(async () => {
    const mesChevaux = await chargerMesChevaux(utilisateur.id)
    setChevaux(mesChevaux)
    setEvenements(await chargerEvenements({ chevauxIds: mesChevaux.map((c) => c.id) }))
  }, [utilisateur.id])

  useEffect(() => {
    let annule = false
    recharger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))
    return () => {
      annule = true
    }
  }, [recharger])

  // Un créneau posé par un co-cavalier, sur n'importe lequel de mes chevaux,
  // apparaît ici sans rechargement.
  useAgendaVivant(chevaux.map((c) => c.id), recharger)

  /**
   * Un créneau appartient à un cheval, et cette vue les mélange : le jour
   * choisi ne suffit pas. Avec un seul cheval la question ne se pose pas et
   * l'on y va directement ; sinon on la pose, une fois.
   */
  function ajouterAu(date) {
    if (chevaux.length === 1) ouvrirCreation(chevaux[0], date)
    else setJourAAttribuer(date)
  }

  function ouvrirCreation(cheval, date) {
    setJourAAttribuer(null)
    navigate(`/chevaux/${cheval.id}?onglet=calendrier&jour=${cleJour(date)}&nouveau=1`)
  }

  if (chargement) return <Chargement />

  const cleSelection = cleJour(jour)
  const duJour = evenements.filter((e) => cleJour(e.debut) === cleSelection)

  return (
    <>
      <Entete titre="Mon calendrier" sousTitre="Tous mes chevaux" />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {chevaux.length === 0 ? (
          <EtatVide
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

            <Calendrier
              evenements={evenements}
              jourSelectionne={jour}
              onSelectionJour={setJour}
              onAjout={ajouterAu}
            />

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

        <Feuille
          titre="Pour quel cheval ?"
          ouverte={Boolean(jourAAttribuer)}
          onFermer={() => setJourAAttribuer(null)}
        >
          <p className="doux" style={{ marginBottom: 14 }}>
            Créneau du {jourAAttribuer && formatDate(jourAAttribuer, { avecJour: true })}.
          </p>
          <div className="liste">
            {chevaux.map((cheval) => (
              <button
                key={cheval.id}
                className="carte-cheval"
                onClick={() => ouvrirCreation(cheval, jourAAttribuer)}
              >
                <PhotoCheval cheval={cheval} />
                <div className="infos">
                  <div className="nom">{cheval.nom}</div>
                  <div className="detail">{ROLES[cheval.role]?.libelle}</div>
                </div>
                <span className="fleche">›</span>
              </button>
            ))}
          </div>
        </Feuille>
      </main>
    </>
  )
}

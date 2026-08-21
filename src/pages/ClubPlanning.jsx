import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import {
  chargerChevauxClub,
  chargerCours,
  chargerCreneaux,
  chargerIndisponibilites,
  indisponibiliteActive,
} from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import LigneEvenement from '../composants/LigneEvenement'
import SelecteurPeriode, { fenetrePeriode } from '../composants/SelecteurPeriode'
import { DISCIPLINES_COURS } from '../lib/constantes'
import { cleJour, formatDate, formatHeure } from '../lib/format'

/**
 * Le planning des CHEVAUX — la raison d'être de l'application côté club :
 * qui monte quel cheval quand, semaine par semaine, filtrable par cheval.
 *
 * Deux natures de ligne seulement : les créneaux de monte, et les passages
 * en cours (un cheval attribué à un cours y travaille autant qu'en
 * créneau). Les échéances de soins n'ont plus rien à faire ici — elles ont
 * leur onglet Santé, et les mélanger noyait le planning ; les cours se
 * gèrent dans leur onglet à eux.
 */
export default function ClubPlanning() {
  const { profil } = useAuth()
  const [creneaux, setCreneaux] = useState([])
  const [cours, setCours] = useState([])
  const [indisponibilites, setIndisponibilites] = useState([])
  const [cavalerie, setCavalerie] = useState([])
  const [filtre, setFiltre] = useState('')
  // Le JOUR d'office : la question en ouvrant l'écran est « qu'est-ce qui
  // se passe aujourd'hui » — la semaine et le mois s'ouvrent d'un appui.
  const [periode, setPeriode] = useState('jour')
  const [ancre, setAncre] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const { debut, fin } = fenetrePeriode(periode, ancre)

    const chevaux = await chargerChevauxClub(profil.id)
    setCavalerie(chevaux)
    const ids = chevaux.map((c) => c.id)
    const [lignes, lesCours, indispos] = await Promise.all([
      chargerCreneaux({ chevauxIds: ids, debut, fin }),
      chargerCours({ clubId: profil.id, debut, fin }),
      chargerIndisponibilites(ids),
    ])
    setCreneaux(lignes)
    setCours(lesCours)
    setIndisponibilites(indispos)
  }, [profil.id, periode, ancre])

  useEffect(() => {
    let annule = false
    setChargement(true)
    recharger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))
    return () => {
      annule = true
    }
  }, [recharger])

  // Un créneau posé ou une attribution changée apparaît sans recharger.
  useAgendaVivant(cavalerie.map((c) => c.id), recharger)

  const jours = useMemo(() => {
    const { debut, fin } = fenetrePeriode(periode, ancre)
    const liste = []
    for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      liste.push(new Date(d))
    }
    return liste
  }, [periode, ancre])

  /**
   * Le travail de la semaine, unifié : créneaux + passages en cours, une
   * ligne par cheval engagé, triée par heure dans chaque jour.
   */
  const joursRemplis = useMemo(() => {
    const lignes = []
    for (const creneau of creneaux) {
      if (filtre && creneau.cheval_id !== filtre) continue
      lignes.push({ genre: 'creneau', debut: creneau.debut, creneau })
    }
    for (const c of cours) {
      for (const inscription of c.inscriptions) {
        if (inscription.statut !== 'inscrit' || !inscription.cheval_id) continue
        if (filtre && inscription.cheval_id !== filtre) continue
        lignes.push({
          genre: 'cours',
          debut: c.debut,
          cours: c,
          cheval: inscription.cheval,
          cavalier: inscription.cavalier,
          id: `cours-${inscription.id}`,
        })
      }
    }
    lignes.sort((a, b) => new Date(a.debut) - new Date(b.debut))

    const carte = new Map()
    for (const ligne of lignes) {
      const cle = cleJour(ligne.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(ligne)
    }
    return jours
      .map((jour) => ({ jour, elements: carte.get(cleJour(jour)) || [] }))
      .filter((entree) => entree.elements.length > 0)
  }, [creneaux, cours, jours, filtre])

  const chevalFiltre = cavalerie.find((c) => c.id === filtre)
  const reposFiltre = chevalFiltre ? indisponibiliteActive(indisponibilites, chevalFiltre.id) : null

  return (
    <>
      <Entete
        titre="Planning"
        sousTitre="Qui monte quel cheval"
        action={
          <Link to="/journal" className="bouton fantome petit">
            Journal
          </Link>
        }
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <SelecteurPeriode
          periode={periode}
          ancre={ancre}
          onPeriode={setPeriode}
          onAncre={setAncre}
        />

        {cavalerie.length > 1 && (
          <div className="champ">
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
              <option value="">Tous les chevaux</option>
              {cavalerie.map((cheval) => {
                const repos = indisponibiliteActive(indisponibilites, cheval.id)
                return (
                  <option key={cheval.id} value={cheval.id}>
                    {cheval.nom}{repos ? ' — au repos' : ''}
                  </option>
                )
              })}
            </select>
          </div>
        )}

        {reposFiltre && (
          <div className="carte" style={{ marginBottom: 12 }}>
            <span className="badge retard">
              Au repos
              {reposFiltre.fin
                ? ` jusqu'au ${formatDate(reposFiltre.fin, { court: true })}`
                : " jusqu'à nouvel ordre"}
            </span>
          </div>
        )}

        {chargement ? (
          <Chargement />
        ) : joursRemplis.length === 0 ? (
          <EtatVide
            titre={
              periode === 'jour'
                ? 'Journée vide'
                : periode === 'mois'
                  ? 'Mois vide'
                  : 'Semaine vide'
            }
            texte={`${chevalFiltre ? `Rien de prévu pour ${chevalFiltre.nom}` : 'Aucun créneau ni passage en cours sur la cavalerie'} sur cette période.`}
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
                {elements.map((ligne) =>
                  ligne.genre === 'creneau' ? (
                    <LigneEvenement
                      key={ligne.creneau.id}
                      evenement={{ ...ligne.creneau, genre: 'creneau' }}
                    />
                  ) : (
                    <Link key={ligne.id} to="/cours" className="element">
                      <span className="bordure-couleur" style={{ background: 'var(--bleu)' }} />
                      <div className="corps">
                        <div className="titre">
                          {formatHeure(ligne.debut)} · {ligne.cheval?.nom} — cours{' '}
                          {DISCIPLINES_COURS[ligne.cours.discipline]?.libelle?.toLowerCase()}
                        </div>
                        <div className="meta">
                          {ligne.cavalier?.nom}
                          {ligne.cours.niveau ? ` · ${ligne.cours.niveau}` : ''}
                          {ligne.cours.moniteur ? ` · Coach : ${ligne.cours.moniteur}` : ''}
                        </div>
                      </div>
                      <span className="badge contour">Cours</span>
                    </Link>
                  )
                )}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  )
}

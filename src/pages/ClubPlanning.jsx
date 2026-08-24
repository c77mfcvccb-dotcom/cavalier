import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
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
import SelecteurPeriode, { decalerAncre, fenetrePeriode } from '../composants/SelecteurPeriode'
import { DISCIPLINES_COURS, MOTIFS_INDISPO, TYPES_CRENEAU, TYPES_SOIN } from '../lib/constantes'
import { cleJour, debutSemaine, formatDate, formatHeure } from '../lib/format'

const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

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
  const [soins, setSoins] = useState([])
  const [filtre, setFiltre] = useState('')
  // Le JOUR d'office : la question en ouvrant l'écran est « qu'est-ce qui
  // se passe aujourd'hui » — la semaine et le mois s'ouvrent d'un appui.
  const [periode, setPeriode] = useState('jour')
  // « Liste » déroule les journées ; « Tableau » affiche la semaine comme
  // le tableau blanc de la sellerie : les chevaux en lignes, les jours en
  // colonnes, les soins au bout — toute la cavalerie d'un coup d'œil.
  // C'est la vue d'office : c'est elle qui remplace le tableau physique.
  const [vue, setVue] = useState('tableau')
  const [ancre, setAncre] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    // Le tableau montre toujours une semaine entière, quel que soit le
    // réglage Jour/Semaine/Mois de la vue liste.
    const { debut, fin } = fenetrePeriode(vue === 'tableau' ? 'semaine' : periode, ancre)

    // Les chevaux de CLUB seulement : le planning organise le travail de
    // la cavalerie du club. Les chevaux de propriétaire en pension ont
    // leur suivi sur l'accueil (tâches) et leur fiche, pas de ligne ici.
    const chevaux = await chargerChevauxClub(profil.id)
    setCavalerie(chevaux)
    const ids = chevaux.map((c) => c.id)
    const [lignes, lesCours, indispos, lesSoins] = await Promise.all([
      chargerCreneaux({ chevauxIds: ids, debut, fin }),
      chargerCours({ clubId: profil.id, debut, fin }),
      chargerIndisponibilites(ids),
      ids.length
        ? supabase
            .from('v_soins')
            .select('id, cheval_id, type, date_realisee, prochaine_echeance, cree_le')
            .in('cheval_id', ids)
        : { data: [] },
    ])
    setCreneaux(lignes)
    setCours(lesCours)
    setIndisponibilites(indispos)
    if (lesSoins.error) throw lesSoins.error
    setSoins(lesSoins.data || [])
  }, [profil.id, periode, ancre, vue])

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

  // ── La vue Tableau : la semaine du tableau blanc de la sellerie ──

  const joursSemaine = useMemo(() => {
    const debut = debutSemaine(ancre)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(debut)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [ancre])

  /**
   * Le contenu des cases : pour chaque cheval et chaque jour, ses créneaux
   * de monte (prénom du cavalier ET ce qu'elle vient y faire — balade,
   * séance, soin… le prénom seul ne dit pas pourquoi le cheval est pris) et
   * ses passages en cours, triés par heure — exactement ce qu'on écrirait
   * au feutre dans la case.
   */
  const casesSemaine = useMemo(() => {
    const carte = new Map()
    const poser = (chevalId, jour, entree) => {
      const cle = `${chevalId}:${jour}`
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(entree)
    }
    for (const creneau of creneaux) {
      const prenom = creneau.etiquette?.court || creneau.etiquette?.libelle || 'Monte'
      const nature = creneau.titre || TYPES_CRENEAU[creneau.type] || 'Monte'
      poser(creneau.cheval_id, cleJour(creneau.debut), {
        id: `c-${creneau.id}`,
        debut: creneau.debut,
        texte: nature === prenom ? prenom : `${prenom} · ${nature}`,
        couleur: creneau.couleur,
      })
    }
    for (const c of cours) {
      for (const inscription of c.inscriptions) {
        if (inscription.statut !== 'inscrit' || !inscription.cheval_id) continue
        poser(inscription.cheval_id, cleJour(c.debut), {
          id: `k-${inscription.id}`,
          debut: c.debut,
          texte: 'Cours',
          couleur: 'var(--bleu)',
        })
      }
    }
    for (const entrees of carte.values()) {
      entrees.sort((a, b) => new Date(a.debut) - new Date(b.debut))
    }
    return carte
  }, [creneaux, cours])

  /**
   * La colonne Soins : ce qu'il y a à faire pour chaque cheval d'ici la
   * fin de la semaine affichée — l'échéance active de chaque type, retards
   * compris, comme sur l'accueil.
   */
  const soinsSemaine = useMemo(() => {
    const aujourdhui = cleJour(new Date())
    const finSemaine = cleJour(joursSemaine[6])
    const parCle = new Map()
    for (const soin of soins) {
      const cle = `${soin.cheval_id}:${soin.type}`
      const tenu = parCle.get(cle)
      if (
        !tenu ||
        soin.date_realisee > tenu.date_realisee ||
        (soin.date_realisee === tenu.date_realisee && (soin.cree_le || '') > (tenu.cree_le || ''))
      ) {
        parCle.set(cle, soin)
      }
    }
    const carte = new Map()
    for (const soin of parCle.values()) {
      const echeance = soin.date_realisee > aujourdhui ? soin.date_realisee : soin.prochaine_echeance
      if (!echeance || echeance > finSemaine) continue
      if (!carte.has(soin.cheval_id)) carte.set(soin.cheval_id, [])
      carte.get(soin.cheval_id).push({
        type: soin.type,
        echeance,
        retard: echeance < aujourdhui,
        jour: echeance === aujourdhui,
      })
    }
    for (const lignes of carte.values()) {
      lignes.sort((a, b) => a.echeance.localeCompare(b.echeance))
    }
    return carte
  }, [soins, joursSemaine])

  const chevauxTableau = filtre ? cavalerie.filter((c) => c.id === filtre) : cavalerie
  const auJourdHuiCle = cleJour(new Date())

  return (
    <>
      <Entete titre="Planning" sousTitre="Qui monte quel cheval" />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <div
          className="choix-puces"
          role="group"
          aria-label="Présentation du planning"
          style={{ justifyContent: 'center', marginBottom: 8 }}
        >
          <button
            type="button"
            className={vue === 'liste' ? 'actif' : undefined}
            onClick={() => setVue('liste')}
          >
            Liste
          </button>
          <button
            type="button"
            className={vue === 'tableau' ? 'actif' : undefined}
            onClick={() => setVue('tableau')}
          >
            Tableau
          </button>
        </div>

        {vue === 'liste' ? (
          <SelecteurPeriode
            periode={periode}
            ancre={ancre}
            onPeriode={setPeriode}
            onAncre={setAncre}
          />
        ) : (
          <div className="calendrier-entete">
            <button
              onClick={() => setAncre(decalerAncre('semaine', ancre, -1))}
              aria-label="Semaine précédente"
            >
              ‹
            </button>
            <span className="mois">
              {formatDate(joursSemaine[0], { court: true })} – {formatDate(joursSemaine[6], { court: true })}
            </span>
            <button
              onClick={() => setAncre(decalerAncre('semaine', ancre, 1))}
              aria-label="Semaine suivante"
            >
              ›
            </button>
          </div>
        )}

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
        ) : vue === 'tableau' ? (
          chevauxTableau.length === 0 ? (
            <EtatVide titre="Aucun cheval" texte="La cavalerie est vide pour l'instant." />
          ) : (
            <>
              <div className="tableau-planning">
                <table>
                  <thead>
                    <tr>
                      <th>Cheval</th>
                      {joursSemaine.map((j, i) => (
                        <th
                          key={JOURS_COURTS[i]}
                          className={cleJour(j) === auJourdHuiCle ? 'jour-actuel' : undefined}
                        >
                          {JOURS_COURTS[i]} {j.getDate()}
                        </th>
                      ))}
                      <th>Soins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chevauxTableau.map((cheval) => (
                      <tr key={cheval.id}>
                        <th scope="row">
                          <Link to={`/chevaux/${cheval.id}`}>{cheval.nom}</Link>
                        </th>
                        {joursSemaine.map((j) => {
                          const cle = cleJour(j)
                          const entrees = casesSemaine.get(`${cheval.id}:${cle}`) || []
                          const repos = indisponibiliteActive(indisponibilites, cheval.id, j)
                          const classes = [
                            cle === auJourdHuiCle ? 'jour-actuel' : '',
                            repos ? 'repos' : '',
                          ].filter(Boolean).join(' ')
                          return (
                            <td key={cle} className={classes || undefined}>
                              {repos && entrees.length === 0 && (
                                <span className="entree repos-texte">
                                  {MOTIFS_INDISPO[repos.motif]?.libelle || 'Repos'}
                                </span>
                              )}
                              {entrees.map((e) => (
                                <span key={e.id} className="entree">
                                  <span className="point" style={{ background: e.couleur }} />
                                  {formatHeure(e.debut)} {e.texte}
                                </span>
                              ))}
                            </td>
                          )
                        })}
                        <td>
                          {(soinsSemaine.get(cheval.id) || []).map((s) => {
                            const date = new Date(s.echeance)
                            return (
                              <span
                                key={s.type}
                                className={s.retard ? 'entree soin-retard' : 'entree'}
                              >
                                {TYPES_SOIN[s.type]?.libelle || 'Soin'}{' '}
                                <span className="quand">
                                  {s.retard
                                    ? 'retard'
                                    : s.jour
                                      ? "auj."
                                      : `${JOURS_COURTS[(date.getDay() + 6) % 7].toLowerCase()}. ${date.getDate()}`}
                                </span>
                              </span>
                            )
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="aide" style={{ marginTop: 10 }}>
                Comme le tableau de la sellerie : les chevaux en lignes, la
                semaine en colonnes, les soins au bout. La grille se fait
                glisser du doigt vers la droite.
              </p>
            </>
          )
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
              {/* En vue Jour, la date est déjà dans le sélecteur de période
                  au-dessus — la répéter ici l'affichait deux fois. */}
              {periode !== 'jour' && (
                <div className="titre-section">
                  <h2 style={{ fontSize: '1rem' }}>
                    {formatDate(jour, { avecJour: true, court: true })}
                  </h2>
                  <span className="doux">{elements.length}</span>
                </div>
              )}

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

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Avatar, Champ, Chargement, Erreur, EtatVide, Feuille } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import SelecteurPeriode, { decalerAncre, fenetrePeriode } from '../composants/SelecteurPeriode'
import { prenom } from '../lib/couleurs'
import { DISCIPLINES_COURS, MOTIFS_INDISPO } from '../lib/constantes'
import { ajouterJours, cleJour, formatDate, formatHeure } from '../lib/format'

/**
 * Les triggers de la migration 0017 répondent par des codes : c'est ici
 * qu'ils deviennent des phrases.
 */
function traduireErreur(message) {
  if (message?.includes('CHEVAL_INDISPONIBLE'))
    return 'Ce cheval est au repos à la date du cours — levez son indisponibilité d\'abord.'
  if (message?.includes('CHEVAL_HORS_CLUB'))
    return 'Ce cheval n\'appartient pas à la cavalerie du club.'
  if (message?.includes('duplicate') || message?.includes('unique'))
    return 'Ce cavalier est déjà inscrit à ce cours.'
  return message?.replace(/^.*?:\s*/, '') || 'Une erreur est survenue.'
}

/**
 * L'onglet Cours du club : créer les cours de la semaine, suivre les
 * inscriptions et la liste d'attente, attribuer les chevaux, pointer les
 * présents. Les cours vivaient dans le Planning ; ils ont leur écran —
 * c'est la brique qui fait le quotidien d'une écurie, elle ne se cherche
 * pas au milieu des créneaux de monte.
 */
export default function ClubCours() {
  const { profil } = useAuth()
  const [cours, setCours] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [indisponibilites, setIndisponibilites] = useState([])
  const [cavalerie, setCavalerie] = useState([])
  // Le JOUR d'office : les cours de la journée d'abord, la semaine et le
  // mois à portée d'appui — même sélecteur que le Planning.
  const [periode, setPeriode] = useState('jour')
  // « Liste » déroule les journées ; « Tableau » recrée le tableau blanc
  // de la sellerie — les créneaux horaires du jour en colonnes, la liste
  // cavalier : cheval de chaque cours dedans. Toujours un seul jour à la
  // fois, comme sur le vrai tableau (un par journée).
  const [vue, setVue] = useState('liste')
  const [ancre, setAncre] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  // Filtre par coach : plusieurs monitrices publient sur le même planning,
  // chacune doit pouvoir n'afficher que ses cours d'un geste.
  const [coachFiltre, setCoachFiltre] = useState('')
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [coursOuvertId, setCoursOuvertId] = useState(null)
  // Le ménage de fin de saison : choisir plusieurs cours (pas forcément
  // une récurrence détectée) et les supprimer d'un coup — les cours posés
  // un par un, avant que la récurrence existe, n'ont pas de serie_id.
  const [selectionActive, setSelectionActive] = useState(false)
  const [selectionnes, setSelectionnes] = useState(() => new Set())
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  const recharger = useCallback(async () => {
    const { debut, fin } = fenetrePeriode(vue === 'tableau' ? 'jour' : periode, ancre)

    const chevaux = await chargerChevauxClub(profil.id)
    setCavalerie(chevaux)
    const ids = chevaux.map((c) => c.id)
    const [lesCours, lignes, indispos] = await Promise.all([
      chargerCours({ clubId: profil.id, debut, fin }),
      chargerCreneaux({ chevauxIds: ids, debut, fin }),
      chargerIndisponibilites(ids),
    ])
    setCours(lesCours)
    setCreneaux(lignes)
    setIndisponibilites(indispos)
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

  // Une inscription posée depuis le téléphone d'un cavalier apparaît
  // pendant que le gérant regarde l'écran.
  useAgendaVivant(cavalerie.map((c) => c.id), recharger)

  const jours = useMemo(() => {
    const { debut, fin } = fenetrePeriode(periode, ancre)
    const liste = []
    for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      liste.push(new Date(d))
    }
    return liste
  }, [periode, ancre])

  // Les coachs du planning chargé — le filtre choisi survit à un
  // changement de période, même si son coach n'a rien cette semaine-là.
  const coachs = useMemo(() => {
    const noms = new Set(cours.map((c) => (c.moniteur || '').trim()).filter(Boolean))
    if (coachFiltre) noms.add(coachFiltre)
    return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [cours, coachFiltre])

  // La vue Tableau : les cours du jour affiché, triés par heure — les
  // colonnes du tableau blanc.
  const coursTableau = useMemo(() => {
    const filtres = coachFiltre
      ? cours.filter((c) => (c.moniteur || '').trim() === coachFiltre)
      : cours
    return [...filtres].sort((a, b) => new Date(a.debut) - new Date(b.debut))
  }, [cours, coachFiltre])

  const joursRemplis = useMemo(() => {
    const filtres = coachFiltre
      ? cours.filter((c) => (c.moniteur || '').trim() === coachFiltre)
      : cours
    const carte = new Map()
    for (const c of filtres) {
      const cle = cleJour(c.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(c)
    }
    return jours
      .map((jour) => ({ jour, cours: carte.get(cleJour(jour)) || [] }))
      .filter((entree) => entree.cours.length > 0)
  }, [cours, jours, coachFiltre])

  /**
   * Ce que le cheval a déjà ce jour-là — créneaux et attributions d'autres
   * cours confondus : l'aide au moment d'attribuer.
   */
  const chargeJour = useCallback(
    (chevalId, jourCle, coursExclu = null) => {
      let n = 0
      for (const cr of creneaux) {
        if (cr.cheval_id === chevalId && cleJour(cr.debut) === jourCle) n++
      }
      for (const c of cours) {
        if (c.id === coursExclu || cleJour(c.debut) !== jourCle) continue
        for (const i of c.inscriptions) {
          if (i.statut === 'inscrit' && i.cheval_id === chevalId) n++
        }
      }
      return n
    },
    [creneaux, cours]
  )

  const coursOuvert = cours.find((c) => c.id === coursOuvertId) || null

  // Tous les cours actuellement affichés (jour, semaine ou mois selon le
  // réglage) — « Tout sélectionner » porte sur ce qui est à l'écran, pas
  // sur tout l'historique du club.
  const idsVisibles = joursRemplis.flatMap(({ cours: c }) => c.map((x) => x.id))

  function basculerSelection(id) {
    setSelectionnes((s) => {
      const suivant = new Set(s)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  }

  function toutSelectionner() {
    setSelectionnes((s) =>
      idsVisibles.every((id) => s.has(id)) ? new Set() : new Set(idsVisibles)
    )
  }

  function annulerSelection() {
    setSelectionActive(false)
    setSelectionnes(new Set())
  }

  async function supprimerSelection() {
    if (selectionnes.size === 0) return
    if (
      !window.confirm(
        `Supprimer ${selectionnes.size} cours et toutes leurs inscriptions ? Cette action est irréversible.`
      )
    )
      return
    setSuppressionEnCours(true)
    const { error } = await supabase.from('cours').delete().in('id', [...selectionnes])
    setSuppressionEnCours(false)
    if (error) setErreur(traduireErreur(error.message))
    else {
      annulerSelection()
      recharger()
    }
  }

  return (
    <>
      <Entete titre="Cours" sousTitre="Créer, inscrire, attribuer" />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <div
          className="choix-puces"
          role="group"
          aria-label="Présentation des cours"
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
            onClick={() => {
              setVue('tableau')
              annulerSelection()
            }}
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
              onClick={() => setAncre(decalerAncre('jour', ancre, -1))}
              aria-label="Jour précédent"
            >
              ‹
            </button>
            <span className="mois">{formatDate(ancre, { avecJour: true, court: true })}</span>
            <button
              onClick={() => setAncre(decalerAncre('jour', ancre, 1))}
              aria-label="Jour suivant"
            >
              ›
            </button>
          </div>
        )}

        {coachs.length > 0 && (
          <div className="champ" style={{ marginBottom: 12 }}>
            <select
              value={coachFiltre}
              onChange={(e) => setCoachFiltre(e.target.value)}
              aria-label="Filtrer par coach"
            >
              <option value="">Tous les coachs</option>
              {coachs.map((nom) => (
                <option key={nom} value={nom}>Coach : {nom}</option>
              ))}
            </select>
          </div>
        )}

        {vue === 'liste' && (
          <div style={{ textAlign: 'right', marginBottom: 10 }}>
            <button
              className="lien"
              onClick={() => (selectionActive ? annulerSelection() : setSelectionActive(true))}
            >
              {selectionActive ? 'Annuler la sélection' : 'Sélectionner plusieurs cours'}
            </button>
          </div>
        )}

        {chargement ? (
          <Chargement />
        ) : vue === 'tableau' ? (
          coursTableau.length === 0 ? (
            <EtatVide
              emoji="🎠"
              titre={coachFiltre ? `Aucun cours de ${coachFiltre} ce jour-là` : 'Journée vide'}
              texte={
                coachFiltre
                  ? 'Changez de jour avec les flèches, ou repassez sur « Tous les coachs ».'
                  : "Créez un cours avec le bouton + : il prendra sa place dans le tableau du jour."
              }
            />
          ) : (
            <>
              <div className="tableau-cours">
                <table>
                  <thead>
                    <tr>
                      {coursTableau.map((c) => (
                        <th key={c.id} className={c.discipline === 'balade' ? 'balade' : undefined}>
                          <button type="button" onClick={() => setCoursOuvertId(c.id)}>
                            <span className="heure">{formatHeure(c.debut)}</span>
                            <span className="coach">
                              {DISCIPLINES_COURS[c.discipline]?.libelle}
                              {c.moniteur ? ` · ${c.moniteur}` : ''}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {coursTableau.map((c) => {
                        const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                        return (
                          <td key={c.id}>
                            {inscrits.length === 0 && <span className="vide">Personne d'inscrit</span>}
                            {inscrits.map((i) => (
                              <span
                                key={i.id}
                                className={i.cheval_id ? 'ligne' : 'ligne sans-cheval'}
                              >
                                {prenom(i.cavalier?.nom)}
                                {i.cheval ? ` : ${i.cheval.nom}` : ''}
                              </span>
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="aide" style={{ marginTop: 10 }}>
                Comme le tableau du jour à la sellerie : chaque créneau sa
                colonne, cavalier : cheval en dessous. Un appui sur
                l'en-tête ouvre le cours. La grille se fait glisser du
                doigt vers la droite.
              </p>
            </>
          )
        ) : joursRemplis.length === 0 ? (
          <EtatVide
            emoji="🎠"
            titre={
              coachFiltre
                ? `Aucun cours de ${coachFiltre} sur la période`
                : periode === 'jour'
                  ? "Aucun cours aujourd'hui"
                  : periode === 'mois'
                    ? 'Aucun cours ce mois-ci'
                    : 'Aucun cours cette semaine'
            }
            texte={
              coachFiltre
                ? 'Changez de période avec les flèches, ou repassez sur « Tous les coachs ».'
                : "Créez un cours avec le bouton + : vos cavaliers le verront aussitôt et pourront s'y inscrire depuis leur téléphone."
            }
          />
        ) : (
          joursRemplis.map(({ jour, cours: coursDuJour }) => (
            <section key={cleJour(jour)} className="section">
              <div className="titre-section">
                <h2 style={{ fontSize: '1rem' }}>
                  {formatDate(jour, { avecJour: true, court: true })}
                </h2>
                <span className="doux">{coursDuJour.length}</span>
              </div>

              <div className="liste">
                {coursDuJour.map((c) => {
                  const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                  const attente = c.inscriptions.length - inscrits.length
                  const sansCheval = inscrits.filter((i) => !i.cheval_id).length
                  const coche = selectionnes.has(c.id)
                  return (
                    <button
                      key={c.id}
                      className="element"
                      style={{ textAlign: 'left', width: '100%' }}
                      onClick={() =>
                        selectionActive ? basculerSelection(c.id) : setCoursOuvertId(c.id)
                      }
                    >
                      <span
                        className="bordure-couleur"
                        style={{ background: coche ? 'var(--vert)' : 'var(--bleu)' }}
                      />
                      {selectionActive && (
                        <span
                          className={coche ? 'case-choix cochee' : 'case-choix'}
                          aria-hidden="true"
                        >
                          {coche ? '✓' : ''}
                        </span>
                      )}
                      <div className="corps">
                        <div className="titre">
                          {formatHeure(c.debut)} · {DISCIPLINES_COURS[c.discipline]?.libelle}
                          {c.niveau ? ` · ${c.niveau}` : ''}
                        </div>
                        <div className="meta">
                          {inscrits.length}/{c.places} inscrit{inscrits.length > 1 ? 's' : ''}
                          {attente > 0 ? ` · ${attente} en attente` : ''}
                          {c.moniteur ? ` · Coach : ${c.moniteur}` : ''}
                        </div>
                      </div>
                      {!selectionActive && sansCheval > 0 && (
                        <span className="badge urgent">
                          {sansCheval} sans cheval
                        </span>
                      )}
                      {!selectionActive && <span className="fleche">›</span>}
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {selectionActive ? (
        <div className="barre-selection">
          <span className="compte">
            {selectionnes.size} sélectionné{selectionnes.size > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className="bouton fantome petit"
            onClick={toutSelectionner}
            disabled={idsVisibles.length === 0}
          >
            {idsVisibles.length > 0 && idsVisibles.every((id) => selectionnes.has(id))
              ? 'Tout désélectionner'
              : `Tout sélectionner (${idsVisibles.length})`}
          </button>
          <button
            type="button"
            className="bouton danger petit"
            onClick={supprimerSelection}
            disabled={selectionnes.size === 0 || suppressionEnCours}
          >
            {suppressionEnCours ? 'Suppression…' : `Supprimer (${selectionnes.size})`}
          </button>
        </div>
      ) : (
        <button
          className="bouton-flottant"
          aria-label="Créer un cours"
          onClick={() => setCreationOuverte(true)}
        >
          +
        </button>
      )}

      <FeuilleNouveauCours
        clubId={profil.id}
        ouverte={creationOuverte}
        onFermer={() => setCreationOuverte(false)}
        onEnregistre={() => {
          setCreationOuverte(false)
          recharger()
        }}
      />

      <FeuilleCours
        cours={coursOuvert}
        cavalerie={cavalerie}
        indisponibilites={indisponibilites}
        chargeJour={chargeJour}
        onFermer={() => setCoursOuvertId(null)}
        onChangement={recharger}
      />
    </>
  )
}

/** Durées proposées à la création — un cours d'école dure rarement autre chose. */
const DUREES = [
  { minutes: 30, libelle: '30 min' },
  { minutes: 45, libelle: '45 min' },
  { minutes: 60, libelle: '1 h' },
  { minutes: 90, libelle: '1 h 30' },
  { minutes: 120, libelle: '2 h' },
]

// Un an de cours d'un coup, au plus — au-delà, mieux vaut une seconde
// saisie que soixante lignes posées par erreur d'un tapotement.
const MAX_OCCURRENCES = 52

function FeuilleNouveauCours({ clubId, ouverte, onFermer, onEnregistre }) {
  const [date, setDate] = useState(() => cleJour(new Date()))
  const [heure, setHeure] = useState('18:00')
  const [duree, setDuree] = useState(60)
  const [discipline, setDiscipline] = useState('dressage')
  const [niveau, setNiveau] = useState('')
  const [places, setPlaces] = useState(6)
  const [moniteur, setMoniteur] = useState('')
  const [notes, setNotes] = useState('')
  // Le cours du mercredi 14h qui revient toutes les semaines : plutôt que
  // de le ressaisir chaque fois, on pose sa date de fin et l'app pose
  // une ligne par semaine jusque-là, au même jour, à la même heure.
  const [recurrent, setRecurrent] = useState(false)
  const [finRecurrence, setFinRecurrence] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Chaque ouverture repart d'une feuille propre, datée d'aujourd'hui.
  // Niveau, places et moniteur survivent : on crée souvent les cours de la
  // semaine à la chaîne, et c'est la date qui change, pas la reprise.
  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setDate(cleJour(new Date()))
      setRecurrent(false)
      setFinRecurrence('')
      setErreur('')
    }
  }

  // Les dates de chaque occurrence — la première, puis une par semaine
  // jusqu'à la date de fin choisie (incluse).
  const occurrences = []
  if (recurrent && finRecurrence > date) {
    for (let d = date; d <= finRecurrence && occurrences.length < MAX_OCCURRENCES; d = ajouterJours(d, 7)) {
      occurrences.push(d)
    }
  } else {
    occurrences.push(date)
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    // Toutes les occurrences d'une même récurrence partagent un serie_id :
    // c'est lui qui permet de les supprimer d'un coup plus tard, plutôt
    // qu'une par une. Un cours seul n'appartient à aucune série.
    const serieId = occurrences.length > 1 ? crypto.randomUUID() : null
    const lignes = occurrences.map((jour) => {
      const debut = new Date(`${jour}T${heure}`)
      const fin = new Date(debut.getTime() + duree * 60000)
      return {
        club_id: clubId,
        debut: debut.toISOString(),
        fin: fin.toISOString(),
        discipline,
        niveau: niveau.trim() || null,
        places,
        moniteur: moniteur.trim() || null,
        notes: notes.trim() || null,
        serie_id: serieId,
      }
    })
    const { error } = await supabase.from('cours').insert(lignes)
    setEnvoi(false)

    if (error) setErreur(traduireErreur(error.message))
    else onEnregistre()
  }

  return (
    <Feuille titre="Nouveau cours" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Discipline">
          <div className="choix-puces">
            {Object.entries(DISCIPLINES_COURS).map(([cle, d]) => (
              <button
                key={cle}
                type="button"
                className={discipline === cle ? 'actif' : undefined}
                onClick={() => setDiscipline(cle)}
              >
                {d.libelle}
              </button>
            ))}
          </div>
        </Champ>

        <div className="ligne-champs">
          <Champ label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Champ>
          <Champ label="Heure">
            <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required />
          </Champ>
        </div>

        <div className="champ">
          <label className="interrupteur">
            <input
              type="checkbox"
              checked={recurrent}
              onChange={(e) => setRecurrent(e.target.checked)}
            />
            <span>Se répète chaque semaine, même jour, même heure</span>
          </label>
        </div>

        {recurrent && (
          <Champ
            label="Jusqu'au"
            aide={
              finRecurrence > date
                ? `${occurrences.length} cours seront créés${occurrences.length === MAX_OCCURRENCES ? ` (limite : ${MAX_OCCURRENCES})` : ''}.`
                : 'Choisissez une date après celle du premier cours.'
            }
          >
            <input
              type="date"
              value={finRecurrence}
              min={date}
              onChange={(e) => setFinRecurrence(e.target.value)}
            />
          </Champ>
        )}

        <div className="ligne-champs">
          <Champ label="Durée">
            <select value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
              {DUREES.map((d) => (
                <option key={d.minutes} value={d.minutes}>{d.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Places">
            <input
              type="number"
              min="1"
              max="30"
              value={places}
              onChange={(e) => setPlaces(Number(e.target.value))}
              required
            />
          </Champ>
        </div>

        <div className="ligne-champs">
          <Champ label="Niveau">
            <input
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              placeholder="Galop 3-4"
            />
          </Champ>
          <Champ label="Coach">
            <input value={moniteur} onChange={(e) => setMoniteur(e.target.value)} />
          </Champ>
        </div>

        <Champ label="Notes">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Travail sur les transitions…"
          />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi
            ? 'Création…'
            : occurrences.length > 1
              ? `Créer les ${occurrences.length} cours`
              : 'Créer le cours'}
        </button>
      </form>
    </Feuille>
  )
}

/**
 * Détail d'un cours : les inscrits et leur cheval, la liste d'attente, le
 * pointage. L'attribution se fait ici — le sélecteur annonce la charge du
 * jour et le repos de chaque cheval, mais c'est la base qui refuse (trigger
 * verifier_cheval_cours) : l'aide à l'écran peut être périmée, pas la règle.
 */
function FeuilleCours({ cours, cavalerie, indisponibilites, chargeJour, onFermer, onChangement }) {
  const [erreur, setErreur] = useState('')
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [cavaliersClub, setCavaliersClub] = useState([])

  // La liste des cavaliers du club — quiconque est lié à un de ses chevaux —
  // ne sert qu'à la feuille d'ajout : chargée à la première ouverture.
  useEffect(() => {
    if (!ajoutOuvert || cavaliersClub.length || !cavalerie.length) return
    supabase
      .from('cheval_cavaliers')
      .select('cavalier_id, profil:profils(id, nom, niveau_galop)')
      .in('cheval_id', cavalerie.map((c) => c.id))
      .then(({ data }) => {
        const uniques = new Map()
        for (const ligne of data || []) {
          if (ligne.profil) uniques.set(ligne.cavalier_id, ligne.profil)
        }
        setCavaliersClub([...uniques.values()].sort((a, b) => a.nom.localeCompare(b.nom)))
      })
  }, [ajoutOuvert, cavaliersClub.length, cavalerie])

  if (!cours) return null

  const jourCle = cleJour(cours.debut)
  const inscrits = cours.inscriptions.filter((i) => i.statut === 'inscrit')
  const attente = cours.inscriptions.filter((i) => i.statut === 'attente')
  const dejaInscrits = new Set(cours.inscriptions.map((i) => i.cavalier_id))

  async function attribuer(inscription, chevalId) {
    setErreur('')
    const { error } = await supabase
      .from('inscriptions_cours')
      .update({ cheval_id: chevalId || null })
      .eq('id', inscription.id)
    if (error) setErreur(traduireErreur(error.message))
    else onChangement()
  }

  async function pointer(inscription, present) {
    setErreur('')
    const { error } = await supabase
      .from('inscriptions_cours')
      // Réappuyer sur le même état l'efface : retour au « pas encore pointé »
      .update({ present: inscription.present === present ? null : present })
      .eq('id', inscription.id)
    if (error) setErreur(traduireErreur(error.message))
    else onChangement()
  }

  async function retirer(inscription) {
    if (!window.confirm(`Retirer ${inscription.cavalier?.nom} de ce cours ?`)) return
    setErreur('')
    const { error } = await supabase.from('inscriptions_cours').delete().eq('id', inscription.id)
    if (error) setErreur(traduireErreur(error.message))
    else onChangement()
  }

  async function inscrire(cavalierId) {
    setErreur('')
    const { error } = await supabase
      .from('inscriptions_cours')
      .insert({ cours_id: cours.id, cavalier_id: cavalierId })
    if (error) setErreur(traduireErreur(error.message))
    else {
      setAjoutOuvert(false)
      onChangement()
    }
  }

  async function supprimerCours() {
    if (!window.confirm('Supprimer ce cours et toutes ses inscriptions ?')) return
    const { error } = await supabase.from('cours').delete().eq('id', cours.id)
    if (error) setErreur(traduireErreur(error.message))
    else {
      onFermer()
      onChangement()
    }
  }

  // Un cours issu d'une répétition hebdomadaire partage son serie_id avec
  // les autres occurrences : les supprimer toutes d'un coup évite de
  // rouvrir chaque semaine une à une pour annuler l'année.
  async function supprimerSerie() {
    if (
      !window.confirm(
        'Supprimer TOUS les cours de cette série (répétés chaque semaine) et leurs inscriptions ? Cette action est irréversible.'
      )
    )
      return
    const { error } = await supabase.from('cours').delete().eq('serie_id', cours.serie_id)
    if (error) setErreur(traduireErreur(error.message))
    else {
      onFermer()
      onChangement()
    }
  }

  function LigneInscription({ inscription, enAttente = false }) {
    const indispo = inscription.cheval_id
      ? indisponibiliteActive(indisponibilites, inscription.cheval_id, cours.debut)
      : null

    return (
      <div className="element" style={{ flexWrap: 'wrap' }}>
        <Avatar profil={inscription.cavalier} />
        <div className="corps">
          <div className="titre">{inscription.cavalier?.nom}</div>
          <div className="meta">
            {enAttente
              ? `Liste d'attente`
              : inscription.cavalier?.niveau_galop
                ? `Galop ${inscription.cavalier.niveau_galop}`
                : 'Inscrit'}
          </div>
        </div>

        {!enAttente && (
          <>
            <button
              className={`bouton petit ${inscription.present === true ? '' : 'fantome'}`}
              onClick={() => pointer(inscription, true)}
              aria-label="Présent"
            >
              ✓
            </button>
            <button
              className={`bouton petit ${inscription.present === false ? 'danger' : 'fantome'}`}
              onClick={() => pointer(inscription, false)}
              aria-label="Absent"
            >
              ✗
            </button>
          </>
        )}
        <button
          className="bouton fantome petit"
          onClick={() => retirer(inscription)}
          aria-label="Retirer"
        >
          Retirer
        </button>

        {!enAttente && (
          <div style={{ width: '100%' }}>
            <select
              value={inscription.cheval_id || ''}
              onChange={(e) => attribuer(inscription, e.target.value)}
              aria-label={`Cheval de ${inscription.cavalier?.nom}`}
            >
              <option value="">— Cheval à attribuer —</option>
              {cavalerie.map((cheval) => {
                const repos = indisponibiliteActive(indisponibilites, cheval.id, cours.debut)
                const charge = chargeJour(cheval.id, jourCle, cours.id)
                return (
                  <option key={cheval.id} value={cheval.id} disabled={Boolean(repos)}>
                    {cheval.nom}
                    {repos
                      ? ` — au repos (${MOTIFS_INDISPO[repos.motif]?.libelle?.toLowerCase()})`
                      : charge > 0
                        ? ` — déjà ${charge} ce jour-là`
                        : ''}
                  </option>
                )
              })}
            </select>
            {indispo && (
              <p className="aide" style={{ color: 'var(--rouge)', marginTop: 4 }}>
                {inscription.cheval?.nom} est au repos à cette date.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Feuille
      titre={`${DISCIPLINES_COURS[cours.discipline]?.libelle || 'Cours'}${cours.niveau ? ` · ${cours.niveau}` : ''}`}
      ouverte={Boolean(cours)}
      onFermer={onFermer}
    >
      <p className="doux" style={{ marginBottom: 12 }}>
        {formatDate(cours.debut, { avecJour: true, court: true })} de {formatHeure(cours.debut)} à{' '}
        {formatHeure(cours.fin)}
        {cours.moniteur ? ` · Coach : ${cours.moniteur}` : ''}
      </p>
      {cours.notes && (
        <p className="doux" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{cours.notes}</p>
      )}

      <Erreur>{erreur}</Erreur>

      <div className="titre-section">
        <h2 style={{ fontSize: '1rem' }}>
          Inscrits <span className="doux">· {inscrits.length}/{cours.places}</span>
        </h2>
        <button className="lien" onClick={() => setAjoutOuvert(true)}>
          + Inscrire
        </button>
      </div>

      <div className="liste">
        {inscrits.length === 0 && (
          <div className="carte centre doux">Personne d'inscrit pour l'instant</div>
        )}
        {inscrits.map((inscription) => (
          <LigneInscription key={inscription.id} inscription={inscription} />
        ))}
      </div>

      {attente.length > 0 && (
        <>
          <div className="titre-section" style={{ marginTop: 14 }}>
            <h2 style={{ fontSize: '1rem' }}>
              Liste d'attente <span className="doux">· {attente.length}</span>
            </h2>
          </div>
          <div className="liste">
            {attente.map((inscription) => (
              <LigneInscription key={inscription.id} inscription={inscription} enAttente />
            ))}
          </div>
          <p className="aide" style={{ marginTop: 8 }}>
            Une place qui se libère promeut automatiquement le premier de la liste.
          </p>
        </>
      )}

      {ajoutOuvert && (
        <div className="carte" style={{ marginTop: 14 }}>
          <div className="titre-section">
            <h2 style={{ fontSize: '0.95rem' }}>Inscrire un cavalier</h2>
            <button className="lien" onClick={() => setAjoutOuvert(false)}>Fermer</button>
          </div>
          <div className="liste">
            {cavaliersClub.filter((c) => !dejaInscrits.has(c.id)).length === 0 && (
              <div className="doux">Tous les cavaliers du club sont déjà inscrits.</div>
            )}
            {cavaliersClub
              .filter((c) => !dejaInscrits.has(c.id))
              .map((cavalier) => (
                <button
                  key={cavalier.id}
                  className="element"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => inscrire(cavalier.id)}
                >
                  <Avatar profil={cavalier} />
                  <div className="corps">
                    <div className="titre">{cavalier.nom}</div>
                    {cavalier.niveau_galop && (
                      <div className="meta">Galop {cavalier.niveau_galop}</div>
                    )}
                  </div>
                  <span className="fleche">+</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {cours.serie_id ? (
        <>
          <p className="aide" style={{ marginTop: 16 }}>
            Ce cours se répète chaque semaine.
          </p>
          <button
            className="bouton fantome pleine-largeur"
            style={{ marginTop: 4 }}
            onClick={supprimerCours}
          >
            Supprimer cette date seulement
          </button>
          <button
            className="bouton danger pleine-largeur"
            style={{ marginTop: 8 }}
            onClick={supprimerSerie}
          >
            Supprimer toute la série
          </button>
        </>
      ) : (
        <button
          className="bouton danger pleine-largeur"
          style={{ marginTop: 16 }}
          onClick={supprimerCours}
        >
          Supprimer ce cours
        </button>
      )}
    </Feuille>
  )
}

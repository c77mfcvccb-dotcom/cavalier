import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import {
  chargerChevauxClub,
  chargerCours,
  chargerEvenements,
  chargerIndisponibilites,
  indisponibiliteActive,
} from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Avatar, Champ, Chargement, Erreur, EtatVide, Feuille } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import LigneEvenement from '../composants/LigneEvenement'
import { COULEUR_SOIN } from '../lib/couleurs'
import { DISCIPLINES_COURS, MOTIFS_INDISPO } from '../lib/constantes'
import { cleJour, debutSemaine, formatDate, formatHeure } from '../lib/format'

/**
 * Les triggers de la migration 0017 répondent par des codes : c'est ici
 * qu'ils deviennent des phrases. Le RLS, lui, échoue en silence côté update —
 * mais le club est le seul à ouvrir cette feuille, le cas ne se présente pas.
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
 * Planning global du club, semaine par semaine : les cours avec leurs
 * inscrits, les créneaux « qui monte quel cheval », et les échéances de
 * soins de la cavalerie sur la même vue.
 */
export default function ClubPlanning() {
  const { profil } = useAuth()
  const [evenements, setEvenements] = useState([])
  const [cours, setCours] = useState([])
  const [indisponibilites, setIndisponibilites] = useState([])
  const [semaine, setSemaine] = useState(() => debutSemaine(new Date()))
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [cavalerie, setCavalerie] = useState([])
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [coursOuvertId, setCoursOuvertId] = useState(null)

  const recharger = useCallback(async () => {
    // Dernier instant du dimanche : la borne est un <= sur l'horodatage des
    // créneaux, un jour « pile » exclurait tout ce qui suit minuit.
    const fin = new Date(semaine)
    fin.setDate(fin.getDate() + 6)
    fin.setHours(23, 59, 59, 999)

    const chevaux = await chargerChevauxClub(profil.id)
    setCavalerie(chevaux)
    const ids = chevaux.map((c) => c.id)
    const [lignes, lesCours, indispos] = await Promise.all([
      chargerEvenements({ chevauxIds: ids, debut: semaine, fin }),
      chargerCours({ clubId: profil.id, debut: semaine, fin }),
      chargerIndisponibilites(ids),
    ])
    setEvenements(lignes)
    setCours(lesCours)
    setIndisponibilites(indispos)
  }, [profil.id, semaine])

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

  // Un cavalier qui s'inscrit à un cours ou pose un créneau depuis son
  // téléphone apparaît sur le planning sans qu'on ait à le recharger.
  useAgendaVivant(cavalerie.map((c) => c.id), recharger)

  const jours = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semaine)
        d.setDate(semaine.getDate() + i)
        return d
      }),
    [semaine]
  )

  // Cours et événements fusionnés par jour affiché. Regroupé sur ce que la
  // page rend réellement : l'état « semaine vide » reste cohérent même si
  // une requête ramène une ligne hors fenêtre.
  const joursRemplis = useMemo(() => {
    const carte = new Map()
    const poser = (cle, element) => {
      if (!carte.has(cle)) carte.set(cle, { cours: [], evenements: [] })
      return carte.get(cle)
    }
    for (const c of cours) poser(cleJour(c.debut)).cours.push(c)
    for (const e of evenements) poser(cleJour(e.debut)).evenements.push(e)
    return jours
      .map((jour) => {
        const entree = carte.get(cleJour(jour)) || { cours: [], evenements: [] }
        return { jour, ...entree }
      })
      .filter((entree) => entree.cours.length + entree.evenements.length > 0)
  }, [cours, evenements, jours])

  /**
   * Ce que le cheval a déjà ce jour-là — créneaux et attributions d'autres
   * cours confondus. C'est l'aide au moment de choisir : « Quenotte, déjà
   * 2 ce jour-là », calculée sur les données de la semaine affichée.
   */
  const chargeJour = useCallback(
    (chevalId, jourCle, coursExclu = null) => {
      let n = 0
      for (const e of evenements) {
        if (e.genre === 'creneau' && e.cheval_id === chevalId && cleJour(e.debut) === jourCle) n++
      }
      for (const c of cours) {
        if (c.id === coursExclu || cleJour(c.debut) !== jourCle) continue
        for (const i of c.inscriptions) {
          if (i.statut === 'inscrit' && i.cheval_id === chevalId) n++
        }
      }
      return n
    },
    [evenements, cours]
  )

  const decalerSemaine = (pas) => {
    const suivante = new Date(semaine)
    suivante.setDate(semaine.getDate() + pas * 7)
    setSemaine(suivante)
  }

  const fin = new Date(semaine)
  fin.setDate(semaine.getDate() + 6)

  const coursOuvert = cours.find((c) => c.id === coursOuvertId) || null

  return (
    <>
      <Entete titre="Planning" sousTitre="Cours et montes de la semaine" />

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
          <span className="badge contour">🎓 Cours</span>
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
            texte="Aucun cours, créneau ni échéance de soin cette semaine. Créez un cours avec le bouton +."
          />
        ) : (
          joursRemplis.map(({ jour, cours: coursDuJour, evenements: elements }) => (
            <section key={cleJour(jour)} className="section">
              <div className="titre-section">
                <h2 style={{ fontSize: '1rem' }}>
                  {formatDate(jour, { avecJour: true, court: true })}
                </h2>
                <span className="doux">{coursDuJour.length + elements.length}</span>
              </div>

              <div className="liste">
                {coursDuJour.map((c) => {
                  const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                  const attente = c.inscriptions.length - inscrits.length
                  return (
                    <button
                      key={c.id}
                      className="element"
                      style={{ textAlign: 'left', width: '100%' }}
                      onClick={() => setCoursOuvertId(c.id)}
                    >
                      <span className="bordure-couleur" style={{ background: 'var(--bleu)' }} />
                      <div className="corps">
                        <div className="titre">
                          {DISCIPLINES_COURS[c.discipline]?.emoji}{' '}
                          {formatHeure(c.debut)} · {DISCIPLINES_COURS[c.discipline]?.libelle}
                          {c.niveau ? ` · ${c.niveau}` : ''}
                        </div>
                        <div className="meta">
                          {inscrits.length}/{c.places} inscrit{inscrits.length > 1 ? 's' : ''}
                          {attente > 0 ? ` · ${attente} en attente` : ''}
                          {c.moniteur ? ` · ${c.moniteur}` : ''}
                        </div>
                      </div>
                      <span className="fleche">›</span>
                    </button>
                  )
                })}

                {elements.map((evenement) => (
                  <LigneEvenement key={evenement.id} evenement={evenement} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <button
        className="bouton-flottant"
        aria-label="Créer un cours"
        onClick={() => setCreationOuverte(true)}
      >
        +
      </button>

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

function FeuilleNouveauCours({ clubId, ouverte, onFermer, onEnregistre }) {
  const [date, setDate] = useState(() => cleJour(new Date()))
  const [heure, setHeure] = useState('18:00')
  const [duree, setDuree] = useState(60)
  const [discipline, setDiscipline] = useState('dressage')
  const [niveau, setNiveau] = useState('')
  const [places, setPlaces] = useState(6)
  const [moniteur, setMoniteur] = useState('')
  const [notes, setNotes] = useState('')
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
      setErreur('')
    }
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    const debut = new Date(`${date}T${heure}`)
    const fin = new Date(debut.getTime() + duree * 60000)
    const { error } = await supabase.from('cours').insert({
      club_id: clubId,
      debut: debut.toISOString(),
      fin: fin.toISOString(),
      discipline,
      niveau: niveau.trim() || null,
      places,
      moniteur: moniteur.trim() || null,
      notes: notes.trim() || null,
    })
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
                {d.emoji} {d.libelle}
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
          <Champ label="Moniteur">
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
          {envoi ? 'Création…' : 'Créer le cours'}
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
        {cours.moniteur ? ` · ${cours.moniteur}` : ''}
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

      <button
        className="bouton danger pleine-largeur"
        style={{ marginTop: 16 }}
        onClick={supprimerCours}
      >
        Supprimer ce cours
      </button>
    </Feuille>
  )
}

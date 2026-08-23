import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerCours, chargerMesChevaux, chargerMesClubs } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Avatar, Champ, Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import SelecteurPeriode, { decalerAncre, fenetrePeriode } from '../composants/SelecteurPeriode'
import { prenom } from '../lib/couleurs'
import { DISCIPLINES_COURS, ROLES_CHEVAL_PROPRE } from '../lib/constantes'
import { cleJour, formatDate, formatHeure } from '../lib/format'

/**
 * Les triggers des migrations 0017/0027 répondent par des codes : c'est
 * ici qu'ils deviennent des phrases.
 */
function traduireErreur(message) {
  if (message?.includes('CHEVAL_INDISPONIBLE'))
    return 'Ce cheval est au repos à la date du cours — choisissez-en un autre.'
  if (message?.includes('CHEVAL_HORS_CLUB'))
    return 'Ce cheval n\'appartient pas à la cavalerie de ce club.'
  if (message?.includes('duplicate') || message?.includes('unique'))
    return 'Vous êtes déjà inscrit à ce cours.'
  return message?.replace(/^.*?:\s*/, '') || 'Une erreur est survenue.'
}

/**
 * Les cours de mon club, côté cavalier : je vois le planning, je m'inscris,
 * je me désinscris, et je sais quel cheval m'a été attribué.
 *
 * Aucun paramètre de club : le RLS ne renvoie que les cours des clubs dont
 * on monte au moins un cheval — la même règle que la fonction
 * est_cavalier_du_club en base (migration 0017).
 */
export default function MesCours() {
  const { profil } = useAuth()
  const [clubs, setClubs] = useState([])
  const [cours, setCours] = useState([])
  const [mesChevaux, setMesChevaux] = useState([])
  // Comme côté écurie : Liste (par défaut) ou Tableau — le tableau blanc
  // de la sellerie, un cours par ligne, qui vient sur quel cheval.
  const [vue, setVue] = useState('liste')
  // Le JOUR d'office, comme côté écurie : les cours d'aujourd'hui d'abord,
  // la semaine et le mois d'un appui.
  const [periode, setPeriode] = useState('jour')
  // Filtre par coach : on suit souvent LA monitrice qu'on aime — un geste
  // pour ne voir que ses cours, même mécanique que côté écurie.
  const [coachFiltre, setCoachFiltre] = useState('')
  const [ancre, setAncre] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [envoiId, setEnvoiId] = useState(null)
  const [detailId, setDetailId] = useState(null)
  // Le cheval choisi pour CHAQUE cours pas encore rejoint, avant l'appui sur
  // « M'inscrire » — une chaîne vide veut dire « choisi par le club ».
  const [choixCheval, setChoixCheval] = useState({})

  const recharger = useCallback(async () => {
    const { debut, fin } = fenetrePeriode(vue === 'tableau' ? 'jour' : periode, ancre)
    const [mesClubs, chevaux, lesCours] = await Promise.all([
      chargerMesClubs(),
      chargerMesChevaux(profil.id),
      chargerCours({ debut, fin }),
    ])
    setClubs(mesClubs)
    setMesChevaux(chevaux)
    setCours(lesCours)
  }, [profil.id, periode, ancre, vue])

  useEffect(() => {
    let annule = false
    recharger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))
    return () => {
      annule = true
    }
  }, [recharger])

  // Une place qui se libère, une attribution posée par le club : l'écran
  // suit sans rechargement — même mécanique que le calendrier partagé.
  const chevauxIds = useMemo(() => mesChevaux.map((c) => c.id), [mesChevaux])
  useAgendaVivant(chevauxIds, recharger)

  const coachs = useMemo(() => {
    const noms = new Set(cours.map((c) => (c.moniteur || '').trim()).filter(Boolean))
    if (coachFiltre) noms.add(coachFiltre)
    return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [cours, coachFiltre])

  const coursAffiches = useMemo(
    () =>
      coachFiltre
        ? cours.filter((c) => (c.moniteur || '').trim() === coachFiltre)
        : cours,
    [cours, coachFiltre]
  )

  const parJour = useMemo(() => {
    const carte = new Map()
    for (const c of coursAffiches) {
      const cle = cleJour(c.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(c)
    }
    return [...carte.entries()]
  }, [coursAffiches])

  // La vue Tableau : les cours du jour affiché, triés par heure — comme
  // le tableau blanc de la sellerie, une ligne par cours.
  const coursTableau = useMemo(
    () => [...coursAffiches].sort((a, b) => new Date(a.debut) - new Date(b.debut)),
    [coursAffiches]
  )

  /**
   * Un cheval « à soi » pour CE club — propriétaire ou une formule de
   * pension, jamais 'cavalier_club' (aucune monture n'y est dédiée, c'est
   * justement le cas où le club doit choisir). Doit en plus avoir sa place
   * chez ce club : à lui (club_id) ou en pension confirmée (ecurie_id) —
   * même règle que le trigger verifier_cheval_cours (migration 0027), pour
   * ne proposer que des choix que la base acceptera vraiment.
   */
  function chevauxEligibles(clubId) {
    return mesChevaux.filter(
      (c) =>
        ROLES_CHEVAL_PROPRE.includes(c.role) &&
        (c.club_id === clubId || (c.ecurie_id === clubId && c.pension_confirmee))
    )
  }

  async function inscrire(coursId, chevalId) {
    setErreur('')
    setEnvoiId(coursId)
    const { error } = await supabase
      .from('inscriptions_cours')
      .insert({ cours_id: coursId, cavalier_id: profil.id, cheval_id: chevalId || null })
    setEnvoiId(null)
    if (error) setErreur(traduireErreur(error.message))
    else recharger()
  }

  async function desinscrire(inscription) {
    if (
      !window.confirm(
        inscription.statut === 'inscrit'
          ? 'Vous perdrez votre place — elle ira au premier de la liste d\'attente. Continuer ?'
          : 'Quitter la liste d\'attente ?'
      )
    )
      return
    setErreur('')
    const { error } = await supabase.from('inscriptions_cours').delete().eq('id', inscription.id)
    if (error) setErreur(error.message.replace(/^.*?:\s*/, ''))
    else recharger()
  }

  /**
   * Le détail d'un cours une fois déplié : qui vient, sur quel cheval, et le
   * geste (s'inscrire, choisir son cheval, se désinscrire). Commun à la vue
   * Liste et à la vue Tableau — seul l'en-tête au-dessus change de forme.
   */
  function detailCours(c) {
    const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
    const maPlace = c.inscriptions.find((i) => i.cavalier_id === profil.id)
    const complet = inscrits.length >= c.places

    return (
      <div style={{ marginTop: 10 }}>
        {inscrits.length > 0 && (
          <div className="liste">
            {inscrits.map((i) => (
              <div key={i.id} className="element" style={{ padding: 8 }}>
                <Avatar profil={i.cavalier} />
                <div className="corps">
                  <div className="titre" style={{ fontSize: '0.88rem' }}>
                    {i.cavalier?.nom}
                    {i.cavalier_id === profil.id && <span className="doux"> (vous)</span>}
                  </div>
                  {i.cheval && <div className="meta">sur {i.cheval.nom}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pile" style={{ marginTop: 10 }}>
          {maPlace ? (
            <button
              className="bouton secondaire pleine-largeur"
              onClick={() => desinscrire(maPlace)}
            >
              {maPlace.statut === 'inscrit' ? 'Me désinscrire' : "Quitter la liste d'attente"}
            </button>
          ) : (
            <>
              {chevauxEligibles(c.club_id).length > 0 && (
                <Champ label="Cheval">
                  <select
                    value={choixCheval[c.id] || ''}
                    onChange={(e) =>
                      setChoixCheval((m) => ({ ...m, [c.id]: e.target.value }))
                    }
                  >
                    <option value="">Cheval choisi par le club</option>
                    {chevauxEligibles(c.club_id).map((cheval) => (
                      <option key={cheval.id} value={cheval.id}>
                        {cheval.nom}
                      </option>
                    ))}
                  </select>
                </Champ>
              )}
              <button
                className="bouton pleine-largeur"
                disabled={envoiId === c.id}
                onClick={() => inscrire(c.id, choixCheval[c.id])}
              >
                {envoiId === c.id
                  ? 'Inscription…'
                  : complet
                    ? "M'inscrire en liste d'attente"
                    : "M'inscrire"}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (chargement) return <Chargement />

  return (
    <>
      <Entete
        titre="Cours"
        sousTitre={clubs.map((c) => c.nom).join(' · ') || 'Planning du club'}
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {clubs.length === 0 ? (
          <EtatVide
            emoji="🎠"
            titre="Aucun club"
            texte="Les cours apparaissent ici quand vous êtes membre d'une écurie — elle vous transmet son code d'adhésion, à saisir dans Mon club."
            action={
              <Link to="/club" className="bouton">J'ai un code d'adhésion</Link>
            }
          />
        ) : (
          <>
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
          </>
        )}

        {clubs.length > 0 && (vue === 'tableau' ? (
          coursTableau.length === 0 ? (
            <EtatVide
              emoji="🎠"
              titre={coachFiltre ? `Aucun cours de ${coachFiltre} ce jour-là` : 'Journée vide'}
              texte={
                coachFiltre
                  ? 'Changez de jour avec les flèches, ou repassez sur « Tous les coachs ».'
                  : 'Changez de jour avec les flèches pour voir le prochain cours.'
              }
            />
          ) : (
            <>
              <div className="tableau-cours">
                {coursTableau.map((c) => {
                  const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                  const ouvert = detailId === c.id
                  return (
                    <div key={c.id}>
                      <div className="ligne-tableau">
                        <button
                          type="button"
                          className={c.discipline === 'balade' ? 'entete balade' : 'entete'}
                          onClick={() => setDetailId(ouvert ? null : c.id)}
                          aria-expanded={ouvert}
                        >
                          <span className="heure">{formatHeure(c.debut)}</span>
                          <span className="coach">
                            {DISCIPLINES_COURS[c.discipline]?.libelle}
                            {c.moniteur ? ` · ${c.moniteur}` : ''}
                          </span>
                        </button>
                        <div className="corps">
                          {inscrits.length === 0 && <span className="vide">Personne d'inscrit</span>}
                          {inscrits.map((i) => (
                            <span
                              key={i.id}
                              className={i.cheval_id ? 'ligne' : 'ligne sans-cheval'}
                            >
                              {i.cavalier_id === profil.id ? 'Vous' : prenom(i.cavalier?.nom)}
                              {i.cheval ? ` : ${i.cheval.nom}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      {ouvert && (
                        <div className="carte" style={{ marginTop: 8, padding: 12 }}>
                          {detailCours(c)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="aide" style={{ marginTop: 10 }}>
                Comme le tableau du jour à la sellerie : chaque cours sa
                ligne, cavalier : cheval en dessous. Un appui sur l'en-tête
                déplie les détails et l'inscription.
              </p>
            </>
          )
        ) : coursAffiches.length === 0 ? (
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
                : 'Changez de période avec les flèches, ou élargissez à la semaine ou au mois.'
            }
          />
        ) : (
          parJour.map(([jour, coursDuJour]) => (
            <section key={jour} className="section">
              <div className="titre-section">
                <h2 style={{ fontSize: '1rem' }}>
                  {formatDate(jour, { avecJour: true, court: true })}
                </h2>
              </div>

              <div className="liste">
                {coursDuJour.map((c) => {
                  const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                  const maPlace = c.inscriptions.find((i) => i.cavalier_id === profil.id)
                  const maPosition =
                    maPlace?.statut === 'attente'
                      ? c.inscriptions
                          .filter((i) => i.statut === 'attente')
                          .findIndex((i) => i.id === maPlace.id) + 1
                      : null
                  const ouvert = detailId === c.id

                  return (
                    <div key={c.id} className="carte" style={{ padding: 12 }}>
                      <button
                        className="element"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          boxShadow: 'none',
                        }}
                        onClick={() => setDetailId(ouvert ? null : c.id)}
                        aria-expanded={ouvert}
                      >
                        <span
                          className="bordure-couleur"
                          style={{ background: 'var(--bleu)' }}
                        />
                        <div className="corps">
                          <div className="titre">
                            {formatHeure(c.debut)} · {DISCIPLINES_COURS[c.discipline]?.libelle}
                            {c.niveau ? ` · ${c.niveau}` : ''}
                          </div>
                          <div className="meta">
                            {clubs.length > 1 ? `${c.club?.nom} · ` : ''}
                            {inscrits.length}/{c.places} inscrit{inscrits.length > 1 ? 's' : ''}
                            {c.moniteur ? ` · Coach : ${c.moniteur}` : ''}
                          </div>
                        </div>
                        <span className="puces">
                          {maPlace?.statut === 'inscrit' && (
                            <span className="badge ok">Inscrit</span>
                          )}
                          {maPlace?.statut === 'attente' && (
                            <span className="badge urgent">Attente n°{maPosition}</span>
                          )}
                        </span>
                      </button>

                      {maPlace && (
                        <div className="meta doux" style={{ marginTop: 6 }}>
                          {maPlace.cheval
                            ? `Votre cheval : ${maPlace.cheval.nom}`
                            : 'Cheval attribué par le club avant le cours'}
                        </div>
                      )}

                      {ouvert && detailCours(c)}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        ))}
      </main>
    </>
  )
}

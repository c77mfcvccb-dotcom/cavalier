import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { chargerSoins } from '../../lib/requetes'
import { premiumPourCheval } from '../../lib/club'
import { Champ, Chargement, Erreur, EtatVide, Feuille } from '../../composants/Ui'
import BloquePremium from '../../composants/BloquePremium'
import {
  PROTOCOLES_VACCIN,
  SEUIL_URGENCE_JOURS,
  STATUTS_ECHEANCE,
  TYPES_SOIN,
} from '../../lib/constantes'
import { ajouterJours, cleJour, formatDate, joursRelatifs } from '../../lib/format'

/**
 * Statut calculé côté client, avec les mêmes seuils que la vue v_echeances.
 *
 * Trois états, comme partout ailleurs. Cette fonction en rendait un
 * quatrième, « bientot », disparu des libellés quand le palier « ce mois-ci »
 * a été retiré : la lecture des libellés renvoyait alors `undefined`, et
 * l'onglet Soins se vidait à l'écran dès qu'une échéance tombait entre 8 et
 * 30 jours.
 */
function statutEcheance(dateEcheance) {
  if (!dateEcheance) return null
  const jours = Math.round(
    (new Date(dateEcheance) - new Date(cleJour(new Date()))) / 86400000
  )
  if (jours < 0) return { cle: 'retard', jours }
  if (jours <= SEUIL_URGENCE_JOURS) return { cle: 'urgent', jours }
  return { cle: 'ok', jours }
}

const euros = (montant) =>
  `${Number(montant).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`

export default function OngletSoins({ cheval, estGestionnaire }) {
  const { profil, estClub, estPremium, adhesions } = useAuth()
  // Premium contextuel (0018) : l'abonnement perso, ou le siège offert par
  // l'écurie quand le cheval est dans son périmètre.
  const premium = premiumPourCheval(cheval, { estPremium, adhesions })
  const [soins, setSoins] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)
  const [typeDeplie, setTypeDeplie] = useState(null)
  // Périodicités propres à ce cheval : une ligne absente vaut « défaut ».
  const [intervalles, setIntervalles] = useState({})

  const recharger = useCallback(async () => {
    // Inutile d'interroger la base en gratuit : le RLS renverrait une liste
    // vide, ce qui ressemblerait à un carnet réellement vide.
    if (!premium) {
      setChargement(false)
      return
    }
    try {
      const [liste, reglages] = await Promise.all([
        chargerSoins(cheval.id),
        supabase
          .from('rappels_soins')
          .select('type, intervalle_jours, actif')
          .eq('cheval_id', cheval.id),
      ])
      setSoins(liste)
      setIntervalles(
        Object.fromEntries(
          (reglages.data || []).map((r) => [r.type, r.actif ? r.intervalle_jours : null])
        )
      )
    } catch (e) {
      setErreur(e.message || 'Chargement des soins impossible')
    } finally {
      setChargement(false)
    }
  }, [cheval.id, premium])

  useEffect(() => {
    recharger()
  }, [recharger])

  // Échéance active = le soin le plus récent de chaque type. S'il est daté
  // dans le futur, c'est un soin PRÉVU : sa date est l'échéance — même
  // lecture que les tâches de l'accueil de l'écurie.
  const echeances = useMemo(() => {
    const parType = new Map()
    for (const soin of soins) {
      if (!parType.has(soin.type)) parType.set(soin.type, soin)
    }
    const aujourdhui = cleJour(new Date())
    return [...parType.values()]
      .map((soin) => {
        const planifie = soin.date_realisee > aujourdhui
        const echeance = planifie ? soin.date_realisee : soin.prochaine_echeance
        return echeance ? { soin, echeance, planifie } : null
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.echeance) - new Date(b.echeance))
  }, [soins])

  // Historique regroupé par type de soin, du plus récent au plus ancien
  const historiqueParType = useMemo(() => {
    const groupes = new Map()
    for (const soin of soins) {
      if (!groupes.has(soin.type)) groupes.set(soin.type, [])
      groupes.get(soin.type).push(soin)
    }
    return [...groupes.entries()].sort(
      (a, b) => new Date(b[1][0].date_realisee) - new Date(a[1][0].date_realisee)
    )
  }, [soins])

  const depenses = useMemo(() => {
    const anneeCourante = new Date().getFullYear()
    const moisCourant = new Date().getMonth()
    let annee = 0
    let mois = 0
    const parType = new Map()

    for (const soin of soins) {
      if (!soin.cout) continue
      const montant = Number(soin.cout)
      const date = new Date(soin.date_realisee)
      if (date.getFullYear() === anneeCourante) {
        annee += montant
        if (date.getMonth() === moisCourant) mois += montant
        parType.set(soin.type, (parType.get(soin.type) || 0) + montant)
      }
    }

    return {
      annee,
      mois,
      anneeCourante,
      parType: [...parType.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [soins])

  async function supprimer(soin) {
    if (!window.confirm('Supprimer cette entrée de suivi ?')) return
    const { error } = await supabase.from('soins').delete().eq('id', soin.id)
    if (error) setErreur(error.message)
    else recharger()
  }

  if (!premium) {
    return (
      <BloquePremium
        titre="Carnet de santé"
        texte="Ferrure, vaccins, vermifuges, ostéopathe, dentiste : tout le suivi du cheval, avec les rappels d'échéance et le carnet imprimable pour le vétérinaire."
        motif="soins"
      />
    )
  }

  if (chargement) return <Chargement />

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      <div className="rangee">
        <button
          className="bouton"
          style={{ flex: 1 }}
          onClick={() => setFeuilleOuverte(true)}
        >
          + Ajouter un soin
        </button>
        <Link to={`/chevaux/${cheval.id}/carnet`} className="bouton secondaire">
          Carnet
        </Link>
        <Link
          to={`/chevaux/${cheval.id}/rappels`}
          className="bouton secondaire"
          aria-label="Réglages des rappels"
        >
          Rappels
        </Link>
      </div>

      {echeances.length > 0 && (
        <section>
          <div className="titre-section">
            <h2>Prochaines échéances</h2>
          </div>
          <div className="liste">
            {echeances.map(({ soin, echeance, planifie }) => {
              const type = TYPES_SOIN[soin.type] || TYPES_SOIN.autre
              const statut = statutEcheance(echeance)
              // Repli, comme partout ailleurs : un libellé manquant doit
              // dégrader l'affichage, pas effacer l'écran.
              const libelle = planifie
                ? { classe: 'urgent', libelle: 'Prévu' }
                : STATUTS_ECHEANCE[statut.cle] || STATUTS_ECHEANCE.ok
              return (
                <div key={`echeance-${soin.id}`} className="element">
                  <div className="corps">
                    <div className="titre">{type.libelle}</div>
                    <div className="meta">
                      {formatDate(echeance, { court: true })} —{' '}
                      {planifie ? 'prévu ' : ''}
                      {joursRelatifs(statut.jours)}
                    </div>
                  </div>
                  <span className={`badge ${libelle.classe}`}>{libelle.libelle}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!estClub && depenses.annee > 0 && (
        <section>
          <div className="titre-section">
            <h2>Dépenses {depenses.anneeCourante}</h2>
          </div>
          <div className="carte">
            <div className="rangee espace" style={{ marginBottom: 12 }}>
              <div>
                <div className="doux" style={{ fontSize: '0.8rem' }}>Ce mois-ci</div>
                <div className="gras" style={{ fontSize: '1.15rem' }}>{euros(depenses.mois)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="doux" style={{ fontSize: '0.8rem' }}>Depuis janvier</div>
                <div className="gras" style={{ fontSize: '1.15rem' }}>{euros(depenses.annee)}</div>
              </div>
            </div>

            <div className="pile" style={{ gap: 7 }}>
              {depenses.parType.map(([type, montant]) => {
                const config = TYPES_SOIN[type] || TYPES_SOIN.autre
                const part = Math.round((montant / depenses.annee) * 100)
                return (
                  <div key={type}>
                    <div className="rangee espace" style={{ fontSize: '0.85rem' }}>
                      <span>{config.libelle}</span>
                      <span className="doux">{euros(montant)}</span>
                    </div>
                    <div className="jauge">
                      <span style={{ width: `${part}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {!estGestionnaire && (
            <p className="aide" style={{ marginTop: 8 }}>
              Seuls vos propres coûts apparaissent ici : ceux des autres
              cavaliers et du gestionnaire restent privés (et
              réciproquement).
            </p>
          )}
        </section>
      )}

      <section>
        <div className="titre-section">
          <h2>Carnet de santé</h2>
          <span className="doux">{soins.length} entrée{soins.length > 1 ? 's' : ''}</span>
        </div>

        {soins.length === 0 ? (
          <EtatVide
            titre="Aucun soin enregistré"
            texte="Ferrure, vaccins, vermifuges, ostéo… tout le suivi est partagé entre les cavaliers du cheval."
          />
        ) : (
          <div className="liste">
            {historiqueParType.map(([type, entrees]) => {
              const config = TYPES_SOIN[type] || TYPES_SOIN.autre
              const deplie = typeDeplie === type
              const visibles = deplie ? entrees : entrees.slice(0, 1)

              return (
                <div key={type} className="carte" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    className="entete-groupe"
                    onClick={() => setTypeDeplie(deplie ? null : type)}
                  >
                    <span className="gras" style={{ flex: 1, textAlign: 'left' }}>
                      {config.libelle}
                    </span>
                    <span className="badge contour">{entrees.length}</span>
                    <span className="doux">{deplie ? '▴' : '▾'}</span>
                  </button>

                  <div className="pile" style={{ gap: 0 }}>
                    {visibles.map((soin) => (
                      <div key={soin.id} className="ligne-soin">
                        <div className="corps">
                          <div className="rangee espace">
                            <span className="gras" style={{ fontSize: '0.9rem' }}>
                              {formatDate(soin.date_realisee)}
                            </span>
                            {!estClub && soin.cout ? (
                              <span className="doux">{euros(soin.cout)}</span>
                            ) : null}
                          </div>
                          {(soin.praticien || soin.produit || soin.protocole) && (
                            <div className="meta">
                              {[
                                soin.praticien,
                                PROTOCOLES_VACCIN[soin.protocole]?.libelle || soin.protocole,
                                soin.produit,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                          {soin.notes && (
                            <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>{soin.notes}</div>
                          )}
                          {soin.prochaine_echeance && (
                            <div className="meta">
                              Prochaine : {formatDate(soin.prochaine_echeance, { court: true })}
                            </div>
                          )}
                        </div>
                        <button className="bouton fantome petit" onClick={() => supprimer(soin)}>
                          ✕
                        </button>
                      </div>
                    ))}

                    {!deplie && entrees.length > 1 && (
                      <button className="voir-plus" onClick={() => setTypeDeplie(type)}>
                        Voir les {entrees.length - 1} précédent
                        {entrees.length > 2 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <FeuilleSoin
        cheval={cheval}
        profilId={profil.id}
        intervalles={intervalles}
        ouverte={feuilleOuverte}
        onFermer={() => setFeuilleOuverte(false)}
        onAjoute={() => {
          setFeuilleOuverte(false)
          recharger()
        }}
      />
    </div>
  )
}

function FeuilleSoin({ cheval, profilId, intervalles = {}, ouverte, onFermer, onAjoute }) {
  // Le suivi des dépenses n'existe que côté cavalier : une écurie note le
  // soin et son échéance, jamais un montant.
  const { estClub } = useAuth()
  const intervalleDeType = (type) =>
    type in intervalles ? intervalles[type] : TYPES_SOIN[type]?.intervalleJours

  const valeursParDefaut = () => ({
    type: 'ferrure',
    protocole: '',
    date_realisee: cleJour(new Date()),
    prochaine_echeance: intervalleDeType('ferrure')
      ? ajouterJours(new Date(), intervalleDeType('ferrure'))
      : '',
    praticien: '',
    produit: '',
    cout: '',
    notes: '',
  })

  const [valeurs, setValeurs] = useState(valeursParDefaut)
  // « Déjà fait » enregistre l'histoire ; « À faire » crée la tâche —
  // c'est le geste attendu quand on note « vermifuge à donner » : la
  // date choisie devient l'échéance, et la tâche sonne ce jour-là sur
  // l'accueil de l'écurie (aujourd'hui par défaut).
  const [mode, setMode] = useState('fait')
  const [dateAFaire, setDateAFaire] = useState(() => cleJour(new Date()))
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setValeurs(valeursParDefaut())
      setMode('fait')
      setDateAFaire(cleJour(new Date()))
      setErreur('')
    }
  }

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  /**
   * Périodicité applicable, par ordre de précision décroissante :
   * le protocole de vaccin choisi, puis le réglage propre au cheval, puis
   * la valeur par défaut du type.
   *
   * Le protocole passe devant le réglage du cheval parce qu'il est plus
   * spécifique : une primo-vaccination se rappelle à 30 jours quel que
   * soit le rythme annuel réglé pour ce cheval.
   *
   * `undefined` dans `intervalles` veut dire « pas de réglage » ; `null`
   * veut dire « rappel coupé », et ne propose alors aucune date.
   */
  const intervalleDe = (type, protocole) => {
    if (type === 'vaccin' && protocole) return PROTOCOLES_VACCIN[protocole]?.intervalleJours
    if (type in intervalles) return intervalles[type]
    return TYPES_SOIN[type]?.intervalleJours
  }

  function recalculer(champs) {
    setValeurs((v) => {
      const suivant = { ...v, ...champs }
      const intervalle = intervalleDe(suivant.type, suivant.protocole)
      return {
        ...suivant,
        prochaine_echeance:
          intervalle && suivant.date_realisee
            ? ajouterJours(suivant.date_realisee, intervalle)
            : suivant.type === 'vaccin' && !suivant.protocole
              ? v.prochaine_echeance
              : '',
      }
    })
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    // Mode « à faire » : la ligne porte la date du jour (celle de la
    // programmation) et l'échéance choisie — c'est l'échéance du soin le
    // plus récent qui fait la tâche de l'accueil, elle apparaît donc
    // immédiatement, et « Fait » l'éteindra le moment venu.
    const ligne =
      mode === 'afaire'
        ? {
            cheval_id: cheval.id,
            type: valeurs.type,
            protocole: null,
            date_realisee: cleJour(new Date()),
            prochaine_echeance: dateAFaire,
            praticien: valeurs.praticien || null,
            produit: null,
            cout: null,
            notes: valeurs.notes ? `À faire — ${valeurs.notes}` : 'À faire',
            cree_par: profilId,
          }
        : {
            cheval_id: cheval.id,
            type: valeurs.type,
            protocole: valeurs.type === 'vaccin' ? valeurs.protocole || null : null,
            date_realisee: valeurs.date_realisee,
            prochaine_echeance: valeurs.prochaine_echeance || null,
            praticien: valeurs.praticien || null,
            produit: valeurs.produit || null,
            cout: valeurs.cout ? Number(valeurs.cout) : null,
            notes: valeurs.notes || null,
            cree_par: profilId,
          }
    const { error } = await supabase.from('soins').insert(ligne)

    setEnvoi(false)
    if (error) setErreur(error.message)
    else onAjoute()
  }

  const aideProtocole = PROTOCOLES_VACCIN[valeurs.protocole]?.aide

  return (
    <Feuille titre="Nouveau soin" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <div className="choix-puces" role="group" aria-label="Fait ou à faire" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={mode === 'fait' ? 'actif' : undefined}
            onClick={() => setMode('fait')}
          >
            Déjà fait ✓
          </button>
          <button
            type="button"
            className={mode === 'afaire' ? 'actif' : undefined}
            onClick={() => setMode('afaire')}
          >
            À faire
          </button>
        </div>

        <Champ label="Type de soin">
          <select
            value={valeurs.type}
            onChange={(e) => recalculer({ type: e.target.value, protocole: '' })}
          >
            {Object.entries(TYPES_SOIN).map(([cle, config]) => (
              <option key={cle} value={cle}>
                {config.libelle}
              </option>
            ))}
          </select>
        </Champ>

        {mode === 'fait' && valeurs.type === 'vaccin' && (
          <Champ label="Protocole" aide={aideProtocole}>
            <select
              value={valeurs.protocole}
              onChange={(e) => recalculer({ protocole: e.target.value })}
            >
              <option value="">Choisir un protocole…</option>
              {Object.entries(PROTOCOLES_VACCIN).map(([cle, config]) => (
                <option key={cle} value={cle}>{config.libelle}</option>
              ))}
            </select>
          </Champ>
        )}

        {mode === 'afaire' && (
          <Champ
            label="À faire le"
            aide="La tâche apparaît sur l'accueil — dès maintenant dans « Plus tard », puis dans les tâches du jour à cette date."
          >
            <input
              type="date"
              value={dateAFaire}
              onChange={(e) => setDateAFaire(e.target.value)}
              required
            />
          </Champ>
        )}

        {mode === 'fait' && (
        <div className="ligne-champs">
          <Champ
            label="Date"
            aide={
              valeurs.date_realisee > cleJour(new Date())
                ? 'Date future : ce soin comptera comme À FAIRE ce jour-là sur l\'accueil.'
                : undefined
            }
          >
            <input
              type="date"
              value={valeurs.date_realisee}
              onChange={(e) => recalculer({ date_realisee: e.target.value })}
              required
            />
          </Champ>
          <Champ
            label="Prochaine échéance"
            aide="La tâche sonnera à cette date sur l'accueil — visible dès maintenant dans « Plus tard »."
          >
            <input
              type="date"
              value={valeurs.prochaine_echeance || ''}
              onChange={modifier('prochaine_echeance')}
            />
          </Champ>
        </div>
        )}

        <Champ label="Praticien" aide="Maréchal, vétérinaire, ostéopathe…">
          <input value={valeurs.praticien} onChange={modifier('praticien')} />
        </Champ>

        {mode === 'fait' && ['vaccin', 'vermifuge'].includes(valeurs.type) && (
          <Champ label="Produit">
            <input
              value={valeurs.produit}
              onChange={modifier('produit')}
              placeholder={valeurs.type === 'vaccin' ? 'Equilis Prequenza…' : 'Equimax…'}
            />
          </Champ>
        )}

        {mode === 'fait' && !estClub && (
          <Champ label="Montant (€)" aide="Facultatif — alimente le suivi des dépenses">
            <input type="number" min="0" step="0.01" value={valeurs.cout} onChange={modifier('cout')} />
          </Champ>
        )}

        <Champ label="Notes">
          <textarea value={valeurs.notes} onChange={modifier('notes')} />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi
            ? 'Enregistrement…'
            : mode === 'afaire'
              ? 'Ajouter à la liste des tâches'
              : 'Enregistrer'}
        </button>
      </form>
    </Feuille>
  )
}

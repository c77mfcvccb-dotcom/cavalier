import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerChevauxClub, chargerCours } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Chargement, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { DISCIPLINES_COURS, TYPES_SOIN } from '../lib/constantes'
import { ajouterJours, cleJour, formatDate, formatHeure, joursRelatifs } from '../lib/format'

/**
 * Les trois horizons de la liste des tâches. La borne du mois est à
 * 30 jours parce que le formulaire de soin pré-remplit l'échéance à
 * 4-12 semaines selon le type : c'est la fenêtre qui laisse voir un soin
 * tout juste saisi. Les retards restent visibles sur tous les horizons.
 */
const HORIZONS = {
  jour: { libelle: "Aujourd'hui", limite: 0, vide: "Aucun soin en retard ni dû aujourd'hui sur la cavalerie." },
  semaine: { libelle: '7 jours', limite: 7, vide: 'Rien à faire ces 7 prochains jours sur la cavalerie.' },
  mois: { libelle: '30 jours', limite: 30, vide: 'Rien à prévoir ces 30 prochains jours sur la cavalerie.' },
}

/**
 * L'accueil du club : ce qu'il y a à FAIRE aujourd'hui, cheval par cheval.
 *
 * Tout se recalcule à chaque chargement, à partir des soins existants —
 * aucune table de tâches, aucun traitement planifié. La règle : l'échéance
 * active d'un type de soin est celle du soin le plus récent de ce type ;
 * un soin plus récent sans échéance vaut « rien à prévoir ». Cocher
 * « Fait » écrit un soin daté d'aujourd'hui dont la prochaine échéance
 * découle de la périodicité du cheval (réglages « Rappels » de sa fiche,
 * sinon l'intervalle par défaut du type) : la tâche disparaît et la
 * suivante naît du même geste.
 */
export default function ClubAccueil() {
  const { profil } = useAuth()
  const [cavalerie, setCavalerie] = useState([])
  const [soins, setSoins] = useState([])
  const [reglages, setReglages] = useState([])
  const [coursDuJour, setCoursDuJour] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [envoiCle, setEnvoiCle] = useState(null)
  // L'horizon choisi pour les tâches : la journée d'office, la semaine ou
  // le mois d'un appui — pour voir venir ce qu'il y aura à faire.
  const [horizon, setHorizon] = useState('jour')

  const recharger = useCallback(async () => {
    // Avec les pensions confirmées : le vaccin d'un cheval en pension à
    // l'écurie est une tâche au même titre que celui d'un cheval de club.
    const chevaux = await chargerChevauxClub(profil.id, { avecPensions: true })
    setCavalerie(chevaux)

    // Les cours d'aujourd'hui : le programme de la journée fait partie des
    // tâches — savoir qui tourne à 18 h, et s'il reste des inscrits sans
    // cheval attribué.
    const debutJour = new Date()
    debutJour.setHours(0, 0, 0, 0)
    const finJour = new Date()
    finJour.setHours(23, 59, 59, 999)
    setCoursDuJour(await chargerCours({ clubId: profil.id, debut: debutJour, fin: finJour }))

    const ids = chevaux.map((c) => c.id)
    if (!ids.length) {
      setSoins([])
      setReglages([])
      return
    }
    const [lignes, periodicites] = await Promise.all([
      supabase
        .from('v_soins')
        .select('id, cheval_id, type, date_realisee, prochaine_echeance, cree_le')
        .in('cheval_id', ids),
      supabase
        .from('rappels_soins')
        .select('cheval_id, type, intervalle_jours, actif')
        .in('cheval_id', ids),
    ])
    if (lignes.error) throw lignes.error
    setSoins(lignes.data || [])
    setReglages(periodicites.data || [])
  }, [profil.id])

  useEffect(() => {
    let annule = false
    recharger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))
    return () => {
      annule = true
    }
  }, [recharger])

  // Un soin noté depuis une fiche — ou par un co-gérant sur son téléphone —
  // met la liste des tâches à jour sans recharger.
  useAgendaVivant(cavalerie.map((c) => c.id), recharger)

  /** Périodicité applicable : réglage du cheval, sinon défaut du type. */
  const intervallePour = useCallback(
    (chevalId, type) => {
      const reglage = reglages.find((r) => r.cheval_id === chevalId && r.type === type)
      if (reglage) return reglage.actif ? reglage.intervalle_jours : null
      return TYPES_SOIN[type]?.intervalleJours ?? null
    },
    [reglages]
  )

  /**
   * L'échéance active de chaque (cheval, type) : celle du soin le plus
   * récent du type. S'il n'en porte pas, le type est à jour — c'est le
   * point qui permet à « Fait » de clore aussi les soins sans périodicité
   * (vétérinaire, autre).
   */
  const echeances = useMemo(() => {
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

    const aujourdhui = cleJour(new Date())
    const lignes = []
    for (const soin of parCle.values()) {
      if (!soin.prochaine_echeance) continue
      const cheval = cavalerie.find((c) => c.id === soin.cheval_id)
      if (!cheval) continue
      const jours = Math.round(
        (new Date(soin.prochaine_echeance) - new Date(aujourdhui)) / 86400000
      )
      lignes.push({ soin, cheval, jours })
    }
    return lignes.sort((a, b) => a.jours - b.jours)
  }, [soins, cavalerie])

  const limite = HORIZONS[horizon].limite
  const taches = echeances.filter((l) => l.jours <= limite)
  // Trois groupes au lieu d'un badge par ligne : un moniteur entre deux
  // cours lit un titre de groupe, pas trois redondances par tâche.
  const groupes = [
    { cle: 'retard', titre: 'En retard', couleur: 'var(--rouge)', lignes: taches.filter((l) => l.jours < 0) },
    { cle: 'jour', titre: "Aujourd'hui", couleur: 'var(--orange)', lignes: taches.filter((l) => l.jours === 0) },
    { cle: 'avenir', titre: 'À venir', couleur: '#c9a227', lignes: taches.filter((l) => l.jours > 0) },
  ].filter((g) => g.lignes.length > 0)
  // Au-delà de l'horizon choisi : la saisie d'un soin pré-remplit son
  // échéance à 7 semaines (ferrure), 4 mois (vermifuge), un an (vaccin) —
  // plus loin que TOUS les horizons. Sans cette section, un soin tout
  // juste enregistré n'apparaissait nulle part sur l'accueil, comme s'il
  // s'était perdu. Ici, il se voit dans la seconde, avec sa date.
  const plusTard = echeances.filter((l) => l.jours > limite).slice(0, 5)

  /**
   * « Fait » : le soin est réalisé aujourd'hui. L'historique du cheval
   * s'enrichit, et la prochaine échéance découle de la périodicité — nulle
   * pour un type sans rappel automatique, dont la tâche s'éteint alors
   * simplement.
   */
  async function marquerFait(ligne) {
    const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
    if (
      !window.confirm(
        `${type.libelle} de ${ligne.cheval.nom} : fait aujourd'hui ? Le soin sera ajouté à son carnet et la prochaine échéance recalculée.`
      )
    )
      return

    setErreur('')
    setEnvoiCle(`${ligne.cheval.id}:${ligne.soin.type}`)
    const intervalle = intervallePour(ligne.cheval.id, ligne.soin.type)
    const { error } = await supabase.from('soins').insert({
      cheval_id: ligne.cheval.id,
      type: ligne.soin.type,
      date_realisee: cleJour(new Date()),
      prochaine_echeance: intervalle ? ajouterJours(new Date(), intervalle) : null,
      cree_par: profil.id,
    })
    setEnvoiCle(null)

    if (error) {
      setErreur(
        error.message.includes('row-level security')
          ? "L'abonnement de l'écurie doit être actif pour écrire un soin."
          : error.message.replace(/^.*?:\s*/, '')
      )
      return
    }
    recharger()
  }

  if (chargement) return <Chargement />

  return (
    <>
      <Entete titre={`Bonjour ${profil.nom}`} sousTitre={formatDate(new Date(), { avecJour: true })} />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <section className="section">
          <div className="titre-section">
            <h2>Tâches</h2>
            {taches.length > 0 && <span className="doux">{taches.length}</span>}
          </div>

          <div className="choix-puces" role="group" aria-label="Horizon des tâches">
            {Object.entries(HORIZONS).map(([cle, h]) => (
              <button
                key={cle}
                type="button"
                className={horizon === cle ? 'actif' : ''}
                onClick={() => setHorizon(cle)}
              >
                {h.libelle}
              </button>
            ))}
          </div>

          {taches.length === 0 ? (
            <div className="carte centre fete">
              <p className="gras">Tout est à jour 🎉</p>
              <p className="doux" style={{ marginTop: 6 }}>
                {HORIZONS[horizon].vide}
              </p>
            </div>
          ) : (
            groupes.map((groupe) => (
              <div key={groupe.cle} style={{ marginBottom: 12 }}>
                <div className="groupe-taches" style={{ color: groupe.couleur }}>
                  {groupe.titre}
                  <span className="compte" style={{ background: groupe.couleur }}>{groupe.lignes.length}</span>
                </div>
                <div className="liste">
                  {groupe.lignes.map((ligne) => {
                    const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                    const cle = `${ligne.cheval.id}:${ligne.soin.type}`
                    return (
                      <div key={ligne.soin.id} className="element">
                        <span
                          className="bordure-couleur"
                          style={{ background: groupe.couleur }}
                        />
                        <div className="corps">
                          <div className="titre">
                            {type.libelle} · {ligne.cheval.nom}
                          </div>
                          {ligne.jours !== 0 && (
                            <div className="meta">{joursRelatifs(ligne.jours)}</div>
                          )}
                        </div>
                        <button
                          className="bouton-fait"
                          disabled={envoiCle === cle}
                          onClick={() => marquerFait(ligne)}
                          aria-label={`${type.libelle} de ${ligne.cheval.nom} fait`}
                        >
                          {envoiCle === cle ? '…' : 'Fait ✓'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {plusTard.length > 0 && (
            <>
              <div className="titre-section" style={{ marginTop: 16 }}>
                <h2 style={{ fontSize: '0.95rem' }}>Plus tard</h2>
                <span className="doux">les prochaines échéances</span>
              </div>
              <div className="liste">
                {plusTard.map((ligne) => {
                  const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                  return (
                    <Link
                      key={`plus-tard-${ligne.soin.id}`}
                      to={`/chevaux/${ligne.cheval.id}?onglet=soins`}
                      className="element"
                      style={{ padding: 8 }}
                    >
                      <div className="corps">
                        <div className="titre" style={{ fontSize: '0.88rem' }}>
                          {type.libelle} · {ligne.cheval.nom}
                        </div>
                      </div>
                      <span className="doux" style={{ fontSize: '0.82rem' }}>
                        {formatDate(ligne.soin.prochaine_echeance, { court: true })} ·{' '}
                        {joursRelatifs(ligne.jours)}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </>
          )}

          <p className="aide" style={{ marginTop: 10 }}>
            « Fait » ajoute le soin au carnet du cheval et programme la
            prochaine échéance.
          </p>
        </section>

        <section className="section">
          <div className="titre-section">
            <h2>Cours du jour</h2>
            <Link to="/cours" className="lien">Tous les cours</Link>
          </div>

          {coursDuJour.length === 0 ? (
            <div className="carte centre doux">Aucun cours aujourd'hui.</div>
          ) : (
            <div className="liste">
              {coursDuJour.map((c) => {
                const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                const sansCheval = inscrits.filter((i) => !i.cheval_id).length
                return (
                  <Link key={c.id} to="/cours" className="element">
                    <span className="bordure-couleur" style={{ background: 'var(--bleu)' }} />
                    <div className="corps">
                      <div className="titre">
                        {formatHeure(c.debut)} · {DISCIPLINES_COURS[c.discipline]?.libelle}
                        {c.niveau ? ` · ${c.niveau}` : ''}
                      </div>
                      <div className="meta">
                        {inscrits.length}/{c.places} inscrit{inscrits.length > 1 ? 's' : ''}
                        {c.moniteur ? ` · Coach : ${c.moniteur}` : ''}
                      </div>
                    </div>
                    {sansCheval > 0 && (
                      <span className="badge urgent">{sansCheval} sans cheval</span>
                    )}
                    <span className="fleche">›</span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

      </main>
    </>
  )
}

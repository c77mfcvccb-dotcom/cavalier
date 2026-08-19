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

  const recharger = useCallback(async () => {
    const chevaux = await chargerChevauxClub(profil.id)
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

  const taches = echeances.filter((l) => l.jours <= 0)
  const aVenir = echeances.filter((l) => l.jours >= 1 && l.jours <= 7)

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

  const pastille = (jours) => (jours < 0 ? '🔴' : jours === 0 ? '🟠' : '🟡')
  const classeBadge = (jours) => (jours < 0 ? 'retard' : jours === 0 ? 'urgent' : 'contour')
  const libelleBadge = (jours) =>
    jours < 0 ? 'En retard' : jours === 0 ? "Aujourd'hui" : 'Cette semaine'

  if (chargement) return <Chargement />

  return (
    <>
      <Entete titre="Accueil" sousTitre={profil.nom} />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <section className="section">
          <div className="titre-section">
            <h2>Tâches du jour</h2>
            {taches.length > 0 && <span className="doux">{taches.length}</span>}
          </div>

          {taches.length === 0 ? (
            <div className="carte centre">
              <p className="gras">Tout est à jour ✅</p>
              <p className="doux" style={{ marginTop: 6 }}>
                Aucun soin en retard ni dû aujourd'hui sur la cavalerie.
              </p>
            </div>
          ) : (
            <div className="liste">
              {taches.map((ligne) => {
                const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                const cle = `${ligne.cheval.id}:${ligne.soin.type}`
                return (
                  <div key={ligne.soin.id} className="element">
                    <span style={{ fontSize: '1.3rem' }}>{type.emoji}</span>
                    <div className="corps">
                      <div className="titre">
                        {ligne.cheval.nom} — {type.libelle}
                      </div>
                      <div className="meta">
                        {pastille(ligne.jours)}{' '}
                        {formatDate(ligne.soin.prochaine_echeance, { court: true })} ·{' '}
                        {joursRelatifs(ligne.jours)}
                      </div>
                    </div>
                    <span className={`badge ${classeBadge(ligne.jours)}`}>
                      {libelleBadge(ligne.jours)}
                    </span>
                    <label
                      className="rangee"
                      style={{ gap: 6, fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={envoiCle === cle}
                        onChange={() => marquerFait(ligne)}
                        aria-label={`${type.libelle} de ${ligne.cheval.nom} fait`}
                      />
                      Fait
                    </label>
                  </div>
                )
              })}
            </div>
          )}
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
                        {DISCIPLINES_COURS[c.discipline]?.emoji}{' '}
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

        <section className="section">
          <div className="titre-section">
            <h2>À venir</h2>
            <span className="doux">7 prochains jours</span>
          </div>

          {aVenir.length === 0 ? (
            <div className="carte centre doux">Rien à prévoir cette semaine.</div>
          ) : (
            <div className="liste">
              {aVenir.map((ligne) => {
                const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                return (
                  <Link
                    key={ligne.soin.id}
                    to={`/chevaux/${ligne.cheval.id}?onglet=soins`}
                    className="element"
                    style={{ padding: 8 }}
                  >
                    <span>{pastille(ligne.jours)}</span>
                    <div className="corps">
                      <div className="titre" style={{ fontSize: '0.9rem' }}>
                        {ligne.cheval.nom} — {type.emoji} {type.libelle}
                      </div>
                    </div>
                    <span className="doux" style={{ fontSize: '0.82rem' }}>
                      {joursRelatifs(ligne.jours)}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          <p className="aide" style={{ marginTop: 10 }}>
            Les échéances viennent du carnet de santé de chaque cheval —
            l'historique complet reste sur sa fiche, onglet Soins. Cocher
            « Fait » y ajoute le soin du jour et recalcule la prochaine
            échéance selon la périodicité du cheval.
          </p>
        </section>
      </main>
    </>
  )
}

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
  const [plusTardOuvert, setPlusTardOuvert] = useState(false)
  // Chercher UN cheval : le maréchal est là pour Caramel, on veut ses
  // soins à lui, pas la cavalerie entière.
  const [chevalFiltre, setChevalFiltre] = useState('')

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
        .select('id, cheval_id, type, date_realisee, prochaine_echeance, cree_le, notes')
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
  const actifs = useMemo(() => {
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
    return [...parCle.values()]
  }, [soins])

  /**
   * Un soin COCHÉ aujourd'hui : réalisé ce jour, plus rien à faire avant
   * demain. Les lignes « À faire » posées depuis une fiche portent aussi
   * la date du jour (celle de la saisie) : leur marqueur en notes les
   * garde du côté des tâches — programmer n'est pas cocher.
   */
  const estFaite = useCallback((soin, jour) =>
    soin.date_realisee === jour &&
    (!soin.prochaine_echeance || soin.prochaine_echeance > jour) &&
    !(soin.notes || '').startsWith('À faire'), [])

  const echeances = useMemo(() => {
    const aujourdhui = cleJour(new Date())
    const lignes = []
    for (const soin of actifs) {
      // Coché aujourd'hui : la ligne reste dans les tâches, barrée — elle
      // est construite plus bas, pas ici.
      if (estFaite(soin, aujourdhui)) continue
      // « Ferrure le 22 août » saisie hier pour demain : la date du soin
      // est dans le futur, c'est donc un soin PRÉVU — la tâche porte SA
      // date, pas l'échéance suivante calculée derrière.
      const planifie = soin.date_realisee > aujourdhui
      const echeance = planifie ? soin.date_realisee : soin.prochaine_echeance
      if (!echeance) continue
      const cheval = cavalerie.find((c) => c.id === soin.cheval_id)
      if (!cheval) continue
      const jours = Math.round(
        (new Date(echeance) - new Date(aujourdhui)) / 86400000
      )
      lignes.push({ soin, cheval, jours, echeance, planifie })
    }
    return lignes.sort((a, b) => a.jours - b.jours)
  }, [actifs, cavalerie, estFaite])

  // Ce qui a été coché aujourd'hui reste À SA PLACE dans la liste, barré,
  // jusqu'à demain — le moniteur voit ce qui est réglé et décoche une
  // erreur d'un appui. La place d'avant se retrouve par l'échéance du
  // soin précédent du même type : une tâche en retard cochée reste
  // barrée dans « En retard ».
  const faites = useMemo(() => {
    const aujourdhui = cleJour(new Date())
    const lignes = []
    for (const soin of actifs) {
      if (!estFaite(soin, aujourdhui)) continue
      const cheval = cavalerie.find((c) => c.id === soin.cheval_id)
      if (!cheval) continue
      const avant = soins.reduce((tenu, s) => {
        if (s.id === soin.id || s.cheval_id !== soin.cheval_id || s.type !== soin.type) return tenu
        if (
          !tenu ||
          s.date_realisee > tenu.date_realisee ||
          (s.date_realisee === tenu.date_realisee && (s.cree_le || '') > (tenu.cree_le || ''))
        ) return s
        return tenu
      }, null)
      const echeanceAvant = avant
        ? (avant.date_realisee > aujourdhui ? avant.date_realisee : avant.prochaine_echeance)
        : null
      const jours = echeanceAvant
        ? Math.round((new Date(echeanceAvant) - new Date(aujourdhui)) / 86400000)
        : 0
      lignes.push({ soin, cheval, jours, echeance: echeanceAvant || aujourdhui, planifie: false, faite: true })
    }
    return lignes
  }, [actifs, soins, cavalerie, estFaite])

  const limite = HORIZONS[horizon].limite
  const filtrees = chevalFiltre
    ? echeances.filter((l) => l.cheval.id === chevalFiltre)
    : echeances
  const taches = filtrees.filter((l) => l.jours <= limite)
  // Les lignes cochées rejoignent la liste à leur place d'avant. Celles
  // cochées depuis « Plus tard » se ramènent dans l'horizon visible : une
  // tâche réglée se voit, quel que soit le réglage.
  const faitesVisibles = (chevalFiltre ? faites.filter((l) => l.cheval.id === chevalFiltre) : faites)
    .map((l) => ({ ...l, jours: Math.min(l.jours, limite) }))
  const lignesListe = [...taches, ...faitesVisibles].sort((a, b) => a.jours - b.jours)
  // Trois groupes au lieu d'un badge par ligne : un moniteur entre deux
  // cours lit un titre de groupe, pas trois redondances par tâche. Le
  // compteur de chaque groupe ne compte que ce qui reste à faire.
  const groupes = [
    { cle: 'retard', titre: 'En retard', couleur: 'var(--rouge)', fond: '#fdf0ee', lignes: lignesListe.filter((l) => l.jours < 0) },
    { cle: 'jour', titre: "Aujourd'hui", couleur: 'var(--orange)', fond: '#fdf6ea', lignes: lignesListe.filter((l) => l.jours === 0) },
    { cle: 'avenir', titre: 'À venir', couleur: '#c9a227', fond: '#fbf7e6', lignes: lignesListe.filter((l) => l.jours > 0) },
  ]
    .map((g) => ({ ...g, restantes: g.lignes.filter((l) => !l.faite).length }))
    .filter((g) => g.lignes.length > 0)
  // Au-delà de l'horizon choisi : la saisie d'un soin pré-remplit son
  // échéance à 7 semaines (ferrure), 4 mois (vermifuge), un an (vaccin) —
  // plus loin que TOUS les horizons. Sans cette section, un soin tout
  // juste enregistré n'apparaissait nulle part sur l'accueil, comme s'il
  // s'était perdu. SANS PLAFOND : un plafond à cinq lignes recréait le
  // bug — le sixième soin saisi disparaissait. Au-delà de cinq, la liste
  // se replie derrière « Tout afficher ».
  const plusTard = filtrees.filter((l) => l.jours > limite)
  const plusTardVisibles = plusTardOuvert ? plusTard : plusTard.slice(0, 5)

  // Les dernières saisies, échéance ou pas : la preuve immédiate que le
  // soin enregistré est bien arrivé — un soin vétérinaire sans prochaine
  // échéance n'apparaîtrait sinon nulle part.
  const derniersSoins = useMemo(() => {
    return [...soins]
      .filter((soin) => !chevalFiltre || soin.cheval_id === chevalFiltre)
      .sort((a, b) => (b.cree_le || '').localeCompare(a.cree_le || ''))
      .slice(0, 3)
      .map((soin) => ({ soin, cheval: cavalerie.find((c) => c.id === soin.cheval_id) }))
      .filter((l) => l.cheval)
  }, [soins, cavalerie, chevalFiltre])

  /**
   * « Fait » : le soin est réalisé aujourd'hui. L'historique du cheval
   * s'enrichit, et la prochaine échéance découle de la périodicité — nulle
   * pour un type sans rappel automatique, dont la tâche s'éteint alors
   * simplement.
   */
  async function marquerFait(ligne) {
    setErreur('')
    setEnvoiCle(`${ligne.cheval.id}:${ligne.soin.type}`)
    const intervalle = intervallePour(ligne.cheval.id, ligne.soin.type)
    const fait = {
      date_realisee: cleJour(new Date()),
      prochaine_echeance: intervalle ? ajouterJours(new Date(), intervalle) : null,
    }
    let error = null
    if (ligne.planifie) {
      // La ligne prévue devient le soin fait : pas de doublon au carnet,
      // et un soin fait EN AVANCE éteint la tâche au lieu de la laisser.
      ;({ error } = await supabase.from('soins').update(fait).eq('id', ligne.soin.id))
      // Ligne posée par quelqu'un d'autre : la modification est refusée —
      // on enregistre alors un soin à son propre nom, comme d'habitude.
      if (error) error = null, ({ error } = await supabase.from('soins').insert({
        cheval_id: ligne.cheval.id, type: ligne.soin.type, cree_par: profil.id, ...fait,
      }))
    } else {
      ;({ error } = await supabase.from('soins').insert({
        cheval_id: ligne.cheval.id, type: ligne.soin.type, cree_par: profil.id, ...fait,
      }))
    }
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

  async function decocherFait(ligne) {
    setErreur('')
    const cle = `${ligne.cheval.id}:${ligne.soin.type}`
    setEnvoiCle(cle)
    const aujourdhui = cleJour(new Date())
    const creeAujourdhui = (ligne.soin.cree_le || '').startsWith(aujourdhui)
    const { error } = creeAujourdhui
      ? await supabase.from('soins').delete().eq('id', ligne.soin.id)
      : await supabase
          .from('soins')
          .update({ prochaine_echeance: aujourdhui })
          .eq('id', ligne.soin.id)
    setEnvoiCle(null)
    if (error) setErreur(error.message.replace(/^.*?:\s*/, ''))
    else recharger()
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
            {taches.length > 0 && (
              <span className={`badge ${taches.some((l) => l.jours < 0) ? 'retard' : 'urgent'}`}>
                {taches.length}
              </span>
            )}
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

          {cavalerie.length > 1 && (
            <div className="champ" style={{ marginBottom: 12 }}>
              <select
                value={chevalFiltre}
                onChange={(e) => setChevalFiltre(e.target.value)}
                aria-label="Filtrer par cheval"
              >
                <option value="">Tous les chevaux</option>
                {cavalerie.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
          )}

          {taches.length === 0 && (
            <div className="carte centre fete" style={{ marginBottom: groupes.length ? 12 : 0 }}>
              <p className="gras">Tout est à jour 🎉</p>
              <p className="doux" style={{ marginTop: 6 }}>
                {chevalFiltre
                  ? `Rien à faire pour ${cavalerie.find((c) => c.id === chevalFiltre)?.nom ?? 'ce cheval'} sur cette période.`
                  : HORIZONS[horizon].vide}
              </p>
            </div>
          )}
          {groupes.map((groupe) => (
            <div key={groupe.cle} style={{ marginBottom: 12 }}>
              <div className="groupe-taches" style={{ color: groupe.couleur }}>
                {groupe.titre}
                {groupe.restantes > 0 && (
                  <span className="compte" style={{ background: groupe.couleur }}>{groupe.restantes}</span>
                )}
              </div>
              <div className="liste">
                {groupe.lignes.map((ligne) => {
                  const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                  const cle = `${ligne.cheval.id}:${ligne.soin.type}`
                  return (
                    <div
                      key={ligne.soin.id}
                      className="element"
                      style={{ background: ligne.faite ? '#eef6ef' : groupe.fond }}
                    >
                      <span
                        className="bordure-couleur"
                        style={{ background: ligne.faite ? 'var(--vert-clair)' : groupe.couleur }}
                      />
                      <div className="corps">
                        <div
                          className="titre"
                          style={ligne.faite ? { textDecoration: 'line-through', opacity: 0.75 } : undefined}
                        >
                          {type.libelle} · {ligne.cheval.nom}
                        </div>
                        {!ligne.faite && (ligne.jours !== 0 || ligne.planifie) && (
                          <div className="meta">
                            {ligne.planifie ? 'prévu ' : ''}
                            {joursRelatifs(ligne.jours)}
                          </div>
                        )}
                      </div>
                      {/* Une seule case : vide elle coche (le soin part au
                          carnet), pleine elle décoche (le soin coché par
                          erreur s'efface, la tâche revient). */}
                      <button
                        className={ligne.faite ? 'bouton-fait coche' : 'bouton-fait'}
                        disabled={envoiCle === cle}
                        onClick={() => (ligne.faite ? decocherFait(ligne) : marquerFait(ligne))}
                        aria-label={
                          ligne.faite
                            ? `Annuler ${type.libelle} de ${ligne.cheval.nom}`
                            : `${type.libelle} de ${ligne.cheval.nom} fait`
                        }
                      >
                        {envoiCle === cle ? '…' : 'Fait ✓'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <p className="aide" style={{ marginTop: 10 }}>
            « Fait » ajoute le soin au carnet du cheval et programme la
            prochaine échéance. La tâche cochée reste à sa place, barrée,
            jusqu'à demain — un appui la décoche.
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

        {plusTard.length > 0 && (
          <section className="section">
            <div className="titre-section">
              <h2>Plus tard</h2>
            </div>
            <div className="liste">
              {plusTardVisibles.map((ligne) => {
                const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                const cle = `${ligne.cheval.id}:${ligne.soin.type}`
                return (
                  <div key={`plus-tard-${ligne.soin.id}`} className="element" style={{ padding: 8 }}>
                    <span className="bordure-couleur" style={{ background: '#8fae9b' }} />
                    <Link
                      to={`/chevaux/${ligne.cheval.id}?onglet=soins`}
                      className="corps"
                      style={{ minWidth: 0 }}
                    >
                      <div className="titre" style={{ fontSize: '0.88rem' }}>
                        {type.libelle} · {ligne.cheval.nom}
                      </div>
                      <div className="meta">
                        {ligne.jours <= 7
                          ? `${ligne.planifie ? 'prévu ' : ''}${joursRelatifs(ligne.jours)}`
                          : `${ligne.planifie ? 'prévu le ' : ''}${formatDate(ligne.echeance, { court: true })}`}
                      </div>
                    </Link>
                    {/* Le maréchal passé en avance : la tâche se pointe
                        d'ici, sans attendre son jour. */}
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
            {plusTard.length > plusTardVisibles.length && (
              <button
                className="bouton secondaire pleine-largeur"
                style={{ marginTop: 8 }}
                onClick={() => setPlusTardOuvert(true)}
              >
                Tout afficher ({plusTard.length})
              </button>
            )}
          </section>
        )}

        {derniersSoins.length > 0 && (
          <section className="section">
            <div className="titre-section">
              <h2>Derniers soins notés</h2>
            </div>
            <div className="liste">
              {derniersSoins.map((ligne) => {
                const type = TYPES_SOIN[ligne.soin.type] || TYPES_SOIN.autre
                return (
                  <Link
                    key={`recent-${ligne.soin.id}`}
                    to={`/chevaux/${ligne.cheval.id}?onglet=soins`}
                    className="element"
                    style={{ padding: 8 }}
                  >
                    <span className="bordure-couleur" style={{ background: 'var(--vert-clair)' }} />
                    <div className="corps">
                      <div className="titre" style={{ fontSize: '0.88rem' }}>
                        {type.libelle} · {ligne.cheval.nom}
                      </div>
                    </div>
                    <span className="doux" style={{ fontSize: '0.82rem' }}>
                      {formatDate(ligne.soin.date_realisee, { court: true })}
                    </span>
                    <span className="fleche">›</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

      </main>
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import {
  chargerAnnonces,
  chargerCours,
  chargerCreneaux,
  chargerEcheances,
  chargerMesChevaux,
} from '../lib/requetes'
import { Avatar, Chargement, EtatVide, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import CarteEcheance from '../composants/CarteEcheance'
import { formatDate, formatHeure } from '../lib/format'
import { DISCIPLINES_COURS, TYPES_ANNONCE, TYPES_CRENEAU } from '../lib/constantes'

// Les 3 plus récentes suffisent à l'aperçu : le fil complet vit sur
// /annonces, ici c'est juste de quoi remarquer qu'il y a du nouveau.
const ANNONCES_APERCU = 3

/**
 * Les trois horizons des soins à faire — même découpage que l'accueil du
 * club (HORIZONS de ClubAccueil.jsx), pour la même raison : un soin saisi
 * à l'instant pré-remplit son échéance à 4-12 semaines selon le type, donc
 * la borne du mois est à 30 jours pour rester dans cette fenêtre.
 */
const HORIZONS = {
  jour: { libelle: "Aujourd'hui", limite: 0, vide: "Rien à faire aujourd'hui, tout est à jour." },
  semaine: { libelle: '7 jours', limite: 7, vide: 'Rien à faire ces 7 prochains jours.' },
  mois: { libelle: '30 jours', limite: 30, vide: 'Rien à prévoir ces 30 prochains jours.' },
}

export default function TableauBord() {
  const { profil, utilisateur } = useAuth()
  const [chevaux, setChevaux] = useState([])
  const [echeances, setEcheances] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [cours, setCours] = useState([])
  const [annonces, setAnnonces] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  // L'horizon choisi pour les soins à faire : la journée d'office, comme
  // côté écurie.
  const [horizon, setHorizon] = useState('jour')

  useEffect(() => {
    let annule = false

    async function charger() {
      try {
        const mesChevaux = await chargerMesChevaux(utilisateur.id)
        if (annule) return
        setChevaux(mesChevaux)

        const dans30Jours = new Date()
        dans30Jours.setDate(dans30Jours.getDate() + 30)

        // Les cours du club n'existent que pour un cavalier rattaché à un
        // club — inutile d'interroger la table pour les autres.
        const estDuClub = mesChevaux.some((cheval) => cheval.club_id)

        const [prochainesEcheances, prochainsCreneaux, prochainsCours, dernieresAnnonces] = await Promise.all([
          // Pas de limite ici : le tri par horizon (jour/semaine/mois) se
          // fait à l'affichage, il lui faut la liste complète en main.
          chargerEcheances(),
          chargerCreneaux({
            chevauxIds: mesChevaux.map((c) => c.id),
            debut: new Date(),
            fin: dans30Jours,
          }),
          estDuClub ? chargerCours({ debut: new Date(), fin: dans30Jours }) : Promise.resolve([]),
          chargerAnnonces({ limite: ANNONCES_APERCU }),
        ])

        if (annule) return
        // Seuls les cours où on s'est inscrit — le planning complet du club
        // vit déjà dans l'onglet Cours, ici c'est « le mien qui vient ».
        setCours(prochainsCours.filter((c) => c.inscriptions?.some((i) => i.cavalier_id === utilisateur.id)))
        // Les échéances à jour restent affichées : le code couleur n'a de
        // sens que si le vert existe. Sans lui, un carnet en règle est
        // indistinguable d'un carnet vide.
        setEcheances(prochainesEcheances)
        setCreneaux(prochainsCreneaux.slice(0, 5))
        setAnnonces(dernieresAnnonces)
      } catch (e) {
        if (!annule) setErreur(e.message || 'Chargement impossible')
      } finally {
        if (!annule) setChargement(false)
      }
    }

    charger()
    return () => {
      annule = true
    }
  }, [utilisateur.id])

  // Les retards restent visibles quel que soit l'horizon choisi — même
  // règle que l'accueil du club : « 30 jours » ne doit pas les masquer.
  const echeancesAffichees = useMemo(
    () => echeances.filter((e) => e.jours_restants <= HORIZONS[horizon].limite),
    [echeances, horizon]
  )
  const prochainCours = cours[0] ?? null
  const maPlace = prochainCours?.inscriptions?.find((i) => i.cavalier_id === profil.id)

  if (chargement) return <Chargement />

  const prenom = profil.nom?.split(' ')[0] || ''

  return (
    <>
      <Entete
        titre={`Bonjour ${prenom}`}
        sousTitre={formatDate(new Date(), { avecJour: true })}
        visuel={<Avatar profil={profil} />}
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {/* Une adhésion suffit à recevoir des annonces — pas besoin d'un
            cheval attribué. D'où cette section hors du bloc « aucun
            cheval » ci-dessous, et son silence total sans rien à montrer. */}
        {annonces.length > 0 && (
          <section className="section">
            <div className="titre-section">
              <h2>Annonces</h2>
              <Link to="/annonces" className="lien">Tout voir</Link>
            </div>
            <div className="liste">
              {annonces.map((annonce) => {
                const config = TYPES_ANNONCE[annonce.type] || TYPES_ANNONCE.info
                return (
                  <Link key={annonce.id} to="/annonces" className="element">
                    <div className="corps">
                      <div className="rangee espace">
                        <span className="titre">{annonce.titre}</span>
                        <span className={`badge ${config.classe}`}>{config.libelle}</span>
                      </div>
                      <div className="meta">
                        {annonce.club?.nom} · {formatDate(annonce.cree_le, { court: true })}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {chevaux.length === 0 ? (
          <EtatVide
            emoji="🐴"
            titre="Aucun cheval pour l'instant"
            texte="Ajoutez votre cheval ou rejoignez celui d'un autre cavalier avec un code de demi-pension."
            action={
              <div className="pile">
                <Link to="/chevaux/nouveau" className="bouton">Ajouter un cheval</Link>
                <Link to="/rejoindre" className="bouton secondaire">J'ai un code d'invitation</Link>
              </div>
            }
          />
        ) : (
          <>
            <section className="section">
              <div className="titre-section">
                <h2>Soins à faire</h2>
              </div>

              <div className="choix-puces" role="group" aria-label="Horizon des soins">
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

              {echeancesAffichees.length === 0 ? (
                <div className="carte centre doux">{HORIZONS[horizon].vide}</div>
              ) : (
                <div className="liste">
                  {echeancesAffichees.map((echeance) => (
                    <CarteEcheance key={echeance.id} echeance={echeance} />
                  ))}
                </div>
              )}
            </section>

            <section className="section">
              <div className="titre-section">
                <h2>Prochains créneaux</h2>
              </div>

              {creneaux.length === 0 ? (
                <div className="carte centre doux">Aucun créneau prévu</div>
              ) : (
                <div className="liste">
                  {creneaux.map((creneau) => (
                    <Link
                      key={creneau.id}
                      to={`/chevaux/${creneau.cheval_id}?onglet=calendrier`}
                      className="element"
                    >
                      <span className="bordure-couleur" style={{ background: creneau.couleur }} />
                      <div className="corps">
                        <div className="titre">
                          {creneau.titre || TYPES_CRENEAU[creneau.type] || 'Créneau'}
                        </div>
                        <div className="meta">
                          {creneau.cheval?.nom} · {formatDate(creneau.debut, { court: true })} à{' '}
                          {formatHeure(creneau.debut)}
                        </div>
                      </div>
                      <span className="doux">{creneau.cavalier?.nom?.split(' ')[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {prochainCours && (
              <section className="section">
                <div className="titre-section">
                  <h2>Mon prochain cours</h2>
                </div>

                <div className="liste">
                  <Link to="/cours" className="element">
                    <span className="bordure-couleur" style={{ background: 'var(--bleu)' }} />
                    <div className="corps">
                      <div className="titre">
                        {DISCIPLINES_COURS[prochainCours.discipline]?.libelle}
                        {prochainCours.niveau ? ` · ${prochainCours.niveau}` : ''}
                      </div>
                      <div className="meta">
                        {formatDate(prochainCours.debut, { court: true })} à{' '}
                        {formatHeure(prochainCours.debut)}
                        {maPlace?.cheval ? ` · sur ${maPlace.cheval.nom}` : ''}
                      </div>
                    </div>
                    {maPlace?.statut === 'inscrit' && <span className="badge ok">Inscrit</span>}
                    {maPlace?.statut === 'attente' && <span className="badge urgent">Attente</span>}
                  </Link>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}

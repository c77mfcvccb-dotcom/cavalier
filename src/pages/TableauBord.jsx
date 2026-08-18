import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerCours, chargerCreneaux, chargerEcheances, chargerMesChevaux } from '../lib/requetes'
import { Chargement, EtatVide, Erreur, PhotoCheval } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import CarteEcheance from '../composants/CarteEcheance'
import { formatDate, formatHeure } from '../lib/format'
import { DISCIPLINES_COURS, TYPES_CRENEAU } from '../lib/constantes'

export default function TableauBord() {
  const { profil, utilisateur } = useAuth()
  const [chevaux, setChevaux] = useState([])
  const [echeances, setEcheances] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [cours, setCours] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

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

        const [prochainesEcheances, prochainsCreneaux, prochainsCours] = await Promise.all([
          chargerEcheances({ limite: 6 }),
          chargerCreneaux({
            chevauxIds: mesChevaux.map((c) => c.id),
            debut: new Date(),
            fin: dans30Jours,
          }),
          estDuClub ? chargerCours({ debut: new Date(), fin: dans30Jours }) : Promise.resolve([]),
        ])

        if (annule) return
        setCours(prochainsCours.slice(0, 3))
        // Les échéances à jour restent affichées : le code couleur n'a de
        // sens que si le vert existe. Sans lui, un carnet en règle est
        // indistinguable d'un carnet vide.
        setEcheances(prochainesEcheances)
        setCreneaux(prochainsCreneaux.slice(0, 5))
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

  if (chargement) return <Chargement />

  const prenom = profil.nom?.split(' ')[0] || ''

  return (
    <>
      <Entete titre={`Bonjour ${prenom}`} sousTitre={formatDate(new Date(), { avecJour: true })} />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

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
                <h2>Échéances de soins</h2>
                <Link to="/chevaux" className="lien">Mes chevaux</Link>
              </div>

              {echeances.length === 0 ? (
                <div className="carte centre doux">
                  Tout est à jour côté santé 👌
                </div>
              ) : (
                <div className="liste">
                  {echeances.map((echeance) => (
                    <CarteEcheance key={echeance.id} echeance={echeance} />
                  ))}
                </div>
              )}
            </section>

            <section className="section">
              <div className="titre-section">
                <h2>Prochains créneaux</h2>
                <Link to="/calendrier" className="lien">Calendrier</Link>
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

            {cours.length > 0 && (
              <section className="section">
                <div className="titre-section">
                  <h2>Cours du club</h2>
                  <Link to="/cours" className="lien">Tous les cours</Link>
                </div>

                <div className="liste">
                  {cours.map((c) => {
                    const maPlace = c.inscriptions?.find((i) => i.cavalier_id === profil.id)
                    return (
                      <Link key={c.id} to="/cours" className="element">
                        <span className="bordure-couleur" style={{ background: 'var(--bleu)' }} />
                        <div className="corps">
                          <div className="titre">
                            {DISCIPLINES_COURS[c.discipline]?.emoji}{' '}
                            {DISCIPLINES_COURS[c.discipline]?.libelle}
                            {c.niveau ? ` · ${c.niveau}` : ''}
                          </div>
                          <div className="meta">
                            {formatDate(c.debut, { court: true })} à {formatHeure(c.debut)}
                            {maPlace?.cheval ? ` · sur ${maPlace.cheval.nom}` : ''}
                          </div>
                        </div>
                        {maPlace?.statut === 'inscrit' && <span className="badge ok">Inscrit</span>}
                        {maPlace?.statut === 'attente' && (
                          <span className="badge urgent">Attente</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            <section className="section">
              <div className="titre-section">
                <h2>Mes chevaux</h2>
              </div>
              <div className="liste">
                {chevaux.map((cheval) => (
                  <Link key={cheval.id} to={`/chevaux/${cheval.id}`} className="carte-cheval">
                    <PhotoCheval cheval={cheval} />
                    <div className="infos">
                      <div className="nom">{cheval.nom}</div>
                      <div className="detail">{cheval.race || 'Cheval'}</div>
                    </div>
                    <span className="fleche">›</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  )
}

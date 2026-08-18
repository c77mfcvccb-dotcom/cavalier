import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import {
  chargerChargeChevaux,
  chargerChevauxClub,
  chargerEcheances,
  chargerIndisponibilites,
  indisponibiliteActive,
} from '../lib/requetes'
import { Chargement, Erreur, EtatVide, PhotoCheval } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { MOTIFS_INDISPO } from '../lib/constantes'
import { texteAge } from '../lib/format'

export default function ClubCavalerie() {
  const { profil } = useAuth()
  const [chevaux, setChevaux] = useState([])
  const [alertesParCheval, setAlertesParCheval] = useState(new Map())
  const [chargeParCheval, setChargeParCheval] = useState(new Map())
  const [indisponibilites, setIndisponibilites] = useState([])
  const [recherche, setRecherche] = useState('')
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false

    async function charger() {
      const [cavalerie, echeances] = await Promise.all([
        chargerChevauxClub(profil.id),
        chargerEcheances(),
      ])
      if (annule) return
      setChevaux(cavalerie)

      // Nombre d'échéances en retard ou urgentes, par cheval
      const compteur = new Map()
      for (const echeance of echeances) {
        if (echeance.statut === 'retard' || echeance.statut === 'urgent') {
          compteur.set(echeance.cheval_id, (compteur.get(echeance.cheval_id) || 0) + 1)
        }
      }
      setAlertesParCheval(compteur)

      // Charge de travail et repos : le coup d'œil du gérant avant
      // d'attribuer les chevaux du soir.
      const ids = cavalerie.map((c) => c.id)
      const [charge, indispos] = await Promise.all([
        chargerChargeChevaux(ids),
        chargerIndisponibilites(ids),
      ])
      if (annule) return
      setChargeParCheval(charge)
      setIndisponibilites(indispos)
    }

    charger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [profil.id])

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (!terme) return chevaux
    return chevaux.filter((cheval) =>
      [cheval.nom, cheval.race, cheval.robe]
        .filter(Boolean)
        .some((valeur) => valeur.toLowerCase().includes(terme))
    )
  }, [chevaux, recherche])

  return (
    <>
      <Entete
        titre="Ma cavalerie"
        sousTitre={
          chevaux.length
            ? `${chevaux.length} ${chevaux.length > 1 ? 'chevaux' : 'cheval'}`
            : profil.nom
        }
        action={
          <span className="rangee" style={{ gap: 6 }}>
            <Link to="/club" className="bouton fantome petit">
              Membres
            </Link>
            <Link to="/depenses/soins" className="bouton fantome petit">
              Coûts de soins
            </Link>
          </span>
        }
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {chargement ? (
          <Chargement />
        ) : chevaux.length === 0 ? (
          <EtatVide
            emoji="🏇"
            titre="Cavalerie vide"
            texte="Ajoutez les chevaux de votre écurie pour suivre leurs soins et leur planning."
            action={<Link to="/chevaux/nouveau" className="bouton">Ajouter un cheval</Link>}
          />
        ) : (
          <>
            <div className="champ">
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un cheval…"
              />
            </div>

            <div className="liste">
              {filtres.map((cheval) => {
                const alertes = alertesParCheval.get(cheval.id) || 0
                const charge = chargeParCheval.get(cheval.id)
                const indispo = indisponibiliteActive(indisponibilites, cheval.id)
                const details = [texteAge(cheval.date_naissance), cheval.race]
                  .filter(Boolean)
                  .join(' · ')

                return (
                  <Link key={cheval.id} to={`/chevaux/${cheval.id}`} className="carte-cheval">
                    <PhotoCheval cheval={cheval} />
                    <div className="infos">
                      <div className="nom">{cheval.nom}</div>
                      <div className="detail">{details || 'Fiche à compléter'}</div>
                      <div className="puces" style={{ marginTop: 5 }}>
                        <span className="badge contour">
                          {cheval.nb_cavaliers} cavalier{cheval.nb_cavaliers > 1 ? 's' : ''}
                        </span>
                        {indispo ? (
                          <span className="badge retard">
                            {MOTIFS_INDISPO[indispo.motif]?.emoji} Au repos
                          </span>
                        ) : (
                          charge &&
                          charge.semaine > 0 && (
                            <span className="badge contour">
                              {charge.aujourd_hui > 0
                                ? `${charge.aujourd_hui} fois aujourd'hui`
                                : `${charge.semaine} sur la semaine`}
                            </span>
                          )
                        )}
                        {alertes > 0 && (
                          <span className="badge retard">
                            {alertes} soin{alertes > 1 ? 's' : ''} à prévoir
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="fleche">›</span>
                  </Link>
                )
              })}

              {filtres.length === 0 && (
                <div className="carte centre doux">Aucun cheval ne correspond</div>
              )}
            </div>
          </>
        )}
      </main>

      <Link to="/chevaux/nouveau" className="bouton-flottant" aria-label="Ajouter un cheval">
        +
      </Link>
    </>
  )
}

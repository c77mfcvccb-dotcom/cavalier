import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerMesChevaux } from '../lib/requetes'
import { Chargement, EtatVide, Erreur, PhotoCheval } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { ROLES } from '../lib/constantes'
import { texteAge } from '../lib/format'

export default function MesChevaux() {
  const { utilisateur } = useAuth()
  const [chevaux, setChevaux] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    chargerMesChevaux(utilisateur.id)
      .then(setChevaux)
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [utilisateur.id])

  return (
    <>
      <Entete
        titre="Mes chevaux"
        sousTitre={chevaux.length ? `${chevaux.length} ${chevaux.length > 1 ? 'chevaux' : 'cheval'}` : null}
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {chargement ? (
          <Chargement />
        ) : chevaux.length === 0 ? (
          <EtatVide
            emoji="🐴"
            titre="Aucun cheval"
            texte="Ajoutez le vôtre, ou saisissez le code d'invitation qu'un autre cavalier vous a transmis."
            action={
              <div className="pile">
                <Link to="/chevaux/nouveau" className="bouton">Ajouter un cheval</Link>
                <Link to="/rejoindre" className="bouton secondaire">J'ai un code</Link>
              </div>
            }
          />
        ) : (
          <>
            <div className="liste">
              {chevaux.map((cheval) => {
                const age = texteAge(cheval.date_naissance)
                const details = [age, cheval.race, cheval.robe].filter(Boolean).join(' · ')

                return (
                  <Link key={cheval.id} to={`/chevaux/${cheval.id}`} className="carte-cheval">
                    <PhotoCheval cheval={cheval} />
                    <div className="infos">
                      <div className="nom">{cheval.nom}</div>
                      <div className="detail">{details || 'Fiche à compléter'}</div>
                      <div style={{ marginTop: 5 }}>
                        <span className="badge" style={{ background: `${cheval.couleur}1a`, color: cheval.couleur }}>
                          {ROLES[cheval.role]?.libelle || cheval.role}
                        </span>
                      </div>
                    </div>
                    <span className="fleche">›</span>
                  </Link>
                )
              })}
            </div>

            <Link
              to="/rejoindre"
              className="bouton secondaire pleine-largeur"
              style={{ marginTop: 16 }}
            >
              Rejoindre un cheval avec un code
            </Link>
          </>
        )}
      </main>

      <Link to="/chevaux/nouveau" className="bouton-flottant" aria-label="Ajouter un cheval">
        +
      </Link>
    </>
  )
}

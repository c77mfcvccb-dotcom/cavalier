import { useEffect, useMemo, useState } from 'react'
import { chargerEcheances } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import CarteEcheance from '../composants/CarteEcheance'
import { ORDRE_STATUTS, STATUTS_ECHEANCE, TYPES_SOIN } from '../lib/constantes'

/** Vue globale : toutes les échéances de la cavalerie, triées par urgence. */
export default function ClubSante() {
  const [echeances, setEcheances] = useState([])
  const [filtre, setFiltre] = useState('tous')
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    chargerEcheances()
      .then(setEcheances)
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [])

  const filtrees = useMemo(
    () => (filtre === 'tous' ? echeances : echeances.filter((e) => e.type === filtre)),
    [echeances, filtre]
  )

  const groupes = useMemo(() => {
    const carte = new Map(ORDRE_STATUTS.map((statut) => [statut, []]))
    for (const echeance of filtrees) carte.get(echeance.statut)?.push(echeance)
    return carte
  }, [filtrees])

  const nbUrgents = echeances.filter(
    (e) => e.statut === 'retard' || e.statut === 'urgent'
  ).length

  // Types réellement présents, pour ne pas afficher de filtre vide
  const typesPresents = useMemo(
    () => [...new Set(echeances.map((e) => e.type))],
    [echeances]
  )

  return (
    <>
      <Entete
        titre="Santé de la cavalerie"
        sousTitre={
          chargement
            ? null
            : nbUrgents > 0
              ? `${nbUrgents} soin${nbUrgents > 1 ? 's' : ''} à traiter`
              : 'Tout est à jour'
        }
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {chargement ? (
          <Chargement />
        ) : echeances.length === 0 ? (
          <EtatVide
            emoji="🩺"
            titre="Aucune échéance"
            texte="Renseignez les soins de vos chevaux : les prochaines échéances apparaîtront ici, triées par urgence."
          />
        ) : (
          <>
            <div className="puces" style={{ marginBottom: 16 }}>
              <button
                className={`badge ${filtre === 'tous' ? '' : 'contour'}`}
                onClick={() => setFiltre('tous')}
              >
                Tous
              </button>
              {typesPresents.map((type) => (
                <button
                  key={type}
                  className={`badge ${filtre === type ? '' : 'contour'}`}
                  onClick={() => setFiltre(type)}
                >
                  {TYPES_SOIN[type]?.emoji} {TYPES_SOIN[type]?.libelle || type}
                </button>
              ))}
            </div>

            {ORDRE_STATUTS.map((statut) => {
              const lignes = groupes.get(statut) || []
              if (lignes.length === 0) return null

              return (
                <section key={statut} className="section">
                  <div className="titre-section">
                    <h2>{STATUTS_ECHEANCE[statut].libelle}</h2>
                    <span className="doux">{lignes.length}</span>
                  </div>
                  <div className="liste">
                    {lignes.map((echeance) => (
                      <CarteEcheance key={echeance.id} echeance={echeance} />
                    ))}
                  </div>
                </section>
              )
            })}
          </>
        )}
      </main>
    </>
  )
}

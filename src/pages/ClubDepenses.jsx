import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerChevauxClub } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { TYPES_SOIN } from '../lib/constantes'

const euros = (montant) =>
  `${Number(montant).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

/** Dépenses de soins de toute la cavalerie, sur l'année choisie. */
export default function ClubDepenses() {
  const { profil } = useAuth()
  const [soins, setSoins] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false
    setChargement(true)

    chargerChevauxClub(profil.id)
      .then(async (cavalerie) => {
        if (annule) return
        setChevaux(cavalerie)
        if (cavalerie.length === 0) return

        // v_soins et non la table : la lecture directe de `cout` est
        // refusée depuis la 0019 — le club, gestionnaire, y voit tout.
        const { data, error } = await supabase
          .from('v_soins')
          .select('cheval_id, type, date_realisee, cout')
          .in('cheval_id', cavalerie.map((c) => c.id))
          .not('cout', 'is', null)
          .gte('date_realisee', `${annee}-01-01`)
          .lte('date_realisee', `${annee}-12-31`)

        if (error) throw error
        if (!annule) setSoins(data || [])
      })
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [profil.id, annee])

  const bilan = useMemo(() => {
    const parType = new Map()
    const parCheval = new Map()
    const parMois = new Array(12).fill(0)
    let total = 0

    for (const soin of soins) {
      const montant = Number(soin.cout)
      total += montant
      parType.set(soin.type, (parType.get(soin.type) || 0) + montant)
      parCheval.set(soin.cheval_id, (parCheval.get(soin.cheval_id) || 0) + montant)
      parMois[new Date(soin.date_realisee).getMonth()] += montant
    }

    return {
      total,
      parMois,
      parType: [...parType.entries()].sort((a, b) => b[1] - a[1]),
      parCheval: [...parCheval.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [soins])

  const nomDuCheval = (id) => chevaux.find((c) => c.id === id)?.nom || 'Cheval retiré'
  const maxMois = Math.max(...bilan.parMois, 1)
  const MOIS_COURTS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

  return (
    <>
      <Entete titre="Dépenses" sousTitre="Soins de la cavalerie" retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <div className="calendrier-entete">
          <button onClick={() => setAnnee(annee - 1)} aria-label="Année précédente">‹</button>
          <span className="mois">{annee}</span>
          <button
            onClick={() => setAnnee(annee + 1)}
            disabled={annee >= new Date().getFullYear()}
            aria-label="Année suivante"
          >
            ›
          </button>
        </div>

        {chargement ? (
          <Chargement />
        ) : soins.length === 0 ? (
          <EtatVide
            emoji="💶"
            titre={`Aucune dépense en ${annee}`}
            texte="Renseignez le montant lors de la saisie d'un soin pour suivre le budget de la cavalerie."
          />
        ) : (
          <>
            <div className="carte centre" style={{ marginBottom: 18 }}>
              <div className="doux" style={{ fontSize: '0.82rem' }}>Total {annee}</div>
              <div className="gras" style={{ fontSize: '1.9rem' }}>{euros(bilan.total)}</div>
              <div className="doux" style={{ fontSize: '0.82rem' }}>
                {chevaux.length > 0 && `soit ${euros(bilan.total / chevaux.length)} par cheval`}
              </div>
            </div>

            <section className="section">
              <div className="titre-section">
                <h2>Par mois</h2>
              </div>
              <div className="carte">
                <div className="histogramme">
                  {bilan.parMois.map((montant, i) => (
                    <div key={i} className="colonne" title={euros(montant)}>
                      <span style={{ height: `${(montant / maxMois) * 100}%` }} />
                      <em>{MOIS_COURTS[i]}</em>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="section">
              <div className="titre-section">
                <h2>Par type de soin</h2>
              </div>
              <div className="carte pile" style={{ gap: 8 }}>
                {bilan.parType.map(([type, montant]) => {
                  const config = TYPES_SOIN[type] || TYPES_SOIN.autre
                  return (
                    <div key={type}>
                      <div className="rangee espace" style={{ fontSize: '0.87rem' }}>
                        <span>{config.emoji} {config.libelle}</span>
                        <span className="doux">{euros(montant)}</span>
                      </div>
                      <div className="jauge">
                        <span style={{ width: `${(montant / bilan.total) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="section">
              <div className="titre-section">
                <h2>Par cheval</h2>
              </div>
              <div className="liste">
                {bilan.parCheval.map(([chevalId, montant]) => (
                  <Link key={chevalId} to={`/chevaux/${chevalId}?onglet=soins`} className="element">
                    <div className="corps">
                      <div className="titre">{nomDuCheval(chevalId)}</div>
                    </div>
                    <span className="gras">{euros(montant)}</span>
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

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { chargerSoins } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { SEXES, TYPES_SOIN } from '../lib/constantes'
import { formatDate, texteAge } from '../lib/format'

/**
 * Carnet de santé complet, mis en page pour l'impression.
 *
 * L'export PDF passe par window.print() plutôt que par une librairie :
 * « Enregistrer en PDF » est natif sur mobile comme sur ordinateur, la mise
 * en page reste du CSS, et le bundle ne grossit pas d'un générateur PDF.
 */
export default function CarnetSante() {
  const { id } = useParams()
  const [cheval, setCheval] = useState(null)
  const [soins, setSoins] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false

    async function charger() {
      const { data, error } = await supabase
        .from('chevaux')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (annule) return

      setCheval(data)
      if (data) setSoins(await chargerSoins(id))
    }

    charger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [id])

  if (chargement) return <Chargement />

  if (!cheval) {
    return (
      <>
        <Entete titre="Carnet de santé" retour />
        <main className="contenu">
          <Erreur>{erreur}</Erreur>
          <EtatVide titre="Fiche introuvable" />
        </main>
      </>
    )
  }

  const identite = [
    ['Nom', cheval.nom],
    ['Date de naissance', cheval.date_naissance ? formatDate(cheval.date_naissance) : null],
    ['Âge', texteAge(cheval.date_naissance)],
    ['Sexe', SEXES[cheval.sexe]],
    ['Race', cheval.race],
    ['Robe', cheval.robe],
    ['Propriétaire', cheval.proprietaire_nom],
  ].filter(([, valeur]) => valeur)

  // Un tableau par type de soin, chronologique décroissant
  const groupes = new Map()
  for (const soin of soins) {
    if (!groupes.has(soin.type)) groupes.set(soin.type, [])
    groupes.get(soin.type).push(soin)
  }

  return (
    <>
      <Entete titre="Carnet de santé" sousTitre={cheval.nom} retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <button
          className="bouton pleine-largeur masquer-impression"
          onClick={() => window.print()}
          style={{ marginBottom: 16 }}
        >
          Exporter en PDF
        </button>

        <p className="aide masquer-impression" style={{ marginBottom: 18 }}>
          L'impression propose « Enregistrer au format PDF » (ou « PDF » depuis le
          partage sur iPhone). Le document est prêt à être transmis au vétérinaire
          ou joint à une annonce.
        </p>

        <article className="document">
          <header className="document-entete">
            <div>
              <h1>{cheval.nom}</h1>
              <p className="doux">Carnet de santé — édité le {formatDate(new Date())}</p>
            </div>
            {cheval.photo_url && <img src={cheval.photo_url} alt="" decoding="async" />}
          </header>

          <section>
            <h2>Identité</h2>
            <dl className="tableau-infos">
              {identite.map(([libelle, valeur]) => (
                <div key={libelle} style={{ display: 'contents' }}>
                  <dt>{libelle}</dt>
                  <dd>{valeur}</dd>
                </div>
              ))}
            </dl>
          </section>

          {soins.length === 0 ? (
            <section>
              <h2>Historique des soins</h2>
              <p className="doux">Aucun soin enregistré à ce jour.</p>
            </section>
          ) : (
            [...groupes.entries()].map(([type, entrees]) => {
              const config = TYPES_SOIN[type] || TYPES_SOIN.autre
              return (
                <section key={type}>
                  <h2>
                    {config.libelle}
                  </h2>
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Praticien / produit</th>
                        <th>Prochaine</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entrees.map((soin) => (
                        <tr key={soin.id}>
                          <td>{formatDate(soin.date_realisee, { court: true })}</td>
                          <td>{[soin.praticien, soin.produit].filter(Boolean).join(' · ') || '—'}</td>
                          <td>
                            {soin.prochaine_echeance
                              ? formatDate(soin.prochaine_echeance, { court: true })
                              : '—'}
                          </td>
                          <td>{soin.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )
            })
          )}

          <footer className="document-pied doux">
            Document généré par Licol. Les montants et les informations des
            cavaliers ne figurent pas dans ce carnet.
          </footer>
        </article>
      </main>
    </>
  )
}

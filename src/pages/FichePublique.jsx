import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Chargement, EtatVide } from '../composants/Ui'
import { SEXES, TYPES_SOIN } from '../lib/constantes'
import { formatDate, texteAge } from '../lib/format'

/**
 * Fiche en lecture seule, accessible sans compte via un token.
 *
 * Tout passe par la fonction fiche_publique() en security definer : le rôle
 * anonyme n'a aucun droit de lecture sur les tables, et la charge utile est
 * choisie côté base (ni propriétaire, ni montants, ni cavaliers).
 */
export default function FichePublique() {
  const { token } = useParams()
  const [fiche, setFiche] = useState(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    supabase
      .rpc('fiche_publique', { p_token: token })
      .then(({ data }) => setFiche(data ?? null))
      .catch(() => setFiche(null))
      .finally(() => setChargement(false))
  }, [token])

  if (chargement) return <Chargement />

  if (!fiche) {
    return (
      <div className="app">
        <main className="contenu" style={{ paddingTop: 40 }}>
          <EtatVide
            emoji="🔒"
            titre="Lien indisponible"
            texte="Ce lien de partage a été révoqué ou n'existe pas."
          />
        </main>
      </div>
    )
  }

  const { cheval, soins } = fiche

  const identite = [
    ['Date de naissance', cheval.date_naissance ? formatDate(cheval.date_naissance) : null],
    ['Âge', texteAge(cheval.date_naissance)],
    ['Sexe', SEXES[cheval.sexe]],
    ['Race', cheval.race],
    ['Robe', cheval.robe],
  ].filter(([, valeur]) => valeur)

  const groupes = new Map()
  for (const soin of soins) {
    if (!groupes.has(soin.type)) groupes.set(soin.type, [])
    groupes.get(soin.type).push(soin)
  }

  return (
    <div className="app">
      <main className="contenu" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <button
          className="bouton pleine-largeur masquer-impression"
          onClick={() => window.print()}
          style={{ marginBottom: 16 }}
        >
          Exporter en PDF
        </button>

        <article className="document">
          <header className="document-entete">
            <div>
              <h1>{cheval.nom}</h1>
              <p className="doux">Carnet de santé — consultation en lecture seule</p>
            </div>
            {cheval.photo_url && <img src={cheval.photo_url} alt="" />}
          </header>

          {identite.length > 0 && (
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
          )}

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
                    {config.emoji} {config.libelle}
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
                      {entrees.map((soin, i) => (
                        <tr key={`${type}-${i}`}>
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
            Partagé depuis Cavalier le {formatDate(fiche.genere_le)}. Ce lien peut
            être révoqué à tout moment par le propriétaire du cheval.
          </footer>
        </article>
      </main>
    </div>
  )
}

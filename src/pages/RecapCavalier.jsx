import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerCours } from '../lib/requetes'
import { Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { DISCIPLINES_COURS } from '../lib/constantes'
import { formatDate, formatHeure, formatMoisAnnee } from '../lib/format'

/**
 * Fiche imprimable d'un cavalier pour un mois donné : le détail qui
 * justifie le nombre affiché dans le récapitulatif, prête à joindre à une
 * facture. Même mécanique que le carnet de santé — window.print() plutôt
 * qu'un générateur de PDF.
 */
export default function RecapCavalier() {
  const { cavalierId, mois } = useParams()
  const { profil } = useAuth()
  const [cavalier, setCavalier] = useState(null)
  const [seances, setSeances] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const [annee, indexMois] = mois.split('-').map(Number)
  const dateMois = new Date(annee, indexMois - 1, 1, 12)

  useEffect(() => {
    let annule = false

    async function charger() {
      const [{ data: profilCavalier, error: erreurProfil }, cours] = await Promise.all([
        supabase.from('profils').select('id, nom, photo_url, niveau_galop').eq('id', cavalierId).maybeSingle(),
        chargerCours({
          clubId: profil.id,
          debut: new Date(annee, indexMois - 1, 1),
          fin: new Date(annee, indexMois, 0, 23, 59, 59, 999),
        }),
      ])
      if (erreurProfil) throw erreurProfil
      if (annule) return

      setCavalier(profilCavalier)
      const mesSeances = []
      for (const c of cours) {
        for (const insc of c.inscriptions) {
          if (insc.cavalier_id !== cavalierId) continue
          if (insc.statut !== 'inscrit' || !insc.present) continue
          mesSeances.push({ id: c.id, debut: c.debut, discipline: c.discipline, cheval: insc.cheval })
        }
      }
      mesSeances.sort((a, b) => new Date(a.debut) - new Date(b.debut))
      setSeances(mesSeances)
    }

    charger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cavalierId, mois, profil.id])

  if (chargement) return <Chargement />

  if (!cavalier) {
    return (
      <>
        <Entete titre="Fiche cavalier" retour />
        <main className="contenu">
          <Erreur>{erreur}</Erreur>
          <EtatVide titre="Cavalier introuvable" />
        </main>
      </>
    )
  }

  return (
    <>
      <Entete titre="Fiche cavalier" sousTitre={cavalier.nom} retour />

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
          partage sur iPhone). Le détail des cours suivis, prêt à joindre à une facture.
        </p>

        <article className="document">
          <header className="document-entete">
            <div>
              <h1>{cavalier.nom}</h1>
              <p className="doux">
                {profil.nom} — {formatMoisAnnee(dateMois)}
              </p>
            </div>
          </header>

          <section>
            <h2>Cours suivis</h2>
            {seances.length === 0 ? (
              <p className="doux">Aucun cours pointé présent ce mois-ci.</p>
            ) : (
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Discipline</th>
                    <th>Cheval</th>
                  </tr>
                </thead>
                <tbody>
                  {seances.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDate(s.debut, { court: true })}</td>
                      <td>{formatHeure(s.debut)}</td>
                      <td>{DISCIPLINES_COURS[s.discipline]?.libelle || s.discipline}</td>
                      <td>{s.cheval?.nom || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <footer className="document-pied doux">
            {seances.length} cours suivi{seances.length > 1 ? 's' : ''} en {formatMoisAnnee(dateMois)} — document
            généré par Licol.
          </footer>
        </article>
      </main>
    </>
  )
}

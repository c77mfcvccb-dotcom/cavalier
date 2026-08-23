import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexte/AuthContexte'
import { chargerCours } from '../lib/requetes'
import { debutMois, decalerMois, moisSuivantPossible } from '../lib/depenses'
import { formatDate, formatMoisAnnee } from '../lib/format'
import { Avatar, Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { DISCIPLINES_COURS } from '../lib/constantes'

/**
 * Le récapitulatif comptable du club : combien de cours chaque cavalier a
 * suivis dans le mois, pour la facturation. Compte les cours POINTÉS
 * présent (`present = true`) — une inscription pas encore pointée ne dit
 * rien de ce qui s'est réellement passé, elle ne doit donc pas se
 * facturer. Un stage se lit comme plusieurs cours du mois : rien à
 * distinguer, chaque séance compte pour elle-même.
 */
export default function RecapMensuel() {
  const { profil } = useAuth()
  const [mois, setMois] = useState(() => debutMois(new Date()))
  const [cours, setCours] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [depli, setDepli] = useState(null)

  const recharger = useCallback(async () => {
    setChargement(true)
    try {
      const debut = new Date(mois.getFullYear(), mois.getMonth(), 1)
      const fin = new Date(mois.getFullYear(), mois.getMonth() + 1, 0, 23, 59, 59, 999)
      setCours(await chargerCours({ clubId: profil.id, debut, fin }))
    } catch (e) {
      setErreur(e.message || 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [profil.id, mois])

  useEffect(() => {
    recharger()
  }, [recharger])

  const { parCavalier, aPointer } = useMemo(() => {
    const map = new Map()
    let aPointer = 0
    for (const c of cours) {
      for (const insc of c.inscriptions) {
        if (insc.statut !== 'inscrit') continue
        if (insc.present === null || insc.present === undefined) {
          if (new Date(c.debut) < new Date()) aPointer += 1
          continue
        }
        if (!insc.present) continue
        if (!map.has(insc.cavalier_id)) {
          map.set(insc.cavalier_id, { cavalier: insc.cavalier, seances: [] })
        }
        map.get(insc.cavalier_id).seances.push({
          id: c.id,
          debut: c.debut,
          discipline: c.discipline,
          cheval: insc.cheval,
        })
      }
    }
    const parCavalier = [...map.values()]
      .map((entree) => ({
        ...entree,
        seances: entree.seances.sort((a, b) => new Date(a.debut) - new Date(b.debut)),
      }))
      .sort((a, b) => (a.cavalier?.nom || '').localeCompare(b.cavalier?.nom || ''))
    return { parCavalier, aPointer }
  }, [cours])

  const totalSeances = parCavalier.reduce((n, e) => n + e.seances.length, 0)

  return (
    <>
      <Entete titre="Récapitulatif mensuel" sousTitre="Cours suivis, par cavalier" retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        <section className="carte total-mois">
          <div className="navigation-mois">
            <button
              type="button"
              onClick={() => setMois(decalerMois(mois, -1))}
              aria-label="Mois précédent"
            >
              ‹
            </button>
            <span className="gras">{formatMoisAnnee(mois)}</span>
            <button
              type="button"
              onClick={() => setMois(decalerMois(mois, 1))}
              disabled={!moisSuivantPossible(mois)}
              aria-label="Mois suivant"
            >
              ›
            </button>
          </div>
          <div className="montant">{totalSeances}</div>
          <div className="doux">
            {totalSeances === 0
              ? 'Aucun cours pointé présent ce mois-ci'
              : `cours suivis, ${parCavalier.length} cavalier${parCavalier.length > 1 ? 's' : ''}`}
          </div>
        </section>

        {aPointer > 0 && (
          <p className="aide">
            {aPointer} inscription{aPointer > 1 ? 's' : ''} à un cours passé n'{aPointer > 1 ? 'ont' : 'a'}{' '}
            pas encore été pointée{aPointer > 1 ? 's' : ''} présent — le pointage se fait sur la fiche du
            cours, onglet Cours. Comptée{aPointer > 1 ? 's' : ''} ici dès que c'est fait.
          </p>
        )}

        {chargement ? (
          <Chargement />
        ) : parCavalier.length === 0 ? (
          <EtatVide
            titre="Rien à recenser ce mois-ci"
            texte="Une fois les cours de ce mois pointés présent, ils apparaîtront ici, par cavalier."
          />
        ) : (
          <div className="liste">
            {parCavalier.map(({ cavalier, seances }) => {
              const ouvert = depli === cavalier?.id
              return (
                <div key={cavalier?.id} className="carte" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    className="entete-groupe"
                    onClick={() => setDepli(ouvert ? null : cavalier?.id)}
                  >
                    <Avatar profil={cavalier} />
                    <span className="gras" style={{ flex: 1, textAlign: 'left', marginLeft: 10 }}>
                      {cavalier?.nom}
                    </span>
                    <span className="badge contour">
                      {seances.length} cours
                    </span>
                    <span className="doux">{ouvert ? '▴' : '▾'}</span>
                  </button>

                  {ouvert && (
                    <div className="pile" style={{ gap: 0 }}>
                      {seances.map((s) => (
                        <div key={s.id} className="ligne-soin">
                          <div className="corps">
                            <div className="rangee espace">
                              <span className="gras" style={{ fontSize: '0.9rem' }}>
                                {formatDate(s.debut, { avecJour: true })}
                              </span>
                              <span className="doux">
                                {DISCIPLINES_COURS[s.discipline]?.libelle || s.discipline}
                              </span>
                            </div>
                            {s.cheval?.nom && <div className="meta">{s.cheval.nom}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

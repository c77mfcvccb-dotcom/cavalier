import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { chargerChevauxClub, chargerJournalSeances } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Avatar, Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { RESSENTIS, TYPES_SEANCE } from '../lib/constantes'
import { cleJour, formatDate } from '../lib/format'

/**
 * Le tableau de suivi de la cavalerie : ce que les cavaliers notent après
 * leurs séances, tous chevaux confondus. C'est la contrepartie du partage —
 * la demi-pensionnaire écrit sur la fiche de son cheval, et le club voit
 * tout d'un seul écran au lieu d'ouvrir les fiches une à une. Les ressentis
 * inquiétants (boiterie suspectée, blessure) ressortent en tête.
 */
export default function ClubJournal() {
  const { profil } = useAuth()
  const [chevaux, setChevaux] = useState([])
  const [seances, setSeances] = useState([])
  const [filtre, setFiltre] = useState('')
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const cavalerie = await chargerChevauxClub(profil.id)
    setChevaux(cavalerie)
    setSeances(await chargerJournalSeances(cavalerie.map((c) => c.id)))
  }, [profil.id])

  useEffect(() => {
    let annule = false
    recharger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))
    return () => {
      annule = true
    }
  }, [recharger])

  // Une séance notée depuis un téléphone apparaît ici sans recharger.
  useAgendaVivant(chevaux.map((c) => c.id), recharger)

  const filtrees = useMemo(
    () => (filtre ? seances.filter((s) => s.cheval_id === filtre) : seances),
    [seances, filtre]
  )

  // Les alertes santé des derniers jours, remontées au-dessus du fil
  const alertes = useMemo(
    () => filtrees.filter((s) => RESSENTIS[s.ressenti]?.alerte).slice(0, 5),
    [filtrees]
  )

  const parJour = useMemo(() => {
    const carte = new Map()
    for (const seance of filtrees) {
      const cle = cleJour(seance.date)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(seance)
    }
    return [...carte.entries()]
  }, [filtrees])

  return (
    <>
      <Entete titre="Journal" sousTitre="Ce que notent vos cavaliers" retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {chargement ? (
          <Chargement />
        ) : (
          <>
            {chevaux.length > 1 && (
              <div className="champ">
                <select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
                  <option value="">Tous les chevaux</option>
                  {chevaux.map((cheval) => (
                    <option key={cheval.id} value={cheval.id}>{cheval.nom}</option>
                  ))}
                </select>
              </div>
            )}

            {alertes.length > 0 && (
              <section className="section">
                <div className="titre-section">
                  <h2>À surveiller</h2>
                </div>
                <div className="liste">
                  {alertes.map((seance) => (
                    <Link
                      key={`alerte-${seance.id}`}
                      to={`/chevaux/${seance.cheval_id}?onglet=seances`}
                      className="element"
                    >
                      <span style={{ fontSize: '1.3rem' }}>
                        {RESSENTIS[seance.ressenti].emoji}
                      </span>
                      <div className="corps">
                        <div className="titre">
                          {seance.cheval?.nom} — {RESSENTIS[seance.ressenti].libelle}
                        </div>
                        <div className="meta">
                          {formatDate(seance.date, { court: true })} ·{' '}
                          {seance.cavalier?.nom}
                          {seance.notes ? ` · ${seance.notes}` : ''}
                        </div>
                      </div>
                      <span className="badge retard">Alerte</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {parJour.length === 0 ? (
              <EtatVide
                emoji="📓"
                titre="Aucune séance notée"
                texte="Quand vos cavaliers noteront leurs séances sur les fiches des chevaux, tout apparaîtra ici, du plus récent au plus ancien."
              />
            ) : (
              parJour.map(([jour, elements]) => (
                <section key={jour} className="section">
                  <div className="titre-section">
                    <h2 style={{ fontSize: '1rem' }}>
                      {formatDate(jour, { avecJour: true, court: true })}
                    </h2>
                    <span className="doux">{elements.length}</span>
                  </div>

                  <div className="liste">
                    {elements.map((seance) => {
                      const ressenti = RESSENTIS[seance.ressenti]
                      return (
                        <Link
                          key={seance.id}
                          to={`/chevaux/${seance.cheval_id}?onglet=seances`}
                          className="element"
                        >
                          <Avatar profil={seance.cavalier} />
                          <div className="corps">
                            <div className="titre">
                              {seance.cheval?.nom} ·{' '}
                              {TYPES_SEANCE[seance.type] || seance.type}
                              {seance.duree_min ? ` · ${seance.duree_min} min` : ''}
                            </div>
                            <div className="meta">
                              {seance.cavalier?.nom}
                              {seance.notes ? ` · ${seance.notes}` : ''}
                            </div>
                          </div>
                          {ressenti && (
                            <span
                              className={`badge ${ressenti.alerte ? 'retard' : 'contour'}`}
                              title={ressenti.libelle}
                            >
                              {ressenti.emoji} {ressenti.libelle}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </main>
    </>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerChevauxVisibles } from '../lib/requetes'
import { Chargement, Erreur, EtatVide, Feuille } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import BloquePremium from '../composants/BloquePremium'
import GraphiqueMensuel from '../composants/GraphiqueMensuel'
import FeuilleDepense from '../composants/FeuilleDepense'
import { CATEGORIES_DEPENSE } from '../lib/constantes'
import { formatDate, formatMoisAnnee } from '../lib/format'
import {
  cleMois,
  debutMois,
  decalerMois,
  euros,
  fenetreGlissante,
  filtrerParCheval,
  moisSuivantPossible,
  repartitionParCategorie,
  seriesMensuelle,
  total as sommer,
} from '../lib/depenses'

export default function Depenses() {
  const { profil, estClub, estPremium } = useAuth()

  const [mois, setMois] = useState(() => debutMois(new Date()))
  const [chevalFiltre, setChevalFiltre] = useState('')
  const [depenses, setDepenses] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [enEdition, setEnEdition] = useState(null)
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)

  /**
   * Une seule requête pour les douze mois affichés, rechargée uniquement
   * quand la fenêtre glissante change de mois. Naviguer d'un mois à l'autre
   * à l'intérieur de la fenêtre ne touche donc pas la base.
   */
  const recharger = useCallback(async () => {
    if (!estPremium) {
      setChargement(false)
      return
    }
    setChargement(true)
    try {
      const fenetre = fenetreGlissante(mois)
      const [lignes, cavalerie] = await Promise.all([
        supabase
          .from('depenses')
          .select('id, cheval_id, montant, categorie, date, note')
          .gte('date', fenetre.debut)
          .lte('date', fenetre.fin)
          .order('date', { ascending: false }),
        chargerChevauxVisibles(profil),
      ])
      if (lignes.error) throw lignes.error
      setDepenses(lignes.data || [])
      setChevaux(cavalerie || [])
      setErreur('')
    } catch (e) {
      setErreur(e.message || 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [estPremium, mois, profil])

  useEffect(() => {
    recharger()
  }, [recharger])

  const filtrees = useMemo(
    () => filtrerParCheval(depenses, chevalFiltre || null),
    [depenses, chevalFiltre]
  )

  const series = useMemo(() => seriesMensuelle(filtrees, mois), [filtrees, mois])

  const duMois = useMemo(() => {
    const cle = cleMois(mois)
    return filtrees.filter((d) => cleMois(d.date) === cle)
  }, [filtrees, mois])

  const totalMois = useMemo(() => sommer(duMois), [duMois])
  const repartition = useMemo(() => repartitionParCategorie(duMois), [duMois])

  const nomCheval = (id) =>
    id ? chevaux.find((c) => c.id === id)?.nom || 'Cheval retiré' : 'Tous les chevaux'

  async function supprimer(depense) {
    const { error } = await supabase.from('depenses').delete().eq('id', depense.id)
    setASupprimer(null)
    if (error) {
      setErreur(error.message)
      return
    }
    setDepenses((liste) => liste.filter((d) => d.id !== depense.id))
  }

  if (!estPremium) {
    return (
      <>
        <Entete titre="Dépenses" retour />
        <main className="contenu">
          <BloquePremium
            emoji="💶"
            titre="Suivi des dépenses"
            texte="Pension, maréchal, vétérinaire, concours — le budget réel de votre cheval, mois par mois."
            motif="depenses"
          />
        </main>
      </>
    )
  }

  return (
    <>
      <Entete
        titre="Dépenses"
        retour
        action={
          <button
            className="bouton petit"
            onClick={() => {
              setEnEdition(null)
              setFeuilleOuverte(true)
            }}
          >
            + Ajouter
          </button>
        }
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {/* Le total du mois est l'information principale : il est traité
            comme un titre, pas comme une ligne de tableau. */}
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
          <div className="montant">{euros(totalMois)}</div>
          <div className="doux">
            {duMois.length === 0
              ? 'Aucune dépense ce mois-ci'
              : `${duMois.length} dépense${duMois.length > 1 ? 's' : ''}${
                  chevalFiltre ? ` — ${nomCheval(chevalFiltre)}` : ''
                }`}
          </div>
        </section>

        {chevaux.length > 0 && (
          <div className="filtre-chevaux">
            <select
              value={chevalFiltre}
              onChange={(e) => setChevalFiltre(e.target.value)}
              aria-label="Filtrer par cheval"
            >
              <option value="">Tous les chevaux</option>
              {chevaux.map((cheval) => (
                <option key={cheval.id} value={cheval.id}>
                  {cheval.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        {chargement ? (
          <Chargement />
        ) : (
          <>
            <section style={{ marginTop: 18 }}>
              <div className="titre-section">
                <h2>12 derniers mois</h2>
              </div>
              <div className="carte">
                <GraphiqueMensuel
                  series={series}
                  moisActif={cleMois(mois)}
                  onChoisirMois={setMois}
                />
              </div>
            </section>

            {repartition.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <div className="titre-section">
                  <h2>Répartition</h2>
                </div>
                <div className="carte repartition">
                  {repartition.map((poste) => (
                    <div className="poste" key={poste.categorie}>
                      <div className="entete">
                        <span>
                          {poste.emoji} {poste.libelle}
                        </span>
                        <span className="gras">{euros(poste.montant)}</span>
                      </div>
                      <span className="piste">
                        <span
                          className="remplissage"
                          style={{ width: `${Math.max(2, poste.part * 100)}%` }}
                        />
                      </span>
                      <span className="aide">{Math.round(poste.part * 100)} %</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={{ marginTop: 18 }}>
              <div className="titre-section">
                <h2>Détail du mois</h2>
              </div>

              {duMois.length === 0 ? (
                <EtatVide
                  emoji="💶"
                  titre="Rien d’enregistré"
                  texte={`Aucune dépense en ${formatMoisAnnee(mois).toLowerCase()}.`}
                  action={
                    <button
                      className="bouton"
                      onClick={() => {
                        setEnEdition(null)
                        setFeuilleOuverte(true)
                      }}
                    >
                      Ajouter une dépense
                    </button>
                  }
                />
              ) : (
                <div className="liste">
                  {duMois.map((depense) => {
                    const categorie = CATEGORIES_DEPENSE[depense.categorie]
                    return (
                      <div className="element" key={depense.id}>
                        <span style={{ fontSize: '1.3rem' }}>{categorie?.emoji ?? '💶'}</span>
                        <div className="corps">
                          <div className="titre">
                            {categorie?.libelle ?? depense.categorie}
                          </div>
                          <div className="meta">
                            {formatDate(depense.date, { court: true })} ·{' '}
                            {nomCheval(depense.cheval_id)}
                            {depense.note ? ` · ${depense.note}` : ''}
                          </div>
                        </div>
                        <div className="actions-depense">
                          <span className="gras">{euros(depense.montant, { centimes: true })}</span>
                          <span>
                            <button
                              className="bouton fantome petit"
                              onClick={() => {
                                setEnEdition(depense)
                                setFeuilleOuverte(true)
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              className="bouton fantome petit danger"
                              onClick={() => setASupprimer(depense)}
                            >
                              Supprimer
                            </button>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {estClub && (
              <p className="aide centre" style={{ marginTop: 22 }}>
                <Link to="/depenses/soins">
                  Voir les coûts de soins de toute la cavalerie ›
                </Link>
              </p>
            )}
          </>
        )}
      </main>

      <FeuilleDepense
        ouverte={feuilleOuverte}
        depense={enEdition}
        chevaux={chevaux}
        profilId={profil.id}
        moisAffiche={mois}
        onFermer={() => setFeuilleOuverte(false)}
        onEnregistre={() => {
          setFeuilleOuverte(false)
          recharger()
        }}
      />

      <Feuille
        titre="Supprimer cette dépense"
        ouverte={Boolean(aSupprimer)}
        onFermer={() => setASupprimer(null)}
      >
        <p className="doux" style={{ marginBottom: 14 }}>
          {aSupprimer &&
            `${CATEGORIES_DEPENSE[aSupprimer.categorie]?.libelle ?? aSupprimer.categorie} — ${euros(
              aSupprimer.montant,
              { centimes: true }
            )} du ${formatDate(aSupprimer.date)}.`}
        </p>
        <div className="pile">
          <button className="bouton danger" onClick={() => supprimer(aSupprimer)}>
            Supprimer
          </button>
          <button className="bouton fantome" onClick={() => setASupprimer(null)}>
            Annuler
          </button>
        </div>
      </Feuille>
    </>
  )
}

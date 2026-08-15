import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { chargerSoins } from '../../lib/requetes'
import { Champ, Chargement, Erreur, EtatVide, Feuille } from '../../composants/Ui'
import { STATUTS_ECHEANCE, TYPES_SOIN } from '../../lib/constantes'
import { ajouterJours, cleJour, formatDate, joursRelatifs } from '../../lib/format'

/** Statut calculé côté client, avec les mêmes seuils que la vue v_echeances. */
function statutEcheance(dateEcheance) {
  if (!dateEcheance) return null
  const jours = Math.round(
    (new Date(dateEcheance) - new Date(cleJour(new Date()))) / 86400000
  )
  if (jours < 0) return { cle: 'retard', jours }
  if (jours <= 7) return { cle: 'urgent', jours }
  if (jours <= 30) return { cle: 'bientot', jours }
  return { cle: 'ok', jours }
}

export default function OngletSoins({ cheval }) {
  const { profil } = useAuth()
  const [soins, setSoins] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)

  const recharger = useCallback(async () => {
    try {
      setSoins(await chargerSoins(cheval.id))
    } catch (e) {
      setErreur(e.message || 'Chargement des soins impossible')
    } finally {
      setChargement(false)
    }
  }, [cheval.id])

  useEffect(() => {
    recharger()
  }, [recharger])

  // Échéance active = le soin le plus récent de chaque type qui en porte une.
  const echeances = useMemo(() => {
    const parType = new Map()
    for (const soin of soins) {
      if (!soin.prochaine_echeance) continue
      if (!parType.has(soin.type)) parType.set(soin.type, soin)
    }
    return [...parType.values()].sort(
      (a, b) => new Date(a.prochaine_echeance) - new Date(b.prochaine_echeance)
    )
  }, [soins])

  async function supprimer(soin) {
    if (!window.confirm('Supprimer cette entrée de suivi ?')) return
    const { error } = await supabase.from('soins').delete().eq('id', soin.id)
    if (error) setErreur(error.message)
    else recharger()
  }

  if (chargement) return <Chargement />

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      <button className="bouton pleine-largeur" onClick={() => setFeuilleOuverte(true)}>
        + Ajouter un soin
      </button>

      {echeances.length > 0 && (
        <section>
          <div className="titre-section">
            <h2>Prochaines échéances</h2>
          </div>
          <div className="liste">
            {echeances.map((soin) => {
              const type = TYPES_SOIN[soin.type] || TYPES_SOIN.autre
              const statut = statutEcheance(soin.prochaine_echeance)
              return (
                <div key={`echeance-${soin.id}`} className="element">
                  <span style={{ fontSize: '1.4rem' }}>{type.emoji}</span>
                  <div className="corps">
                    <div className="titre">{type.libelle}</div>
                    <div className="meta">
                      {formatDate(soin.prochaine_echeance, { court: true })} —{' '}
                      {joursRelatifs(statut.jours)}
                    </div>
                  </div>
                  <span className={`badge ${STATUTS_ECHEANCE[statut.cle].classe}`}>
                    {STATUTS_ECHEANCE[statut.cle].libelle}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className="titre-section">
          <h2>Historique</h2>
        </div>

        {soins.length === 0 ? (
          <EtatVide
            emoji="🩺"
            titre="Aucun soin enregistré"
            texte="Ferrure, vaccins, vermifuges, ostéo… tout le suivi est partagé entre les cavaliers du cheval."
          />
        ) : (
          <div className="liste">
            {soins.map((soin) => {
              const type = TYPES_SOIN[soin.type] || TYPES_SOIN.autre
              const details = [soin.praticien, soin.produit].filter(Boolean).join(' · ')
              return (
                <div key={soin.id} className="element">
                  <span style={{ fontSize: '1.3rem' }}>{type.emoji}</span>
                  <div className="corps">
                    <div className="titre">{type.libelle}</div>
                    <div className="meta">{formatDate(soin.date_realisee)}</div>
                    {details && <div className="meta">{details}</div>}
                    {soin.notes && (
                      <div className="meta" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                        {soin.notes}
                      </div>
                    )}
                    {soin.prochaine_echeance && (
                      <div className="meta">
                        Prochaine : {formatDate(soin.prochaine_echeance, { court: true })}
                      </div>
                    )}
                  </div>
                  {soin.cout ? <span className="doux">{soin.cout} €</span> : null}
                  <button className="bouton fantome petit" onClick={() => supprimer(soin)}>
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <FeuilleSoin
        cheval={cheval}
        profilId={profil.id}
        ouverte={feuilleOuverte}
        onFermer={() => setFeuilleOuverte(false)}
        onAjoute={() => {
          setFeuilleOuverte(false)
          recharger()
        }}
      />
    </div>
  )
}

function FeuilleSoin({ cheval, profilId, ouverte, onFermer, onAjoute }) {
  const valeursParDefaut = () => ({
    type: 'ferrure',
    date_realisee: cleJour(new Date()),
    prochaine_echeance: ajouterJours(new Date(), TYPES_SOIN.ferrure.intervalleJours),
    praticien: '',
    produit: '',
    cout: '',
    notes: '',
  })

  const [valeurs, setValeurs] = useState(valeursParDefaut)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setValeurs(valeursParDefaut())
      setErreur('')
    }
  }

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  // Changer de type (ou de date) recalcule l'échéance avec l'intervalle habituel.
  function changerType(evenement) {
    const type = evenement.target.value
    const intervalle = TYPES_SOIN[type]?.intervalleJours
    setValeurs((v) => ({
      ...v,
      type,
      prochaine_echeance: intervalle ? ajouterJours(v.date_realisee, intervalle) : '',
    }))
  }

  function changerDate(evenement) {
    const date_realisee = evenement.target.value
    const intervalle = TYPES_SOIN[valeurs.type]?.intervalleJours
    setValeurs((v) => ({
      ...v,
      date_realisee,
      prochaine_echeance:
        intervalle && date_realisee ? ajouterJours(date_realisee, intervalle) : v.prochaine_echeance,
    }))
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    const { error } = await supabase.from('soins').insert({
      cheval_id: cheval.id,
      type: valeurs.type,
      date_realisee: valeurs.date_realisee,
      prochaine_echeance: valeurs.prochaine_echeance || null,
      praticien: valeurs.praticien || null,
      produit: valeurs.produit || null,
      cout: valeurs.cout ? Number(valeurs.cout) : null,
      notes: valeurs.notes || null,
      cree_par: profilId,
    })

    setEnvoi(false)
    if (error) setErreur(error.message)
    else onAjoute()
  }

  return (
    <Feuille titre="Nouveau soin" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Type de soin">
          <select value={valeurs.type} onChange={changerType}>
            {Object.entries(TYPES_SOIN).map(([cle, config]) => (
              <option key={cle} value={cle}>
                {config.emoji} {config.libelle}
              </option>
            ))}
          </select>
        </Champ>

        <div className="ligne-champs">
          <Champ label="Date">
            <input type="date" value={valeurs.date_realisee} onChange={changerDate} required />
          </Champ>
          <Champ label="Prochaine échéance">
            <input
              type="date"
              value={valeurs.prochaine_echeance || ''}
              onChange={modifier('prochaine_echeance')}
            />
          </Champ>
        </div>

        <Champ label="Praticien" aide="Maréchal, vétérinaire, ostéopathe…">
          <input value={valeurs.praticien} onChange={modifier('praticien')} />
        </Champ>

        {['vaccin', 'vermifuge'].includes(valeurs.type) && (
          <Champ label="Produit">
            <input
              value={valeurs.produit}
              onChange={modifier('produit')}
              placeholder={valeurs.type === 'vaccin' ? 'Grippe + tétanos…' : 'Equimax…'}
            />
          </Champ>
        )}

        <Champ label="Coût (€)">
          <input type="number" min="0" step="0.01" value={valeurs.cout} onChange={modifier('cout')} />
        </Champ>

        <Champ label="Notes">
          <textarea value={valeurs.notes} onChange={modifier('notes')} />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </Feuille>
  )
}

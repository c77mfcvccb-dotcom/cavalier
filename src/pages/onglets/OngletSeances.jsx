import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { chargerSeances } from '../../lib/requetes'
import { Avatar, Champ, Chargement, Erreur, EtatVide, Feuille } from '../../composants/Ui'
import { RESSENTIS, TYPES_SEANCE } from '../../lib/constantes'
import { traitCavalier } from '../../lib/couleurs'
import { cleJour, formatDate, joursRelatifs } from '../../lib/format'

export default function OngletSeances({ cheval, cavaliers, estGestionnaire }) {
  const { profil } = useAuth()
  const [seances, setSeances] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)

  const recharger = useCallback(async () => {
    try {
      setSeances(await chargerSeances(cheval.id))
    } catch (e) {
      setErreur(e.message || 'Chargement des séances impossible')
    } finally {
      setChargement(false)
    }
  }, [cheval.id])

  useEffect(() => {
    recharger()
  }, [recharger])


  const seuil = profil.seuil_inactivite_jours ?? 7

  /** Jours écoulés depuis la dernière séance ; null si le carnet est vide. */
  const joursSansTravail = useMemo(() => {
    if (seances.length === 0) return null
    const derniere = seances.reduce((max, s) => (s.date > max ? s.date : max), seances[0].date)
    return Math.round((new Date(cleJour(new Date())) - new Date(derniere)) / 86400000)
  }, [seances])

  // Un ressenti inquiétant récent mérite d'être remonté en tête
  const alerteSante = useMemo(
    () => seances.slice(0, 3).find((s) => RESSENTIS[s.ressenti]?.alerte),
    [seances]
  )

  async function supprimer(seance) {
    if (!window.confirm('Supprimer cette séance ?')) return
    const { error } = await supabase.from('seances').delete().eq('id', seance.id)
    if (error) setErreur(error.message)
    else recharger()
  }

  if (chargement) return <Chargement />

  return (
    <div className="pile" style={{ gap: 16 }}>
      <Erreur>{erreur}</Erreur>

      {alerteSante && (
        <div className="carte" style={{ borderColor: '#f0c8c2', background: '#fdf3f1' }}>
          <div className="rangee">
            <span style={{ fontSize: '1.3rem' }}>{RESSENTIS[alerteSante.ressenti].emoji}</span>
            <div>
              <div className="gras">{RESSENTIS[alerteSante.ressenti].libelle}</div>
              <div className="meta">
                Noté le {formatDate(alerteSante.date, { court: true })} par{' '}
                {alerteSante.cavalier?.nom}
              </div>
            </div>
          </div>
        </div>
      )}

      {joursSansTravail !== null && joursSansTravail >= seuil && (
        <div className="carte" style={{ borderColor: '#f0dcc0', background: '#fdf7ee' }}>
          <div className="rangee">
            <span style={{ fontSize: '1.3rem' }}>😴</span>
            <div>
              <div className="gras">
                {cheval.nom} n'a pas travaillé depuis {joursSansTravail} jours
              </div>
              <div className="meta">Seuil d'alerte réglé sur {seuil} jours dans votre profil.</div>
            </div>
          </div>
        </div>
      )}

      <button className="bouton pleine-largeur" onClick={() => setFeuilleOuverte(true)}>
        + Noter une séance
      </button>

      {seances.length === 0 ? (
        <EtatVide
          emoji="📓"
          titre="Carnet vide"
          texte="Notez vos séances : elles sont visibles par tous les cavaliers liés au cheval."
        />
      ) : (
        <>
          {joursSansTravail !== null && joursSansTravail < seuil && (
            <p className="aide">
              Dernière séance {joursRelatifs(-joursSansTravail)}.
            </p>
          )}

          <div className="liste">
            {seances.map((seance) => {
              const ressenti = RESSENTIS[seance.ressenti]
              return (
                <div key={seance.id} className="element">
                  <span
                    className="bordure-couleur"
                    style={{ background: traitCavalier(seance.cavalier_id) }}
                  />
                  <div className="corps">
                    <div className="titre">
                      {TYPES_SEANCE[seance.type] || seance.type}
                      {seance.duree_min ? (
                        <span className="doux"> · {seance.duree_min} min</span>
                      ) : null}
                    </div>
                    <div className="meta">
                      {formatDate(seance.date, { court: true })} · {seance.cavalier?.nom}
                    </div>
                    {ressenti && (
                      <div style={{ marginTop: 5 }}>
                        <span className={`badge ${ressenti.alerte ? 'retard' : 'ok'}`}>
                          {ressenti.emoji} {ressenti.libelle}
                        </span>
                      </div>
                    )}
                    {seance.notes && (
                      <div className="meta" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                        {seance.notes}
                      </div>
                    )}
                  </div>
                  <Avatar profil={seance.cavalier} />
                  {(seance.cavalier_id === profil.id || estGestionnaire) && (
                    <button className="bouton fantome petit" onClick={() => supprimer(seance)}>
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <FeuilleSeance
        cheval={cheval}
        cavaliers={cavaliers}
        estGestionnaire={estGestionnaire}
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

function FeuilleSeance({ cheval, cavaliers, estGestionnaire, ouverte, onFermer, onAjoute }) {
  const { profil } = useAuth()

  const valeursParDefaut = useCallback(() => {
    const suisCavalier = cavaliers.some((liaison) => liaison.cavalier_id === profil.id)
    return {
      date: cleJour(new Date()),
      type: 'plat',
      ressenti: 'ras',
      duree_min: 45,
      notes: '',
      cavalier_id: suisCavalier ? profil.id : cavaliers[0]?.cavalier_id ?? profil.id,
    }
  }, [cavaliers, profil.id])

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

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    const { error } = await supabase.from('seances').insert({
      cheval_id: cheval.id,
      cavalier_id: valeurs.cavalier_id,
      date: valeurs.date,
      type: valeurs.type,
      ressenti: valeurs.ressenti || null,
      duree_min: valeurs.duree_min ? Number(valeurs.duree_min) : null,
      notes: valeurs.notes || null,
    })

    setEnvoi(false)
    if (error) setErreur(error.message)
    else onAjoute()
  }

  return (
    <Feuille titre="Nouvelle séance" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        {estGestionnaire && cavaliers.length > 0 && (
          <Champ label="Cavalier">
            <select value={valeurs.cavalier_id} onChange={modifier('cavalier_id')}>
              {cavaliers.map((liaison) => (
                <option key={liaison.id} value={liaison.cavalier_id}>
                  {liaison.profil?.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}

        <div className="ligne-champs">
          <Champ label="Date">
            <input type="date" value={valeurs.date} onChange={modifier('date')} required />
          </Champ>
          <Champ label="Durée (min)">
            <input
              type="number"
              min="5"
              step="5"
              value={valeurs.duree_min}
              onChange={modifier('duree_min')}
            />
          </Champ>
        </div>

        <Champ label="Type de travail">
          <select value={valeurs.type} onChange={modifier('type')}>
            {Object.entries(TYPES_SEANCE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>{libelle}</option>
            ))}
          </select>
        </Champ>

        <Champ label="Comment allait-il ?">
          <div className="puces">
            {Object.entries(RESSENTIS).map(([cle, config]) => (
              <button
                key={cle}
                type="button"
                className={`badge ${valeurs.ressenti === cle ? (config.alerte ? 'retard' : '') : 'contour'}`}
                onClick={() => setValeurs((v) => ({ ...v, ressenti: cle }))}
              >
                {config.emoji} {config.libelle}
              </button>
            ))}
          </div>
        </Champ>

        <Champ label="Note" aide="Visible par tous les cavaliers du cheval">
          <textarea
            value={valeurs.notes}
            onChange={modifier('notes')}
            placeholder="Points travaillés, remarques…"
          />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer la séance'}
        </button>
      </form>
    </Feuille>
  )
}

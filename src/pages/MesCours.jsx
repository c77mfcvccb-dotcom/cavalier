import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerCours, chargerMesChevaux, chargerMesClubs } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Avatar, Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import { DISCIPLINES_COURS } from '../lib/constantes'
import { cleJour, formatDate, formatHeure } from '../lib/format'

/**
 * Les cours de mon club, côté cavalier : je vois le planning, je m'inscris,
 * je me désinscris, et je sais quel cheval m'a été attribué.
 *
 * Aucun paramètre de club : le RLS ne renvoie que les cours des clubs dont
 * on monte au moins un cheval — la même règle que la fonction
 * est_cavalier_du_club en base (migration 0017).
 */
export default function MesCours() {
  const { profil } = useAuth()
  const [clubs, setClubs] = useState([])
  const [cours, setCours] = useState([])
  const [chevauxIds, setChevauxIds] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [envoiId, setEnvoiId] = useState(null)
  const [detailId, setDetailId] = useState(null)

  const recharger = useCallback(async () => {
    const [mesClubs, mesChevaux, lesCours] = await Promise.all([
      chargerMesClubs(),
      chargerMesChevaux(profil.id),
      chargerCours({ debut: new Date() }),
    ])
    setClubs(mesClubs)
    setChevauxIds(mesChevaux.map((c) => c.id))
    setCours(lesCours)
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

  // Une place qui se libère, une attribution posée par le club : l'écran
  // suit sans rechargement — même mécanique que le calendrier partagé.
  useAgendaVivant(chevauxIds, recharger)

  const parJour = useMemo(() => {
    const carte = new Map()
    for (const c of cours) {
      const cle = cleJour(c.debut)
      if (!carte.has(cle)) carte.set(cle, [])
      carte.get(cle).push(c)
    }
    return [...carte.entries()]
  }, [cours])

  async function inscrire(coursId) {
    setErreur('')
    setEnvoiId(coursId)
    const { error } = await supabase
      .from('inscriptions_cours')
      .insert({ cours_id: coursId, cavalier_id: profil.id })
    setEnvoiId(null)
    if (error) {
      setErreur(
        error.message.includes('duplicate') || error.message.includes('unique')
          ? 'Vous êtes déjà inscrit à ce cours.'
          : error.message.replace(/^.*?:\s*/, '')
      )
    } else recharger()
  }

  async function desinscrire(inscription) {
    if (
      !window.confirm(
        inscription.statut === 'inscrit'
          ? 'Vous perdrez votre place — elle ira au premier de la liste d\'attente. Continuer ?'
          : 'Quitter la liste d\'attente ?'
      )
    )
      return
    setErreur('')
    const { error } = await supabase.from('inscriptions_cours').delete().eq('id', inscription.id)
    if (error) setErreur(error.message.replace(/^.*?:\s*/, ''))
    else recharger()
  }

  if (chargement) return <Chargement />

  return (
    <>
      <Entete
        titre="Cours"
        sousTitre={clubs.map((c) => c.nom).join(' · ') || 'Planning du club'}
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {clubs.length === 0 ? (
          <EtatVide
            emoji="🎓"
            titre="Aucun club"
            texte="Les cours apparaissent ici quand vous êtes membre d'une écurie — elle vous transmet son code d'adhésion, à saisir dans Mon club."
            action={
              <Link to="/club" className="bouton">J'ai un code d'adhésion</Link>
            }
          />
        ) : cours.length === 0 ? (
          <EtatVide
            emoji="📅"
            titre="Aucun cours planifié"
            texte="Le club n'a pas encore publié de cours à venir."
          />
        ) : (
          parJour.map(([jour, coursDuJour]) => (
            <section key={jour} className="section">
              <div className="titre-section">
                <h2 style={{ fontSize: '1rem' }}>
                  {formatDate(jour, { avecJour: true, court: true })}
                </h2>
              </div>

              <div className="liste">
                {coursDuJour.map((c) => {
                  const inscrits = c.inscriptions.filter((i) => i.statut === 'inscrit')
                  const maPlace = c.inscriptions.find((i) => i.cavalier_id === profil.id)
                  const complet = inscrits.length >= c.places
                  const maPosition =
                    maPlace?.statut === 'attente'
                      ? c.inscriptions
                          .filter((i) => i.statut === 'attente')
                          .findIndex((i) => i.id === maPlace.id) + 1
                      : null
                  const ouvert = detailId === c.id

                  return (
                    <div key={c.id} className="carte" style={{ padding: 12 }}>
                      <button
                        className="element"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          boxShadow: 'none',
                        }}
                        onClick={() => setDetailId(ouvert ? null : c.id)}
                        aria-expanded={ouvert}
                      >
                        <span
                          className="bordure-couleur"
                          style={{ background: 'var(--bleu)' }}
                        />
                        <div className="corps">
                          <div className="titre">
                            {DISCIPLINES_COURS[c.discipline]?.emoji}{' '}
                            {formatHeure(c.debut)} · {DISCIPLINES_COURS[c.discipline]?.libelle}
                            {c.niveau ? ` · ${c.niveau}` : ''}
                          </div>
                          <div className="meta">
                            {clubs.length > 1 ? `${c.club?.nom} · ` : ''}
                            {inscrits.length}/{c.places} inscrit{inscrits.length > 1 ? 's' : ''}
                            {c.moniteur ? ` · Coach : ${c.moniteur}` : ''}
                          </div>
                        </div>
                        <span className="puces">
                          {maPlace?.statut === 'inscrit' && (
                            <span className="badge ok">Inscrit</span>
                          )}
                          {maPlace?.statut === 'attente' && (
                            <span className="badge urgent">Attente n°{maPosition}</span>
                          )}
                        </span>
                      </button>

                      {maPlace?.statut === 'inscrit' && (
                        <div className="meta doux" style={{ marginTop: 6 }}>
                          {maPlace.cheval
                            ? `Votre cheval : ${maPlace.cheval.nom}`
                            : 'Cheval attribué par le club avant le cours'}
                        </div>
                      )}

                      {ouvert && (
                        <div style={{ marginTop: 10 }}>
                          {inscrits.length > 0 && (
                            <div className="liste">
                              {inscrits.map((i) => (
                                <div key={i.id} className="element" style={{ padding: 8 }}>
                                  <Avatar profil={i.cavalier} />
                                  <div className="corps">
                                    <div className="titre" style={{ fontSize: '0.88rem' }}>
                                      {i.cavalier?.nom}
                                      {i.cavalier_id === profil.id && (
                                        <span className="doux"> (vous)</span>
                                      )}
                                    </div>
                                    {i.cheval && <div className="meta">sur {i.cheval.nom}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="pile" style={{ marginTop: 10 }}>
                            {maPlace ? (
                              <button
                                className="bouton secondaire pleine-largeur"
                                onClick={() => desinscrire(maPlace)}
                              >
                                {maPlace.statut === 'inscrit'
                                  ? 'Me désinscrire'
                                  : "Quitter la liste d'attente"}
                              </button>
                            ) : (
                              <button
                                className="bouton pleine-largeur"
                                disabled={envoiId === c.id}
                                onClick={() => inscrire(c.id)}
                              >
                                {envoiId === c.id
                                  ? 'Inscription…'
                                  : complet
                                    ? "M'inscrire en liste d'attente"
                                    : "M'inscrire"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  )
}

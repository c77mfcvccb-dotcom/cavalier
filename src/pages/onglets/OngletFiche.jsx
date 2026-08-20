import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { Champ, Erreur, Feuille, PhotoCheval } from '../../composants/Ui'
import ChargeurPhoto from '../../composants/ChargeurPhoto'
import { MOTIFS_INDISPO, SEXES } from '../../lib/constantes'
import { chargerIndisponibilites, indisponibiliteActive } from '../../lib/requetes'
import { ajouterJours, cleJour, formatDate, texteAge } from '../../lib/format'

export default function OngletFiche({ cheval, cavaliers, estGestionnaire, recharger }) {
  const { profil } = useAuth()
  const navigate = useNavigate()

  const [editionOuverte, setEditionOuverte] = useState(false)
  const [partageOuvert, setPartageOuvert] = useState(false)
  const [indispoOuverte, setIndispoOuverte] = useState(false)
  const [indisponibilites, setIndisponibilites] = useState([])
  const [reportOuvert, setReportOuvert] = useState(false)
  const [lienPublic, setLienPublic] = useState(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const maLiaison = cavaliers.find((c) => c.cavalier_id === profil.id)

  // Lien public actif éventuel — visible du seul propriétaire ou club (RLS)
  useEffect(() => {
    if (!estGestionnaire) return
    supabase
      .from('partages_publics')
      .select('token')
      .eq('cheval_id', cheval.id)
      .eq('actif', true)
      .maybeSingle()
      .then(({ data }) => setLienPublic(data?.token ?? null))
  }, [cheval.id, estGestionnaire])

  const urlPublique = lienPublic ? `${window.location.origin}/public/${lienPublic}` : null

  const rechargerIndispos = useCallback(
    () => chargerIndisponibilites([cheval.id]).then(setIndisponibilites).catch(() => {}),
    [cheval.id]
  )
  useEffect(() => {
    rechargerIndispos()
  }, [rechargerIndispos])

  const indispoEnCours = indisponibiliteActive(indisponibilites, cheval.id)

  // La fiche d'un cheval de club, vue par le club lui-même : c'est là que
  // vivent la liaison directe et le report (migration 0019).
  const estClubGestionnaire = cheval.club_id === profil.id

  // Le cheval revenu, les remplacements qui pointaient vers lui n'ont plus
  // de raison d'être : on propose de les clore dans la foulée — proposer,
  // pas imposer, car une bascule peut être devenue définitive.
  async function proposerFinRemplacements() {
    if (!estClubGestionnaire) return
    const { data: remplacements } = await supabase
      .from('cheval_cavaliers')
      .select('id, profil:profils(nom), cheval:cheval_id(nom)')
      .eq('remplacement_de', cheval.id)
    if (!remplacements?.length) return
    const detail = remplacements
      .map((r) => `${r.profil?.nom ?? 'Cavalier'} sur ${r.cheval?.nom ?? 'un autre cheval'}`)
      .join(', ')
    if (
      window.confirm(`${cheval.nom} est de retour. Mettre fin aux remplacements ? (${detail})`)
    ) {
      await supabase
        .from('cheval_cavaliers')
        .delete()
        .in('id', remplacements.map((r) => r.id))
    }
  }

  // « Lever » remet le cheval au travail MAINTENANT : l'indisponibilité se
  // ferme à hier — la fermer à aujourd'hui le laisserait indisponible
  // jusqu'au soir — et reste dans l'historique, qui dira un jour pourquoi
  // il n'a pas tourné cette semaine-là. Commencée aujourd'hui même, il n'y
  // a rien à archiver (et la contrainte fin >= debut refuserait hier) :
  // la ligne s'efface.
  async function leverIndispo(indispo) {
    const hier = ajouterJours(new Date(), -1)
    const { error } =
      indispo.debut > hier
        ? await supabase.from('indisponibilites').delete().eq('id', indispo.id)
        : await supabase.from('indisponibilites').update({ fin: hier }).eq('id', indispo.id)
    if (error) {
      setErreur(error.message)
      return
    }
    rechargerIndispos()
    await proposerFinRemplacements()
  }

  // La suppression efface la ligne de l'historique : c'est le geste de la
  // saisie par erreur — « je me suis trompé, il n'est pas blessé » — ou de
  // l'annulation d'un repos à venir.
  async function supprimerIndispo(indispo, { enCours = false, confirmer = false } = {}) {
    if (
      confirmer &&
      !window.confirm(
        enCours
          ? 'Effacer cette indisponibilité de l\'historique ? Pour une simple remise au travail, préférez « Lever ».'
          : 'Effacer cette indisponibilité de l\'historique ?'
      )
    )
      return
    const { error } = await supabase.from('indisponibilites').delete().eq('id', indispo.id)
    if (error) {
      setErreur(error.message)
      return
    }
    rechargerIndispos()
    if (enCours) await proposerFinRemplacements()
  }

  async function genererLienPublic() {
    setErreur('')
    setEnvoi(true)
    const { data, error } = await supabase.rpc('creer_lien_public', { p_cheval: cheval.id })
    setEnvoi(false)
    if (error) {
      setErreur(error.message.replace(/^.*?:\s*/, ''))
      return
    }
    setLienPublic(data)
    setPartageOuvert(true)
  }

  async function revoquerLienPublic() {
    if (!window.confirm('Le lien cessera immédiatement de fonctionner. Continuer ?')) return
    const { error } = await supabase.rpc('revoquer_lien_public', { p_cheval: cheval.id })
    if (error) setErreur(error.message.replace(/^.*?:\s*/, ''))
    else {
      setLienPublic(null)
      setPartageOuvert(false)
    }
  }

  async function quitterCheval() {
    if (!window.confirm('Vous ne verrez plus ce cheval ni son calendrier. Continuer ?')) return
    const { error } = await supabase.from('cheval_cavaliers').delete().eq('id', maLiaison.id)
    if (error) setErreur(error.message)
    else navigate('/', { replace: true })
  }

  async function supprimerCheval() {
    if (!window.confirm(`Supprimer définitivement ${cheval.nom} et tout son suivi ?`)) return

    // Les fichiers du bucket d'abord, tant qu'on a encore accès au cheval :
    // supprimer la ligne efface les métadonnées en cascade, mais seule l'API
    // Storage détruit réellement un fichier — et une fois le cheval parti,
    // le RLS de stockage ne laisse plus y toucher. En meilleur effort : un
    // raté ici ne doit pas bloquer la suppression, le script
    // scripts/nettoyer-documents.mjs rattrape les orphelins.
    try {
      const chemins = []
      for (let page = 0; ; page++) {
        const { data, error } = await supabase.storage
          .from('documents')
          .list(cheval.id, { limit: 100, offset: page * 100 })
        if (error || !data?.length) break
        chemins.push(...data.map((f) => `${cheval.id}/${f.name}`))
        if (data.length < 100) break
      }
      if (chemins.length) await supabase.storage.from('documents').remove(chemins)
    } catch (e) {
      console.warn('Purge des documents impossible avant suppression', e)
    }

    const { error } = await supabase.from('chevaux').delete().eq('id', cheval.id)
    if (error) setErreur(error.message)
    else navigate('/', { replace: true })
  }

  const age = texteAge(cheval.date_naissance)

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      <PhotoCheval cheval={cheval} grande />

      <div className="carte">
        <dl className="tableau-infos">
          {age && (<><dt>Âge</dt><dd>{age}</dd></>)}
          {cheval.date_naissance && (
            <><dt>Naissance</dt><dd>{formatDate(cheval.date_naissance)}</dd></>
          )}
          {cheval.sexe && (<><dt>Sexe</dt><dd>{SEXES[cheval.sexe]}</dd></>)}
          {cheval.race && (<><dt>Race</dt><dd>{cheval.race}</dd></>)}
          {cheval.robe && (<><dt>Robe</dt><dd>{cheval.robe}</dd></>)}
          {cheval.proprietaire_nom && (
            <><dt>Propriétaire</dt><dd>{cheval.proprietaire_nom}</dd></>
          )}
          {cheval.club_id && (<><dt>Statut</dt><dd>Cheval de club</dd></>)}
          {cheval.ecurie_id && (
            <>
              <dt>Statut</dt>
              <dd>
                {cheval.pension_confirmee
                  ? 'En pension à l\'écurie'
                  : 'Pension demandée — en attente de l\'écurie'}
              </dd>
            </>
          )}
          {indispoEnCours && (
            <>
              <dt>Disponibilité</dt>
              <dd>
                <span className="badge retard">
                  {MOTIFS_INDISPO[indispoEnCours.motif]?.libelle || 'Indisponible'}
                  {indispoEnCours.fin
                    ? ` jusqu'au ${formatDate(indispoEnCours.fin, { court: true })}`
                    : " jusqu'à nouvel ordre"}
                </span>
              </dd>
            </>
          )}
        </dl>

        {cheval.notes && (
          <p className="doux" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{cheval.notes}</p>
        )}

        {estGestionnaire && (
          <button
            className="bouton secondaire petit"
            style={{ marginTop: 14 }}
            onClick={() => setEditionOuverte(true)}
          >
            Modifier la fiche
          </button>
        )}
      </div>

      {(estGestionnaire || indisponibilites.length > 0) && (
        <section>
          <div className="titre-section">
            <h2>Disponibilité</h2>
            {estGestionnaire && (
              <button className="lien" onClick={() => setIndispoOuverte(true)}>
                + Mettre au repos
              </button>
            )}
          </div>

          {indisponibilites.length === 0 ? (
            <div className="carte centre doux">Disponible — aucune indisponibilité prévue</div>
          ) : (
            <div className="liste">
              {indisponibilites.map((indispo) => {
                // Clés « AAAA-MM-JJ » : l'ordre lexical est l'ordre des jours
                const aujourdhui = cleJour(new Date())
                const aVenir = indispo.debut > aujourdhui
                const enCours = !aVenir && (!indispo.fin || indispo.fin >= aujourdhui)
                return (
                  <div key={indispo.id} className="element">
                    <div className="corps">
                      <div className="titre">
                        {MOTIFS_INDISPO[indispo.motif]?.libelle || indispo.motif}
                        {aVenir && <span className="doux"> (à venir)</span>}
                        {!aVenir && !enCours && <span className="doux"> (terminée)</span>}
                      </div>
                      <div className="meta">
                        Du {formatDate(indispo.debut, { court: true })}
                        {indispo.fin
                          ? ` au ${formatDate(indispo.fin, { court: true })}`
                          : " jusqu'à nouvel ordre"}
                        {indispo.note ? ` · ${indispo.note}` : ''}
                      </div>
                    </div>
                    {estGestionnaire && aVenir && (
                      <button
                        className="bouton fantome petit"
                        onClick={() => supprimerIndispo(indispo)}
                      >
                        Annuler
                      </button>
                    )}
                    {estGestionnaire && enCours && (
                      <button
                        className="bouton fantome petit"
                        onClick={() => leverIndispo(indispo)}
                      >
                        Lever
                      </button>
                    )}
                    {estGestionnaire && !aVenir && (
                      <button
                        className="bouton fantome petit"
                        onClick={() => supprimerIndispo(indispo, { enCours, confirmer: true })}
                        aria-label="Supprimer cette indisponibilité"
                        title="Saisie par erreur ? Effacer de l'historique"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {indispoEnCours && estClubGestionnaire && cavaliers.length > 0 && (
            <button
              className="bouton secondaire pleine-largeur"
              style={{ marginTop: 10 }}
              onClick={() => setReportOuvert(true)}
            >
              Reporter ses cavaliers sur un autre cheval
            </button>
          )}

          <p className="aide" style={{ marginTop: 10 }}>
            Un cheval indisponible ne peut pas être attribué à un cours, et tous
            ses cavaliers voient qu'il est au repos.
          </p>
        </section>
      )}

      <section>
        <div className="titre-section">
          <h2>Partage</h2>
        </div>
        <div className="pile">
          <Link to={`/chevaux/${cheval.id}/carnet`} className="bouton secondaire pleine-largeur">
            Carnet de santé imprimable
          </Link>

          {/* Cavalier seulement : la fonction dépenses n'existe plus côté écurie. */}
          {estGestionnaire && !estClubGestionnaire && (
            <Link
              to={`/depenses?cheval=${cheval.id}`}
              className="bouton secondaire pleine-largeur"
            >
              Dépenses de ce cheval
            </Link>
          )}

          {estGestionnaire &&
            (urlPublique ? (
              <button className="bouton secondaire pleine-largeur" onClick={() => setPartageOuvert(true)}>
                Lien public actif — voir ou révoquer
              </button>
            ) : (
              <button
                className="bouton secondaire pleine-largeur"
                onClick={genererLienPublic}
                disabled={envoi}
              >
                Créer un lien public en lecture seule
              </button>
            ))}
        </div>
      </section>

      <div className="pile">
        {maLiaison && maLiaison.role !== 'proprietaire' && (
          <button className="bouton danger pleine-largeur" onClick={quitterCheval}>
            Quitter ce cheval
          </button>
        )}
        {estGestionnaire && (
          <button className="bouton danger pleine-largeur" onClick={supprimerCheval}>
            Supprimer ce cheval
          </button>
        )}
      </div>

      <Feuille
        titre="Lien public de la fiche"
        ouverte={partageOuvert}
        onFermer={() => setPartageOuvert(false)}
      >
        <p className="doux" style={{ marginBottom: 14 }}>
          Ce lien ouvre l'identité du cheval et son carnet de santé, sans compte.
          Il n'expose ni le propriétaire, ni les montants, ni les cavaliers liés.
        </p>

        {urlPublique && (
          <div className="carte" style={{ wordBreak: 'break-all', fontSize: '0.84rem' }}>
            {urlPublique}
          </div>
        )}

        <div className="pile" style={{ marginTop: 14 }}>
          {navigator.share && urlPublique && (
            <button
              className="bouton"
              onClick={() =>
                navigator.share({ title: `${cheval.nom} — carnet de santé`, url: urlPublique })
              }
            >
              Partager le lien
            </button>
          )}
          <button
            className="bouton secondaire"
            onClick={() => navigator.clipboard?.writeText(urlPublique)}
          >
            Copier le lien
          </button>
          <button className="bouton danger" onClick={revoquerLienPublic}>
            Révoquer ce lien
          </button>
        </div>
      </Feuille>

      <FeuilleEdition
        cheval={cheval}
        ouverte={editionOuverte}
        onFermer={() => setEditionOuverte(false)}
        onEnregistre={() => {
          setEditionOuverte(false)
          recharger()
        }}
      />

      <FeuilleIndispo
        cheval={cheval}
        ouverte={indispoOuverte}
        onFermer={() => setIndispoOuverte(false)}
        onEnregistre={() => {
          setIndispoOuverte(false)
          rechargerIndispos()
        }}
      />

      {estClubGestionnaire && (
        <FeuilleReport
          cheval={cheval}
          cavaliers={cavaliers}
          ouverte={reportOuvert}
          onFermer={() => setReportOuvert(false)}
          onReporte={() => {
            setReportOuvert(false)
            recharger()
          }}
        />
      )}
    </div>
  )
}

/**
 * Le cheval est au repos : ses cavaliers basculent sur un autre cheval de
 * l'écurie, et chacun pourra noter ses séances sur CELUI-LÀ. La liaison
 * créée porte la mention « remplace » — et la levée de l'indisponibilité
 * proposera d'y mettre fin.
 */
function FeuilleReport({ cheval, cavaliers, ouverte, onFermer, onReporte }) {
  const { profil } = useAuth()
  const [cavalerie, setCavalerie] = useState([])
  const [cible, setCible] = useState('')
  const [choisis, setChoisis] = useState(() => new Set())
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!ouverte) return
    setCible('')
    setChoisis(new Set(cavaliers.filter((c) => c.cavalier_id !== profil.id).map((c) => c.cavalier_id)))
    setErreur('')
    supabase
      .from('chevaux')
      .select('id, nom')
      .eq('club_id', profil.id)
      .neq('id', cheval.id)
      .order('nom')
      .then(({ data }) => setCavalerie(data || []))
  }, [ouverte, cheval.id, profil.id, cavaliers])

  const basculer = (id) =>
    setChoisis((avant) => {
      const suite = new Set(avant)
      if (suite.has(id)) suite.delete(id)
      else suite.add(id)
      return suite
    })

  async function reporter(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)
    // Un appel par cavalier : chacun peut échouer pour sa propre raison
    // (déjà lié, retiré du club entre-temps) sans bloquer les autres.
    for (const cavalierId of choisis) {
      const { error } = await supabase.rpc('lier_membre_au_cheval', {
        p_cheval: cible,
        p_cavalier: cavalierId,
        p_remplace: cheval.id,
      })
      if (error) {
        setErreur(error.message.replace(/^.*?:\s*/, ''))
        setEnvoi(false)
        return
      }
    }
    setEnvoi(false)
    onReporte()
  }

  return (
    <Feuille titre={`Reporter les cavaliers de ${cheval.nom}`} ouverte={ouverte} onFermer={onFermer}>
      <p className="doux" style={{ marginBottom: 12 }}>
        Chaque cavalier choisi est lié au cheval de remplacement : il y note
        ses séances et voit son calendrier le temps du repos. À la levée de
        l'indisponibilité, la fiche proposera de clore ces remplacements.
      </p>

      <form onSubmit={reporter}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Cheval de remplacement">
          <select value={cible} onChange={(e) => setCible(e.target.value)} required>
            <option value="">— Choisir un cheval —</option>
            {cavalerie.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </Champ>

        <Champ label="Cavaliers à reporter">
          <div className="pile" style={{ gap: 8 }}>
            {cavaliers
              .filter((liaison) => liaison.cavalier_id !== profil.id)
              .map((liaison) => (
                <label key={liaison.id} className="rangee" style={{ gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={choisis.has(liaison.cavalier_id)}
                    onChange={() => basculer(liaison.cavalier_id)}
                  />
                  <span>{liaison.profil?.nom}</span>
                </label>
              ))}
          </div>
        </Champ>

        <button
          className="bouton pleine-largeur"
          disabled={envoi || !cible || choisis.size === 0}
        >
          {envoi ? 'Report…' : `Reporter ${choisis.size} cavalier${choisis.size > 1 ? 's' : ''}`}
        </button>
      </form>
    </Feuille>
  )
}

function FeuilleIndispo({ cheval, ouverte, onFermer, onEnregistre }) {
  const { profil } = useAuth()
  const [motif, setMotif] = useState('repos')
  const [debut, setDebut] = useState(() => cleJour(new Date()))
  const [fin, setFin] = useState('')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Chaque ouverture repart d'une feuille vierge datée d'aujourd'hui
  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setMotif('repos')
      setDebut(cleJour(new Date()))
      setFin('')
      setNote('')
      setErreur('')
    }
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')

    if (fin && fin < debut) {
      setErreur('La fin ne peut pas précéder le début.')
      return
    }

    setEnvoi(true)
    const { error } = await supabase.from('indisponibilites').insert({
      cheval_id: cheval.id,
      motif,
      debut,
      fin: fin || null,
      note: note.trim() || null,
      cree_par: profil.id,
    })
    setEnvoi(false)

    if (error) setErreur(error.message)
    else onEnregistre()
  }

  return (
    <Feuille titre={`Mettre ${cheval.nom} au repos`} ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Motif">
          <div className="choix-puces">
            {Object.entries(MOTIFS_INDISPO).map(([cle, m]) => (
              <button
                key={cle}
                type="button"
                className={motif === cle ? 'actif' : undefined}
                onClick={() => setMotif(cle)}
              >
                {m.libelle}
              </button>
            ))}
          </div>
        </Champ>

        <div className="ligne-champs">
          <Champ label="Du">
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required />
          </Champ>
          <Champ label="Au" aide="Vide = jusqu'à nouvel ordre">
            <input type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} />
          </Champ>
        </div>

        <Champ label="Note">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contrôle vétérinaire vendredi…"
          />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Mettre au repos'}
        </button>
      </form>
    </Feuille>
  )
}

function FeuilleEdition({ cheval, ouverte, onFermer, onEnregistre }) {
  const [valeurs, setValeurs] = useState(cheval)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Repart des valeurs enregistrées à chaque ouverture de la feuille
  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) setValeurs(cheval)
  }

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    const { error } = await supabase
      .from('chevaux')
      .update({
        nom: valeurs.nom,
        photo_url: valeurs.photo_url,
        date_naissance: valeurs.date_naissance || null,
        race: valeurs.race,
        robe: valeurs.robe,
        sexe: valeurs.sexe || null,
        proprietaire_nom: valeurs.proprietaire_nom,
        notes: valeurs.notes,
      })
      .eq('id', cheval.id)

    setEnvoi(false)
    if (error) setErreur(error.message)
    else onEnregistre()
  }

  return (
    <Feuille titre="Modifier la fiche" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <ChargeurPhoto
          valeur={valeurs.photo_url}
          onChange={(url) => setValeurs((v) => ({ ...v, photo_url: url }))}
          label="Photo du cheval"
        />

        <Champ label="Nom">
          <input value={valeurs.nom || ''} onChange={modifier('nom')} required />
        </Champ>

        <div className="ligne-champs">
          <Champ label="Date de naissance">
            <input
              type="date"
              value={valeurs.date_naissance || ''}
              onChange={modifier('date_naissance')}
            />
          </Champ>
          <Champ label="Sexe">
            <select value={valeurs.sexe || ''} onChange={modifier('sexe')}>
              <option value="">—</option>
              {Object.entries(SEXES).map(([cle, libelle]) => (
                <option key={cle} value={cle}>{libelle}</option>
              ))}
            </select>
          </Champ>
        </div>

        <div className="ligne-champs">
          <Champ label="Race">
            <input value={valeurs.race || ''} onChange={modifier('race')} />
          </Champ>
          <Champ label="Robe">
            <input value={valeurs.robe || ''} onChange={modifier('robe')} />
          </Champ>
        </div>

        <Champ label="Propriétaire">
          <input value={valeurs.proprietaire_nom || ''} onChange={modifier('proprietaire_nom')} />
        </Champ>

        <Champ label="Notes">
          <textarea value={valeurs.notes || ''} onChange={modifier('notes')} />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </Feuille>
  )
}

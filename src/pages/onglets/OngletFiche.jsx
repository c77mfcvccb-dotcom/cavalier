import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { Avatar, Champ, Erreur, Feuille, PhotoCheval } from '../../composants/Ui'
import ChargeurPhoto from '../../composants/ChargeurPhoto'
import { MOTIFS_INDISPO, PARTICIPANTS_MAX, ROLES, SEXES } from '../../lib/constantes'
import { identiteCavalier, repertoireCavaliers } from '../../lib/couleurs'
import { chargerIndisponibilites, indisponibiliteActive } from '../../lib/requetes'
import { cleJour, formatDate, texteAge } from '../../lib/format'

export default function OngletFiche({ cheval, cavaliers, estGestionnaire, recharger }) {
  const { profil } = useAuth()
  const navigate = useNavigate()

  const [editionOuverte, setEditionOuverte] = useState(false)
  const [invitationOuverte, setInvitationOuverte] = useState(false)
  const [partageOuvert, setPartageOuvert] = useState(false)
  const [indispoOuverte, setIndispoOuverte] = useState(false)
  const [indisponibilites, setIndisponibilites] = useState([])
  const [lienPublic, setLienPublic] = useState(null)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const maLiaison = cavaliers.find((c) => c.cavalier_id === profil.id)

  const repertoire = useMemo(() => repertoireCavaliers(cavaliers), [cavaliers])

  // Un cheval de club n'est pas plafonné : une cavalerie d'école tourne avec
  // bien plus de dix cavaliers, et le partage y est le mode normal.
  const plafond = cheval.club_id ? null : PARTICIPANTS_MAX
  const complet = plafond !== null && cavaliers.length >= plafond

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

  // « Lever » remet le cheval au travail aujourd'hui même : l'indisponibilité
  // se ferme au lieu d'être effacée — l'historique dira un jour pourquoi il
  // n'a pas tourné cette semaine-là. Une indisponibilité qui n'a pas encore
  // commencé, elle, se supprime : il n'y a rien à archiver.
  async function leverIndispo(indispo) {
    const { error } = await supabase
      .from('indisponibilites')
      .update({ fin: cleJour(new Date()) })
      .eq('id', indispo.id)
    if (error) setErreur(error.message)
    else rechargerIndispos()
  }

  async function supprimerIndispo(indispo) {
    const { error } = await supabase.from('indisponibilites').delete().eq('id', indispo.id)
    if (error) setErreur(error.message)
    else rechargerIndispos()
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

  async function genererCode() {
    setErreur('')
    setEnvoi(true)
    const { data, error } = await supabase.rpc('generer_code_invitation', {
      p_cheval: cheval.id,
      p_role: cheval.club_id ? 'cavalier_club' : 'demi_pension',
    })
    setEnvoi(false)

    if (error) {
      setErreur(
        error.message.includes('CHEVAL_COMPLET')
          ? `Ce cheval compte déjà ${plafond} cavaliers, le maximum.`
          : error.message.replace(/^.*?:\s*/, '')
      )
      return
    }
    setCode(data)
    setInvitationOuverte(true)
  }

  async function retirerCavalier(liaison) {
    if (!window.confirm(`Retirer ${liaison.profil?.nom} de ce cheval ?`)) return
    const { error } = await supabase.from('cheval_cavaliers').delete().eq('id', liaison.id)
    if (error) setErreur(error.message)
    else recharger()
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
          {indispoEnCours && (
            <>
              <dt>Disponibilité</dt>
              <dd>
                <span className="badge retard">
                  {MOTIFS_INDISPO[indispoEnCours.motif]?.emoji}{' '}
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

      <section>
        <div className="titre-section">
          <h2>
            Cavaliers
            <span className="doux"> · {cavaliers.length}{plafond ? `/${plafond}` : ''}</span>
          </h2>
          {estGestionnaire && !complet && (
            <button className="lien" onClick={genererCode} disabled={envoi}>
              + Inviter
            </button>
          )}
        </div>

        <div className="liste">
          {cavaliers.length === 0 && (
            <div className="carte centre doux">Aucun cavalier lié pour l'instant</div>
          )}

          {cavaliers.map((liaison) => (
            <div key={liaison.id} className="element">
              <span
                className="bordure-couleur"
                style={{
                  background: identiteCavalier(repertoire, liaison.cavalier_id, liaison.profil?.nom)
                    .trait,
                }}
              />
              <Avatar profil={liaison.profil} />
              <div className="corps">
                <div className="titre">
                  {liaison.profil?.nom}
                  {liaison.cavalier_id === profil.id && <span className="doux"> (vous)</span>}
                </div>
                <div className="meta">
                  {ROLES[liaison.role]?.libelle}
                  {liaison.profil?.niveau_galop ? ` · Galop ${liaison.profil.niveau_galop}` : ''}
                </div>
              </div>
              {estGestionnaire && liaison.cavalier_id !== profil.id && (
                <button className="bouton fantome petit" onClick={() => retirerCavalier(liaison)}>
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="aide" style={{ marginTop: 10 }}>
          {complet
            ? `Ce cheval a atteint le maximum de ${plafond} cavaliers. Retirez-en un pour inviter quelqu'un d'autre.`
            : 'Chaque cavalier lié a sa couleur : elle sert de repère dans le calendrier partagé.'}
        </p>
      </section>

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
                const aVenir = indispo.debut > cleJour(new Date())
                return (
                  <div key={indispo.id} className="element">
                    <div className="corps">
                      <div className="titre">
                        {MOTIFS_INDISPO[indispo.motif]?.emoji}{' '}
                        {MOTIFS_INDISPO[indispo.motif]?.libelle || indispo.motif}
                        {aVenir && <span className="doux"> (à venir)</span>}
                      </div>
                      <div className="meta">
                        Du {formatDate(indispo.debut, { court: true })}
                        {indispo.fin
                          ? ` au ${formatDate(indispo.fin, { court: true })}`
                          : " jusqu'à nouvel ordre"}
                        {indispo.note ? ` · ${indispo.note}` : ''}
                      </div>
                    </div>
                    {estGestionnaire && (
                      <button
                        className="bouton fantome petit"
                        onClick={() => (aVenir ? supprimerIndispo(indispo) : leverIndispo(indispo))}
                      >
                        {aVenir ? 'Annuler' : 'Lever'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
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
        titre="Code d'invitation"
        ouverte={invitationOuverte}
        onFermer={() => setInvitationOuverte(false)}
      >
        <div className="code-invitation">
          <div className="doux" style={{ color: 'rgba(255,255,255,0.75)' }}>
            À transmettre au cavalier
          </div>
          <div className="code">{code}</div>
          <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>
            Valable 30 jours, une seule utilisation — recommencez pour inviter
            quelqu'un d'autre
          </div>
        </div>

        <div className="pile" style={{ marginTop: 16 }}>
          {navigator.share && (
            <button
              className="bouton"
              onClick={() =>
                navigator.share({
                  title: 'Licol',
                  text: `Rejoins ${cheval.nom} sur Licol avec le code ${code}`,
                })
              }
            >
              Partager le code
            </button>
          )}
          <button
            className="bouton secondaire"
            onClick={() => navigator.clipboard?.writeText(code)}
          >
            Copier le code
          </button>
          <button className="bouton fantome" onClick={() => setInvitationOuverte(false)}>
            Fermer
          </button>
        </div>
      </Feuille>

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
    </div>
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
                {m.emoji} {m.libelle}
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

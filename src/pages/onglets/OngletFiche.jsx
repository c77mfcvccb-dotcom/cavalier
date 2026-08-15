import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { Avatar, Champ, Erreur, Feuille, PhotoCheval } from '../../composants/Ui'
import ChargeurPhoto from '../../composants/ChargeurPhoto'
import { ROLES, SEXES } from '../../lib/constantes'
import { traitCavalier } from '../../lib/couleurs'
import { formatDate, texteAge } from '../../lib/format'

export default function OngletFiche({ cheval, cavaliers, estGestionnaire, recharger }) {
  const { profil } = useAuth()
  const navigate = useNavigate()

  const [editionOuverte, setEditionOuverte] = useState(false)
  const [invitationOuverte, setInvitationOuverte] = useState(false)
  const [partageOuvert, setPartageOuvert] = useState(false)
  const [lienPublic, setLienPublic] = useState(null)
  const [code, setCode] = useState('')
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
      setErreur(error.message.replace(/^.*?:\s*/, ''))
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
          <h2>Cavaliers</h2>
          {estGestionnaire && (
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
              <span className="bordure-couleur" style={{ background: traitCavalier(liaison.cavalier_id) }} />
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
          Chaque cavalier lié a sa couleur : elle sert de repère dans le calendrier partagé.
        </p>
      </section>

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
          <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>Valable 30 jours, une seule utilisation</div>
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
    </div>
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

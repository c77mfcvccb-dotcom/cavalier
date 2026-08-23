import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { Avatar, Champ, Erreur, Feuille } from '../../composants/Ui'
import { PARTICIPANTS_MAX, ROLES, ROLES_ATTRIBUTION } from '../../lib/constantes'
import { identiteCavalier, repertoireCavaliers } from '../../lib/couleurs'

/**
 * L'onglet Cavaliers de la fiche : qui monte ce cheval, avec quel rôle.
 *
 * La gestion vivait en bas de l'onglet Fiche ; elle a son onglet parce que
 * c'est un geste courant de l'écurie — attribuer une monture, poser le bon
 * rôle (demi-pension, tiers de pension, pension complète, cheval de club,
 * migration 0023), retirer une liaison. Côté cavalier, l'onglet montre qui
 * partage le cheval, chacun avec sa couleur de calendrier.
 */
export default function OngletCavaliers({ cheval, cavaliers, estGestionnaire, estProprietaire, recharger }) {
  const { profil } = useAuth()
  const [invitationOuverte, setInvitationOuverte] = useState(false)
  const [lierOuvert, setLierOuvert] = useState(false)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const repertoire = useMemo(() => repertoireCavaliers(cavaliers), [cavaliers])

  // Un cheval de club n'est pas plafonné : une cavalerie d'école tourne avec
  // bien plus de dix cavaliers, et le partage y est le mode normal.
  const plafond = cheval.club_id ? null : PARTICIPANTS_MAX
  const complet = plafond !== null && cavaliers.length >= plafond

  // La liaison directe et le choix du rôle : le club, sur son cheval.
  const estClubGestionnaire = cheval.club_id === profil.id

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

  async function designerProprietaire(liaison) {
    if (
      !window.confirm(
        `Désigner ${liaison.profil?.nom} comme propriétaire de ${cheval.nom} ? Cette personne obtient les pleins droits sur la fiche (modification, accès, suppression, retrait du club).`
      )
    )
      return
    const { error } = await supabase.rpc('designer_proprietaire', {
      p_cheval: cheval.id,
      p_cavalier: liaison.cavalier_id,
    })
    if (error) setErreur(error.message.replace(/^.*?:\s*/, ''))
    else recharger()
  }

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      <section>
        <div className="titre-section">
          <h2>
            Cavaliers
            <span className="doux"> · {cavaliers.length}{plafond ? `/${plafond}` : ''}</span>
          </h2>
          <span className="rangee" style={{ gap: 10 }}>
            {estClubGestionnaire && estProprietaire && (
              <button className="lien" onClick={() => setLierOuvert(true)}>
                + Attribuer
              </button>
            )}
            {estProprietaire && !complet && (
              <button className="lien" onClick={genererCode} disabled={envoi}>
                + Inviter
              </button>
            )}
          </span>
        </div>

        <div className="liste">
          {cavaliers.length === 0 && (
            <div className="carte centre doux">Aucun cavalier lié pour l'instant</div>
          )}

          {cavaliers.map((liaison) => (
            <div key={liaison.id} className="element" style={{ flexWrap: 'wrap' }}>
              <span
                className="bordure-couleur"
                style={{
                  background: identiteCavalier(repertoire, liaison.cavalier_id, liaison.profil?.nom)
                    .trait,
                }}
              />
              <Avatar profil={liaison.profil} />
              <div className="corps" style={{ flexBasis: 120 }}>
                <div className="titre">
                  {liaison.profil?.nom}
                  {liaison.cavalier_id === profil.id && <span className="doux"> (vous)</span>}
                </div>
                <div className="meta">
                  {ROLES[liaison.role]?.libelle}
                  {liaison.profil?.niveau_galop ? ` · Galop ${liaison.profil.niveau_galop}` : ''}
                </div>
              </div>
              {liaison.remplacement_de && (
                <span className="badge contour" title="Liaison posée le temps d'une indisponibilité">
                  Remplace{liaison.remplacement?.nom ? ` ${liaison.remplacement.nom}` : ''}
                </span>
              )}
              {(estClubGestionnaire && liaison.role !== 'proprietaire') ||
              (estProprietaire && liaison.cavalier_id !== profil.id) ? (
                <div className="rangee" style={{ gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                  {estClubGestionnaire && liaison.role !== 'proprietaire' && (
                    <button
                      className="bouton fantome petit"
                      onClick={() => designerProprietaire(liaison)}
                    >
                      Rendre propriétaire
                    </button>
                  )}
                  {estProprietaire && liaison.cavalier_id !== profil.id && (
                    <button
                      className="bouton fantome petit"
                      onClick={() => retirerCavalier(liaison)}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <p className="aide" style={{ marginTop: 10 }}>
          {complet
            ? `Ce cheval a atteint le maximum de ${plafond} cavaliers. Retirez-en un pour inviter quelqu'un d'autre.`
            : 'Chaque cavalier lié a sa couleur : elle sert de repère dans le calendrier partagé.'}
          {estClubGestionnaire &&
            estProprietaire &&
            ' Le rôle dit la formule : demi-pension, tiers de pension, pension complète ou cheval de club.'}
        </p>
      </section>

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

      {estClubGestionnaire && estProprietaire && (
        <FeuilleLierMembre
          cheval={cheval}
          cavaliers={cavaliers}
          ouverte={lierOuvert}
          onFermer={() => setLierOuvert(false)}
          onLie={() => {
            setLierOuvert(false)
            recharger()
          }}
        />
      )}
    </div>
  )
}

/**
 * Le club lie un de ses membres au cheval, sans code, en posant le rôle
 * qui dit la formule (migrations 0019/0020/0023). La porte normale reste
 * l'invitation ; ici, le geste tient en deux appuis devant la carrière.
 */
function FeuilleLierMembre({ cheval, cavaliers, ouverte, onFermer, onLie }) {
  const { profil } = useAuth()
  const [membres, setMembres] = useState(null)
  const [membreChoisi, setMembreChoisi] = useState(null)
  const [role, setRole] = useState('demi_pension')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!ouverte) return
    setMembreChoisi(null)
    setRole('demi_pension')
    setErreur('')
    supabase
      .from('membres_club')
      .select('cavalier_id, cavalier:cavalier_id(id, nom, photo_url, niveau_galop)')
      .eq('club_id', profil.id)
      .then(({ data }) =>
        setMembres(
          (data || [])
            .map((m) => m.cavalier)
            .filter(Boolean)
            .sort((a, b) => a.nom.localeCompare(b.nom))
        )
      )
  }, [ouverte, profil.id])

  const dejaLies = new Set(cavaliers.map((c) => c.cavalier_id))
  const candidats = (membres || []).filter((m) => !dejaLies.has(m.id))

  async function attribuer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)
    // « propriétaire » ne se pose pas par lier_membre_au_cheval (elle
    // refuse ce rôle) : on lie normalement, puis on désigne aussitôt —
    // deux appels pour la cavalière, un seul geste pour l'écurie.
    const { error: erreurLiaison } = await supabase.rpc('lier_membre_au_cheval', {
      p_cheval: cheval.id,
      p_cavalier: membreChoisi.id,
      p_role: role === 'proprietaire' ? 'cavalier_club' : role,
    })
    if (erreurLiaison) {
      setEnvoi(false)
      setErreur(erreurLiaison.message.replace(/^.*?:\s*/, ''))
      return
    }
    if (role !== 'proprietaire') {
      setEnvoi(false)
      onLie()
      return
    }
    const { error: erreurProprietaire } = await supabase.rpc('designer_proprietaire', {
      p_cheval: cheval.id,
      p_cavalier: membreChoisi.id,
    })
    setEnvoi(false)
    if (erreurProprietaire) setErreur(erreurProprietaire.message.replace(/^.*?:\s*/, ''))
    else onLie()
  }

  return (
    <Feuille titre={`Attribuer ${cheval.nom}`} ouverte={ouverte} onFermer={onFermer}>
      <Erreur>{erreur}</Erreur>

      {membreChoisi === null ? (
        membres === null ? (
          <p className="doux">Chargement des membres…</p>
        ) : candidats.length === 0 ? (
          <p className="doux">
            Tous vos membres sont déjà liés à ce cheval — les nouveaux membres
            arrivent par le code d'adhésion, dans « Mon club ».
          </p>
        ) : (
          <div className="liste">
            {candidats.map((membre) => (
              <button
                key={membre.id}
                className="element"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setMembreChoisi(membre)}
              >
                <Avatar profil={membre} />
                <div className="corps">
                  <div className="titre">{membre.nom}</div>
                  {membre.niveau_galop && <div className="meta">Galop {membre.niveau_galop}</div>}
                </div>
                <span className="fleche">›</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <form onSubmit={attribuer}>
          <div className="element" style={{ marginBottom: 14 }}>
            <Avatar profil={membreChoisi} />
            <div className="corps">
              <div className="titre">{membreChoisi.nom}</div>
              {membreChoisi.niveau_galop && (
                <div className="meta">Galop {membreChoisi.niveau_galop}</div>
              )}
            </div>
            <button
              type="button"
              className="bouton fantome petit"
              onClick={() => setMembreChoisi(null)}
            >
              Changer
            </button>
          </div>

          <Champ
            label="Rôle"
            aide={
              role === 'proprietaire'
                ? 'Elle obtient aussitôt les pleins droits sur la fiche : modifier, gérer les accès, supprimer, retirer le club. Vous gardez le planning (cours, créneaux, indisponibilités).'
                : 'La formule s\'affiche partout où la liaison apparaît — fiche, calendrier, Mes cavaliers.'
            }
          >
            <div className="choix-puces">
              {ROLES_ATTRIBUTION.map((cle) => (
                <button
                  key={cle}
                  type="button"
                  className={role === cle ? 'actif' : undefined}
                  onClick={() => setRole(cle)}
                >
                  {ROLES[cle].libelle}
                </button>
              ))}
            </div>
          </Champ>

          <button className="bouton pleine-largeur" disabled={envoi}>
            {envoi
              ? 'Attribution…'
              : role === 'proprietaire'
                ? 'Attribuer et désigner comme propriétaire'
                : `Attribuer en ${ROLES[role].libelle.toLowerCase()}`}
          </button>
        </form>
      )}
    </Feuille>
  )
}

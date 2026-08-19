import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerMesChevaux } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Avatar, Champ, Chargement, Erreur, EtatVide, Feuille, PhotoCheval } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import CodeClub from '../composants/CodeClub'
import { ROLES, ROLES_ATTRIBUTION } from '../lib/constantes'
import { traduireErreurClub } from '../lib/club'

/**
 * La même route pour deux visages : « Mon club » chez l'adhérent — ses
 * écuries, son statut, le code d'adhésion — et « Mes cavaliers » chez le
 * gérant : ses membres, leurs montures attribuées (demi-pension ou cheval
 * de club), les chevaux de propriétaires en pension, et le code.
 */
export default function MonClub() {
  const { estClub } = useAuth()
  return estClub ? <ClubGerant /> : <ClubAdherent />
}

/* ============================================================
   Côté adhérent
   ============================================================ */

function ClubAdherent() {
  const { profil, adhesions, rafraichirAdhesions } = useAuth()
  const [chevaux, setChevaux] = useState([])
  const [clubs, setClubs] = useState(new Map())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const mesChevaux = await chargerMesChevaux(profil.id)
    setChevaux(mesChevaux)
    await rafraichirAdhesions()
    // Le visage de l'écurie — logo et ville. Le profil d'un club est
    // visible de ses membres (lien_club, migration 0018) : pas besoin de
    // migration, une simple lecture suffit.
    const { data } = await supabase
      .from('profils')
      .select('id, nom, photo_url, ville')
      .eq('type_compte', 'club')
    setClubs(new Map((data || []).map((c) => [c.id, c])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.id])

  useEffect(() => {
    recharger()
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [recharger])

  // Un siège offert ou retiré pendant que l'écran est ouvert se voit sans
  // recharger — même mécanique que le calendrier partagé.
  useAgendaVivant([profil.id], recharger)

  // Mes chevaux à moi, hors club, pas encore en pension : les candidats.
  const chevauxAPension = chevaux.filter(
    (c) => c.role === 'proprietaire' && !c.club_id && !c.ecurie_id
  )

  async function quitter(adhesion) {
    if (
      !window.confirm(
        `Quitter ${adhesion.club_nom} ? Vous perdrez l'accès offert et le planning des cours de cette écurie.`
      )
    )
      return
    const { error } = await supabase
      .from('membres_club')
      .delete()
      .eq('club_id', adhesion.club_id)
      .eq('cavalier_id', profil.id)
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  async function mettreEnPension(chevalId, clubId) {
    setErreur('')
    const { error } = await supabase
      .from('chevaux')
      .update({ ecurie_id: clubId })
      .eq('id', chevalId)
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  async function sortirDePension(chevalId) {
    setErreur('')
    const { error } = await supabase
      .from('chevaux')
      .update({ ecurie_id: null })
      .eq('id', chevalId)
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  if (chargement) return <Chargement />

  return (
    <>
      <Entete titre="Mon club" />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {adhesions.length === 0 ? (
          <>
            <EtatVide
              emoji="🏇"
              titre="Aucune écurie"
              texte="Votre écurie est sur Licol ? Saisissez son code d'adhésion : vous verrez ses cours, et si elle offre l'accès à ses membres, tout le suivi de ses chevaux s'ouvre — sans abonnement."
            />
            <div className="carte" style={{ marginTop: 14 }}>
              <CodeClub />
            </div>
          </>
        ) : (
          <>
            {adhesions.map((a) => {
              const club = clubs.get(a.club_id)
              const duClub = chevaux.filter((c) => c.club_id === a.club_id)
              const enPension = chevaux.filter(
                (c) => c.ecurie_id === a.club_id && c.club_id !== a.club_id
              )

              return (
                <section key={a.club_id} className="section">
                  <div className="carte">
                    {/* L'écurie a un visage : son logo, son nom, sa ville */}
                    <div className="rangee" style={{ gap: 14 }}>
                      <Avatar profil={club || { nom: a.club_nom }} taille="grand" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="gras" style={{ fontSize: '1.1rem' }}>{a.club_nom}</div>
                        {club?.ville && <div className="doux">{club.ville}</div>}
                        <div className="puces" style={{ marginTop: 6 }}>
                          {a.siege && a.club_premium ? (
                            <span className="badge ok">Accès offert</span>
                          ) : a.siege ? (
                            <span className="badge contour">Abonnement de l'écurie inactif</span>
                          ) : (
                            <span className="badge contour">Membre</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="aide" style={{ marginTop: 10 }}>
                      {a.siege && a.club_premium
                        ? "L'écurie vous offre l'accès complet sur ses chevaux : carnet de santé, calendrier sans limite, documents et dépenses. Vos chevaux personnels hors écurie restent sur votre plan."
                        : a.siege
                          ? "Votre siège est prêt : l'accès s'ouvrira dès que l'écurie aura activé son abonnement."
                          : "L'écurie ne vous a pas attribué d'accès offert pour le moment."}
                    </p>

                    <div className="titre-section" style={{ marginTop: 14 }}>
                      <h2 style={{ fontSize: '0.95rem' }}>
                        Mes chevaux ici
                        <span className="doux"> · {duClub.length + enPension.length}</span>
                      </h2>
                    </div>

                    {duClub.length + enPension.length === 0 ? (
                      <p className="doux" style={{ fontSize: '0.88rem' }}>
                        L'écurie ne vous a pas encore attribué de cheval — c'est
                        elle qui attribue les montures, en demi-pension ou en
                        cheval de club.
                      </p>
                    ) : (
                      <div className="liste">
                        {duClub.map((cheval) => (
                          <Link key={cheval.id} to={`/chevaux/${cheval.id}`} className="carte-cheval">
                            <PhotoCheval cheval={cheval} />
                            <div className="infos">
                              <div className="nom">{cheval.nom}</div>
                              <div className="detail">{cheval.race || "Cheval de l'écurie"}</div>
                              <div className="puces" style={{ marginTop: 5 }}>
                                <span className="badge contour">
                                  {ROLES[cheval.role]?.libelle || 'Attribué'}
                                </span>
                              </div>
                            </div>
                            <span className="fleche">›</span>
                          </Link>
                        ))}

                        {enPension.map((cheval) => (
                          <Link key={cheval.id} to={`/chevaux/${cheval.id}`} className="carte-cheval">
                            <PhotoCheval cheval={cheval} />
                            <div className="infos">
                              <div className="nom">{cheval.nom}</div>
                              <div className="detail">
                                {cheval.pension_confirmee
                                  ? 'Mon cheval, en pension ici'
                                  : 'Demande de pension envoyée'}
                              </div>
                              {!cheval.pension_confirmee && (
                                <div className="puces" style={{ marginTop: 5 }}>
                                  <span className="badge urgent">En attente de l'écurie</span>
                                </div>
                              )}
                            </div>
                            <button
                              className="bouton fantome petit"
                              onClick={(e) => {
                                e.preventDefault()
                                sortirDePension(cheval.id)
                              }}
                            >
                              {cheval.pension_confirmee ? 'Sortir' : 'Annuler'}
                            </button>
                          </Link>
                        ))}
                      </div>
                    )}

                    {chevauxAPension.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <Champ
                          label="Demander la pension d'un de mes chevaux ici"
                          aide="C'est une demande : rien ne prend effet tant que l'écurie ne l'a pas acceptée. Une fois acceptée, l'accès offert couvre aussi ce cheval."
                        >
                          <select
                            value=""
                            onChange={(e) =>
                              e.target.value && mettreEnPension(e.target.value, a.club_id)
                            }
                          >
                            <option value="">— Choisir un cheval —</option>
                            {chevauxAPension.map((cheval) => (
                              <option key={cheval.id} value={cheval.id}>
                                {cheval.nom}
                              </option>
                            ))}
                          </select>
                        </Champ>
                      </div>
                    )}

                    <div className="pile" style={{ marginTop: 12 }}>
                      <Link to="/cours" className="bouton secondaire pleine-largeur">
                        Voir les cours du club
                      </Link>
                      <button className="bouton fantome petit" onClick={() => quitter(a)}>
                        Quitter l'écurie
                      </button>
                    </div>
                  </div>
                </section>
              )
            })}

            <section className="section">
              <div className="titre-section">
                <h2>Rejoindre une autre écurie</h2>
              </div>
              <div className="carte">
                <CodeClub />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  )
}

/* ============================================================
   Côté gérant
   ============================================================ */

function ClubGerant() {
  const { profil, estPremium } = useAuth()
  const [code, setCode] = useState(null)
  const [membres, setMembres] = useState([])
  const [cavalerie, setCavalerie] = useState([])
  const [liaisons, setLiaisons] = useState([])
  const [pensions, setPensions] = useState([])
  const [attribution, setAttribution] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const recharger = useCallback(async () => {
    const [ligneCode, lignesMembres, lignesChevaux, lignesPensions] = await Promise.all([
      supabase.from('codes_adhesion').select('code').eq('club_id', profil.id).maybeSingle(),
      supabase
        .from('membres_club')
        .select('id, siege, siege_depuis, cree_le, cavalier:cavalier_id(id, nom, photo_url, niveau_galop)')
        .eq('club_id', profil.id)
        .order('cree_le'),
      supabase.from('chevaux').select('id, nom').eq('club_id', profil.id).order('nom'),
      // Les chevaux de propriétaires en pension à l'écurie (0020) : la
      // fiche est visible, leurs données restent au propriétaire.
      supabase
        .from('chevaux')
        .select('id, nom, cree_par, pension_confirmee')
        .eq('ecurie_id', profil.id)
        .order('nom'),
    ])
    if (lignesMembres.error) throw lignesMembres.error
    setCode(ligneCode.data?.code ?? null)
    setMembres(lignesMembres.data || [])
    setCavalerie(lignesChevaux.data || [])
    setPensions(lignesPensions.data || [])

    // Qui monte quoi : toutes les liaisons de la cavalerie, d'un coup.
    const ids = (lignesChevaux.data || []).map((c) => c.id)
    if (ids.length) {
      const { data } = await supabase
        .from('cheval_cavaliers')
        .select('id, cheval_id, cavalier_id, role, remplacement_de, cheval:cheval_id(id, nom)')
        .in('cheval_id', ids)
      setLiaisons(data || [])
    } else {
      setLiaisons([])
    }
  }, [profil.id])

  useEffect(() => {
    recharger()
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [recharger])

  // Une adhésion saisie sur le téléphone d'un cavalier apparaît dans la
  // liste pendant que le gérant la regarde.
  useAgendaVivant([profil.id], recharger)

  async function genererCode(regeneration) {
    if (
      regeneration &&
      !window.confirm(
        "L'ancien code cessera immédiatement de fonctionner. Les membres déjà inscrits ne sont pas touchés. Continuer ?"
      )
    )
      return
    setErreur('')
    setEnvoi(true)
    const { data, error } = await supabase.rpc('generer_code_adhesion')
    setEnvoi(false)
    if (error) setErreur(traduireErreurClub(error.message))
    else setCode(data)
  }

  async function changerSiege(membre, siege) {
    setErreur('')
    const { error } = await supabase
      .from('membres_club')
      .update({ siege })
      .eq('id', membre.id)
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  async function retirer(membre) {
    if (
      !window.confirm(
        `Retirer ${membre.cavalier?.nom} du club ? Cette personne perdra l'accès offert et le planning des cours. Ses données et ses liens aux chevaux sont conservés.`
      )
    )
      return
    const { error } = await supabase.from('membres_club').delete().eq('id', membre.id)
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  async function retirerMonture(liaison, membre) {
    if (
      !window.confirm(
        `Retirer ${liaison.cheval?.nom} à ${membre.cavalier?.nom} ? Ses séances déjà notées restent sur le carnet du cheval.`
      )
    )
      return
    const { error } = await supabase.from('cheval_cavaliers').delete().eq('id', liaison.id)
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  async function sortirDePension(cheval) {
    if (
      !window.confirm(
        cheval.pension_confirmee
          ? `${cheval.nom} quitte la pension de l'écurie ?`
          : `Refuser la pension de ${cheval.nom} ?`
      )
    )
      return
    const { error } = await supabase.rpc('detacher_de_ecurie', { p_cheval: cheval.id })
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  async function accepterPension(cheval) {
    setErreur('')
    const { error } = await supabase.rpc('confirmer_pension', { p_cheval: cheval.id })
    if (error) setErreur(traduireErreurClub(error.message))
    else recharger()
  }

  if (chargement) return <Chargement />

  const avecAcces = membres.filter((m) => m.siege).length

  return (
    <>
      <Entete
        titre="Mes cavaliers"
        sousTitre={`${membres.length} membre${membres.length > 1 ? 's' : ''}`}
      />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {!estPremium && membres.length > 0 && (
          <div className="carte" style={{ marginBottom: 18 }}>
            <p className="gras">Abonnement de l'écurie inactif</p>
            <p className="doux" style={{ marginTop: 6 }}>
              Les accès offerts à vos membres sont suspendus tant que
              l'abonnement du club n'est pas actif. Rien n'est perdu : tout
              rouvre à l'activation.
            </p>
            <Link to="/premium" className="bouton" style={{ marginTop: 12 }}>
              Activer l'abonnement
            </Link>
          </div>
        )}

        <section className="section">
          <div className="titre-section">
            <h2>Code d'adhésion</h2>
          </div>

          {code ? (
            <div className="carte">
              <div className="code-invitation">
                <div className="doux" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  À transmettre à vos cavaliers
                </div>
                <div className="code">{code}</div>
                <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>
                  Multi-usage : le même code sert à tous vos membres
                </div>
              </div>
              <div className="pile" style={{ marginTop: 12 }}>
                {navigator.share && (
                  <button
                    className="bouton"
                    onClick={() =>
                      navigator.share({
                        title: 'Licol',
                        text: `Rejoins ${profil.nom} sur Licol avec le code ${code}`,
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
                <button
                  className="bouton fantome"
                  onClick={() => genererCode(true)}
                  disabled={envoi}
                >
                  Régénérer (l'ancien cessera de fonctionner)
                </button>
              </div>
            </div>
          ) : (
            <div className="carte centre">
              <p className="doux" style={{ marginBottom: 12 }}>
                Vos cavaliers rejoignent l'écurie avec ce code — depuis
                « Mon club » ou depuis l'écran d'abonnement.
              </p>
              <button className="bouton" onClick={() => genererCode(false)} disabled={envoi}>
                Générer le code d'adhésion
              </button>
            </div>
          )}
        </section>

        <section className="section">
          <div className="titre-section">
            <h2>
              Membres
              <span className="doux"> · {avecAcces} accès offert{avecAcces > 1 ? 's' : ''}</span>
            </h2>
          </div>

          {membres.length === 0 ? (
            <EtatVide
              emoji="👥"
              titre="Aucun membre"
              texte="Partagez le code d'adhésion : chaque cavalier qui le saisit apparaîtra ici, avec l'accès offert d'office. Vous pourrez le retirer membre par membre."
            />
          ) : (
            <div className="liste">
              {membres.map((membre) => {
                const montures = liaisons.filter(
                  (l) => l.cavalier_id === membre.cavalier?.id
                )
                const sesPensions = pensions.filter(
                  (c) => c.cree_par === membre.cavalier?.id
                )
                return (
                  <div key={membre.id} className="carte carte-membre">
                    {/* Le cavalier d'abord, en grand : c'est lui qu'on cherche
                        dans la liste, pas ses boutons. */}
                    <div className="rangee" style={{ gap: 12 }}>
                      <Avatar profil={membre.cavalier} taille="grand" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="gras" style={{ fontSize: '1.05rem' }}>
                          {membre.cavalier?.nom}
                        </div>
                        <div className="puces" style={{ marginTop: 4 }}>
                          {membre.cavalier?.niveau_galop && (
                            <span className="badge contour">
                              Galop {membre.cavalier.niveau_galop}
                            </span>
                          )}
                          {membre.siege ? (
                            <span className="badge ok">Accès offert</span>
                          ) : (
                            <span className="badge contour">Sans accès</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ses chevaux : attributions du club et pensions */}
                    <div className="liste" style={{ marginTop: 10 }}>
                      {montures.map((liaison) => (
                        <div key={liaison.id} className="element" style={{ padding: 8 }}>
                          <span style={{ fontSize: '1.2rem' }}>🐴</span>
                          <div className="corps">
                            <div className="titre" style={{ fontSize: '0.9rem' }}>
                              {liaison.cheval?.nom}
                            </div>
                            <div className="meta">
                              {ROLES[liaison.role]?.libelle || liaison.role}
                              {liaison.remplacement_de ? ' · en remplacement' : ''}
                            </div>
                          </div>
                          <button
                            className="bouton fantome petit"
                            onClick={() => retirerMonture(liaison, membre)}
                          >
                            Retirer
                          </button>
                        </div>
                      ))}

                      {sesPensions.map((cheval) => (
                        <div key={cheval.id} className="element" style={{ padding: 8 }}>
                          <span style={{ fontSize: '1.2rem' }}>🏠</span>
                          <div className="corps">
                            <div className="titre" style={{ fontSize: '0.9rem' }}>{cheval.nom}</div>
                            <div className="meta">
                              {cheval.pension_confirmee
                                ? "Son cheval, en pension à l'écurie"
                                : 'Demande de pension — à vous de décider'}
                            </div>
                          </div>
                          {cheval.pension_confirmee ? (
                            <button
                              className="bouton fantome petit"
                              onClick={() => sortirDePension(cheval)}
                            >
                              Sortir
                            </button>
                          ) : (
                            <>
                              <button
                                className="bouton petit"
                                onClick={() => accepterPension(cheval)}
                              >
                                Accepter
                              </button>
                              <button
                                className="bouton fantome petit"
                                onClick={() => sortirDePension(cheval)}
                              >
                                Refuser
                              </button>
                            </>
                          )}
                        </div>
                      ))}

                      {montures.length + sesPensions.length === 0 && (
                        <div className="doux" style={{ fontSize: '0.85rem' }}>
                          Aucun cheval attribué pour l'instant
                        </div>
                      )}
                    </div>

                    <div className="rangee" style={{ marginTop: 10, gap: 8 }}>
                      <button
                        className="bouton secondaire petit"
                        style={{ flex: 1 }}
                        onClick={() => setAttribution(membre)}
                      >
                        + Attribuer un cheval
                      </button>
                      <button
                        className={`bouton petit ${membre.siege ? 'fantome' : ''}`}
                        onClick={() => changerSiege(membre, !membre.siege)}
                      >
                        {membre.siege ? "Retirer l'accès" : "Offrir l'accès"}
                      </button>
                      <button
                        className="bouton fantome petit"
                        onClick={() => retirer(membre)}
                        aria-label={`Retirer ${membre.cavalier?.nom} du club`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="aide" style={{ marginTop: 10 }}>
            L'accès offert donne à un membre le premium sur les chevaux de
            l'écurie — carnet de santé, calendrier sans limite, documents,
            dépenses. Ses chevaux personnels hors écurie restent sur son
            propre plan.
          </p>
        </section>
      </main>

      <FeuilleAttribution
        membre={attribution}
        cavalerie={cavalerie}
        liaisons={liaisons}
        onFermer={() => setAttribution(null)}
        onAttribue={() => {
          setAttribution(null)
          recharger()
        }}
      />
    </>
  )
}

/**
 * Le club attribue une monture : le cheval, et le rôle qui dit la réalité —
 * demi-pension (elle paye sa DP sur ce cheval) ou cheval de club (elle
 * tourne sur la cavalerie). C'est la migration 0020 qui pose le rôle.
 */
function FeuilleAttribution({ membre, cavalerie, liaisons, onFermer, onAttribue }) {
  const [chevalId, setChevalId] = useState('')
  const [role, setRole] = useState('demi_pension')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [dernierMembre, setDernierMembre] = useState(null)
  if (membre !== dernierMembre) {
    setDernierMembre(membre)
    setChevalId('')
    setRole('demi_pension')
    setErreur('')
  }

  if (!membre) return null

  const dejaMontes = new Set(
    liaisons.filter((l) => l.cavalier_id === membre.cavalier?.id).map((l) => l.cheval_id)
  )
  const disponibles = cavalerie.filter((c) => !dejaMontes.has(c.id))

  async function attribuer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)
    const { error } = await supabase.rpc('lier_membre_au_cheval', {
      p_cheval: chevalId,
      p_cavalier: membre.cavalier.id,
      p_role: role,
    })
    setEnvoi(false)
    if (error) setErreur(traduireErreurClub(error.message))
    else onAttribue()
  }

  return (
    <Feuille
      titre={`Attribuer un cheval à ${membre.cavalier?.nom}`}
      ouverte={Boolean(membre)}
      onFermer={onFermer}
    >
      <form onSubmit={attribuer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Cheval">
          <select value={chevalId} onChange={(e) => setChevalId(e.target.value)} required>
            <option value="">— Choisir un cheval —</option>
            {disponibles.map((cheval) => (
              <option key={cheval.id} value={cheval.id}>{cheval.nom}</option>
            ))}
          </select>
        </Champ>

        <Champ
          label="Rôle"
          aide="Le rôle s'affiche partout où la liaison apparaît — sur la fiche, le calendrier, le planning."
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

        <button className="bouton pleine-largeur" disabled={envoi || !chevalId}>
          {envoi ? 'Attribution…' : 'Attribuer'}
        </button>
      </form>
    </Feuille>
  )
}

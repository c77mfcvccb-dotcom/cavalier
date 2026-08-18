import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { chargerMesChevaux } from '../lib/requetes'
import { useAgendaVivant } from '../lib/temps-reel'
import { Avatar, Champ, Chargement, Erreur, EtatVide } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import CodeClub from '../composants/CodeClub'
import { traduireErreurClub } from '../lib/club'

/**
 * La rubrique « Mon club » — deux visages pour une même route :
 * l'adhérent y voit ses écuries, son statut et ses chevaux ; le gérant y
 * tient ses membres, les accès offerts et le code d'adhésion.
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
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    setChevaux(await chargerMesChevaux(profil.id))
    await rafraichirAdhesions()
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
      <Entete titre="Mon club" retour />

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
              const duClub = chevaux.filter((c) => c.club_id === a.club_id)
              const enPension = chevaux.filter(
                (c) => c.ecurie_id === a.club_id && c.club_id !== a.club_id
              )

              return (
                <section key={a.club_id} className="section">
                  <div className="carte">
                    <div className="rangee" style={{ justifyContent: 'space-between' }}>
                      <div className="gras">{a.club_nom}</div>
                      {a.siege && a.club_premium ? (
                        <span className="badge ok">Accès offert</span>
                      ) : a.siege ? (
                        <span className="badge contour">Abonnement de l'écurie inactif</span>
                      ) : (
                        <span className="badge contour">Membre</span>
                      )}
                    </div>

                    <p className="aide" style={{ marginTop: 8 }}>
                      {a.siege && a.club_premium
                        ? "L'écurie vous offre l'accès complet sur ses chevaux : carnet de santé, calendrier sans limite, documents et dépenses. Vos chevaux personnels hors écurie restent sur votre plan."
                        : a.siege
                          ? "Votre siège est prêt : l'accès s'ouvrira dès que l'écurie aura activé son abonnement."
                          : "L'écurie ne vous a pas attribué d'accès offert pour le moment."}
                    </p>

                    {(duClub.length > 0 || enPension.length > 0) && (
                      <div className="liste" style={{ marginTop: 10 }}>
                        {[...duClub, ...enPension].map((cheval) => (
                          <Link key={cheval.id} to={`/chevaux/${cheval.id}`} className="element">
                            <div className="corps">
                              <div className="titre">{cheval.nom}</div>
                              <div className="meta">
                                {cheval.club_id === a.club_id
                                  ? "Cheval de l'écurie"
                                  : 'Mon cheval, en pension ici'}
                              </div>
                            </div>
                            {cheval.ecurie_id === a.club_id && cheval.club_id !== a.club_id && (
                              <button
                                className="bouton fantome petit"
                                onClick={(e) => {
                                  e.preventDefault()
                                  sortirDePension(cheval.id)
                                }}
                              >
                                Sortir
                              </button>
                            )}
                            <span className="fleche">›</span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {chevauxAPension.length > 0 && (
                      <Champ
                        label="Mettre un de mes chevaux en pension ici"
                        aide="Il entre dans le périmètre de l'écurie : l'accès offert le couvre aussi."
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
                    )}

                    <div className="rangee" style={{ marginTop: 12 }}>
                      <Link to="/cours" className="bouton secondaire petit">
                        Voir les cours
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
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const recharger = useCallback(async () => {
    const [ligneCode, lignesMembres] = await Promise.all([
      supabase.from('codes_adhesion').select('code').eq('club_id', profil.id).maybeSingle(),
      supabase
        .from('membres_club')
        .select('id, siege, siege_depuis, cree_le, cavalier:cavalier_id(id, nom, photo_url, niveau_galop)')
        .eq('club_id', profil.id)
        .order('cree_le'),
    ])
    if (lignesMembres.error) throw lignesMembres.error
    setCode(ligneCode.data?.code ?? null)
    setMembres(lignesMembres.data || [])
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

  if (chargement) return <Chargement />

  const avecAcces = membres.filter((m) => m.siege).length

  return (
    <>
      <Entete
        titre="Mon club"
        sousTitre={`${membres.length} membre${membres.length > 1 ? 's' : ''}`}
        retour
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
              {membres.map((membre) => (
                <div key={membre.id} className="element" style={{ flexWrap: 'wrap' }}>
                  <Avatar profil={membre.cavalier} />
                  <div className="corps">
                    <div className="titre">{membre.cavalier?.nom}</div>
                    <div className="meta">
                      {membre.cavalier?.niveau_galop
                        ? `Galop ${membre.cavalier.niveau_galop} · `
                        : ''}
                      {membre.siege ? 'Accès offert' : 'Sans accès offert'}
                    </div>
                  </div>
                  <button
                    className={`bouton petit ${membre.siege ? 'fantome' : ''}`}
                    onClick={() => changerSiege(membre, !membre.siege)}
                  >
                    {membre.siege ? "Retirer l'accès" : "Offrir l'accès"}
                  </button>
                  <button className="bouton fantome petit" onClick={() => retirer(membre)}>
                    Retirer
                  </button>
                </div>
              ))}
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
    </>
  )
}

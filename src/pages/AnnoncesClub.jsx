import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { TYPES_ANNONCE } from '../lib/constantes'
import { formatDate } from '../lib/format'
import { Champ, Chargement, Erreur, EtatVide, Feuille } from '../composants/Ui'
import { Entete } from '../composants/Mise'

/**
 * Le fil d'annonces du club — même route des deux côtés (comme « Mon
 * club » et « Tarifs ») : le gérant publie, ses adhérents lisent.
 * Chronologique, sans mise en scène : ce n'est pas un calendrier, les
 * créneaux et cours existent déjà pour ça.
 */
export default function AnnoncesClub() {
  const { estClub } = useAuth()
  return estClub ? <AnnoncesGerant /> : <AnnoncesCavalier />
}

/* ============================================================
   Côté gérant : publication, édition, suppression
   ============================================================ */
function AnnoncesGerant() {
  const { profil } = useAuth()
  const [annonces, setAnnonces] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [annonceOuverteId, setAnnonceOuverteId] = useState(null)

  const recharger = useCallback(async () => {
    const { data, error } = await supabase
      .from('annonces_club')
      .select('*')
      .eq('club_id', profil.id)
      .order('cree_le', { ascending: false })
    if (error) throw error
    setAnnonces(data || [])
  }, [profil.id])

  useEffect(() => {
    recharger()
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [recharger])

  const annonceOuverte = annonces.find((a) => a.id === annonceOuverteId) || null

  if (chargement) return <Chargement />

  return (
    <>
      <Entete titre="Annonces" sousTitre="Votre fil, visible de vos adhérents" retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {annonces.length === 0 ? (
          <EtatVide
            emoji="📣"
            titre="Aucune annonce publiée"
            texte="Une fermeture exceptionnelle, un stage à venir, une actualité — vos adhérents la verront depuis leur téléphone."
          />
        ) : (
          <div className="liste">
            {annonces.map((annonce) => {
              const config = TYPES_ANNONCE[annonce.type] || TYPES_ANNONCE.info
              return (
                <button
                  key={annonce.id}
                  className="element"
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => setAnnonceOuverteId(annonce.id)}
                >
                  <div className="corps">
                    <div className="rangee espace">
                      <span className="titre">{annonce.titre}</span>
                      <span className={`badge ${config.classe}`}>{config.libelle}</span>
                    </div>
                    <div className="meta">{formatDate(annonce.cree_le, { avecJour: true })}</div>
                  </div>
                  <span className="fleche">›</span>
                </button>
              )
            })}
          </div>
        )}
      </main>

      <button
        className="bouton-flottant"
        aria-label="Publier une annonce"
        onClick={() => setCreationOuverte(true)}
      >
        +
      </button>

      <FeuilleAnnonce
        clubId={profil.id}
        annonce={null}
        ouverte={creationOuverte}
        onFermer={() => setCreationOuverte(false)}
        onEnregistre={() => {
          setCreationOuverte(false)
          recharger()
        }}
      />

      <FeuilleAnnonce
        clubId={profil.id}
        annonce={annonceOuverte}
        ouverte={Boolean(annonceOuverte)}
        onFermer={() => setAnnonceOuverteId(null)}
        onEnregistre={() => {
          setAnnonceOuverteId(null)
          recharger()
        }}
      />
    </>
  )
}

function FeuilleAnnonce({ clubId, annonce, ouverte, onFermer, onEnregistre }) {
  const vide = { titre: '', contenu: '', type: 'info' }
  const [valeurs, setValeurs] = useState(annonce || vide)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setValeurs(annonce || vide)
      setErreur('')
    }
  }

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    const lignes = {
      titre: valeurs.titre.trim(),
      contenu: valeurs.contenu.trim(),
      type: valeurs.type,
    }

    const { error } = annonce
      ? await supabase.from('annonces_club').update(lignes).eq('id', annonce.id)
      : await supabase.from('annonces_club').insert({ ...lignes, club_id: clubId })

    setEnvoi(false)
    if (error) setErreur(error.message)
    else onEnregistre()
  }

  async function supprimer() {
    if (!window.confirm(`Supprimer « ${annonce.titre} » ?`)) return
    setErreur('')
    const { error } = await supabase.from('annonces_club').delete().eq('id', annonce.id)
    if (error) setErreur(error.message)
    else onEnregistre()
  }

  return (
    <Feuille titre={annonce ? 'Modifier l\'annonce' : 'Nouvelle annonce'} ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Type">
          <div className="choix-puces">
            {Object.entries(TYPES_ANNONCE).map(([cle, t]) => (
              <button
                key={cle}
                type="button"
                className={valeurs.type === cle ? 'actif' : undefined}
                onClick={() => setValeurs((v) => ({ ...v, type: cle }))}
              >
                {t.libelle}
              </button>
            ))}
          </div>
        </Champ>

        <Champ label="Titre">
          <input
            value={valeurs.titre}
            onChange={modifier('titre')}
            placeholder="Fermeture le 15 août"
            required
            autoFocus
          />
        </Champ>

        <Champ label="Message">
          <textarea
            value={valeurs.contenu}
            onChange={modifier('contenu')}
            placeholder="Le club sera fermé toute la journée…"
            required
          />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Publier'}
        </button>

        {annonce && (
          <button
            type="button"
            className="bouton danger pleine-largeur"
            style={{ marginTop: 10 }}
            onClick={supprimer}
          >
            Supprimer cette annonce
          </button>
        )}
      </form>
    </Feuille>
  )
}

/* ============================================================
   Côté cavalier : fil en lecture seule, tous ses clubs confondus
   ============================================================ */
function AnnoncesCavalier() {
  const [annonces, setAnnonces] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false

    async function charger() {
      const { data, error } = await supabase
        .from('annonces_club')
        .select('*, club:profils(nom)')
        .order('cree_le', { ascending: false })
      if (error) throw error
      if (!annule) setAnnonces(data || [])
    }

    charger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [])

  if (chargement) return <Chargement />

  // Plusieurs écuries adhérées : l'annonce précise laquelle parle.
  const plusieursClubs = new Set(annonces.map((a) => a.club_id)).size > 1

  return (
    <>
      <Entete titre="Annonces" sousTitre="Ce que disent vos écuries" retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {annonces.length === 0 ? (
          <EtatVide
            emoji="📣"
            titre="Aucune annonce pour l'instant"
            texte="Les fermetures, stages et actualités de vos écuries apparaîtront ici."
          />
        ) : (
          <div className="liste">
            {annonces.map((annonce) => {
              const config = TYPES_ANNONCE[annonce.type] || TYPES_ANNONCE.info
              return (
                <div key={annonce.id} className="carte">
                  <div className="rangee espace">
                    <span className={`badge ${config.classe}`}>{config.libelle}</span>
                    <span className="doux" style={{ fontSize: '0.8rem' }}>
                      {formatDate(annonce.cree_le, { avecJour: true })}
                    </span>
                  </div>
                  <div className="gras" style={{ marginTop: 8 }}>{annonce.titre}</div>
                  {plusieursClubs && (
                    <div className="doux" style={{ fontSize: '0.82rem' }}>{annonce.club?.nom}</div>
                  )}
                  <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{annonce.contenu}</p>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

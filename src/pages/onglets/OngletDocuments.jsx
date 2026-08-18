import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { chargerDocuments } from '../../lib/requetes'
import { Link } from 'react-router-dom'
import { Champ, Chargement, Erreur, EtatVide, Feuille } from '../../composants/Ui'
import { CATEGORIES_DOCUMENT, QUOTA_DOCUMENTS } from '../../lib/constantes'
import { formatDate } from '../../lib/format'

const TAILLE_MAX_OCTETS = 5 * 1024 * 1024 // doit rester égal au bucket (migration 0016)

/** « 2,3 Mo », pas d'octets bruts : lisible sans faire le calcul. */
function tailleLisible(octets) {
  if (!octets) return null
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

/**
 * Compresse une image de papier avant l'envoi : 1200 px sur le plus grand
 * côté, JPEG qualité 80. C'est ce qui fait qu'une photo de 8 Mo prise au
 * téléphone finit à quelques centaines de kilooctets — et passe donc très
 * en dessous de la limite de 5 Mo, qui ne s'applique en pratique qu'aux
 * fichiers anormaux et aux PDF.
 *
 * Un PDF traverse sans y toucher : le compresser casserait sa mise en page.
 * JPG, PNG, WebP, HEIC passent tous par le canvas et ressortent en JPEG.
 */
async function fichierAEnvoyer(fichier) {
  if (!fichier.type.startsWith('image/')) return fichier

  try {
    const bitmap = await createImageBitmap(fichier)
    const echelle = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const largeur = Math.round(bitmap.width * echelle)
    const hauteur = Math.round(bitmap.height * echelle)

    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    return blob ? new File([blob], fichier.name, { type: 'image/jpeg' }) : fichier
  } catch (e) {
    // HEIC mal supporté par ce navigateur, fichier corrompu… : mieux vaut
    // tenter l'original que perdre le document — la limite de taille le
    // jugera ensuite.
    console.warn('Compression impossible, envoi du fichier original', e)
    return fichier
  }
}

/**
 * Extension du fichier tel qu'il part réellement vers le bucket — celui
 * traité par `fichierAEnvoyer`, pas celui choisi dans le sélecteur. Une
 * photo HEIC recompressée en JPEG doit finir en `.jpg`, pas en `.heic`.
 */
function extensionEnvoyee(fichier) {
  const PAR_TYPE = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }
  if (PAR_TYPE[fichier.type]) return PAR_TYPE[fichier.type]

  const point = fichier.name.lastIndexOf('.')
  return point > 0 ? fichier.name.slice(point + 1).toLowerCase() : 'bin'
}

export default function OngletDocuments({ cheval }) {
  const { profil, estPremium } = useAuth()
  const [documents, setDocuments] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)

  // Le quota se compte par cheval, la limite dépend du plan de celui qui
  // ajoute. Celle qui fait foi est le trigger de la migration 0016 ; ici on
  // l'annonce avant de buter dessus.
  const limite = estPremium ? QUOTA_DOCUMENTS.premium : QUOTA_DOCUMENTS.gratuit
  const quotaAtteint = documents.length >= limite

  const recharger = useCallback(async () => {
    try {
      setDocuments(await chargerDocuments(cheval.id))
    } catch (e) {
      setErreur(e.message || 'Chargement des documents impossible')
    } finally {
      setChargement(false)
    }
  }, [cheval.id])

  useEffect(() => {
    recharger()
  }, [recharger])

  /**
   * URL signée, demandée au moment du clic plutôt que gardée en mémoire :
   * elle expire vite (60 s), et la redemander à chaque fois garantit que
   * le RLS — donc l'abonnement — est revérifié à chaque ouverture.
   */
  async function ouvrir(document) {
    setErreur('')
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(document.chemin, 60)
    if (error) {
      setErreur("Impossible d'ouvrir ce document pour le moment")
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function supprimer(document) {
    if (!window.confirm(`Supprimer « ${document.nom} » ?`)) return

    // Le fichier d'abord : s'il refuse, la ligne reste et la suppression
    // reste possible à retenter — plutôt qu'une ligne effacée pointant sur
    // un fichier qui traîne encore dans le bucket.
    const { error: erreurFichier } = await supabase.storage
      .from('documents')
      .remove([document.chemin])
    if (erreurFichier) {
      setErreur('Suppression impossible pour le moment')
      return
    }

    const { error } = await supabase.from('documents').delete().eq('id', document.id)
    if (error) setErreur(error.message)
    else recharger()
  }

  if (chargement) return <Chargement />

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      {quotaAtteint ? (
        // L'invite remplace le bouton plutôt que de le griser : un bouton
        // gris dit « ça ne marche pas », celle-ci dit quoi faire.
        <div className="carte">
          <p className="gras">Limite de {limite} documents atteinte pour ce cheval</p>
          <p className="doux" style={{ marginTop: 6 }}>
            {estPremium
              ? 'Supprimez des documents pour pouvoir en ajouter de nouveaux.'
              : `Supprimez des documents, ou passez en Premium pour en ranger jusqu'à ${QUOTA_DOCUMENTS.premium} par cheval.`}
          </p>
          {!estPremium && (
            <Link to="/premium?motif=documents" className="bouton" style={{ marginTop: 12 }}>
              Découvrir Premium
            </Link>
          )}
        </div>
      ) : (
        <div>
          <button className="bouton pleine-largeur" onClick={() => setFeuilleOuverte(true)}>
            + Ajouter un document
          </button>
          {documents.length > 0 && (
            <p className="aide centre" style={{ marginTop: 6 }}>
              {documents.length}/{limite} documents pour ce cheval
            </p>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <EtatVide
          emoji="🪪"
          titre="Aucun document"
          texte="Carte d'immatriculation, contrat de demi-pension, assurance… ajoutez-les une fois pour toutes, ils resteront accessibles à tous les cavaliers liés au cheval."
        />
      ) : (
        <div className="liste">
          {documents.map((document) => {
            const config = CATEGORIES_DOCUMENT[document.categorie] || CATEGORIES_DOCUMENT.autre
            const taille = tailleLisible(document.taille_octets)
            return (
              <div key={document.id} className="element">
                <span style={{ fontSize: '1.3rem' }}>{config.emoji}</span>
                <button className="corps document-lien" onClick={() => ouvrir(document)}>
                  <div className="titre">{document.nom}</div>
                  <div className="meta">
                    {config.libelle} · {formatDate(document.cree_le, { court: true })}
                    {taille ? ` · ${taille}` : ''}
                    {document.profil?.nom ? ` · ${document.profil.nom}` : ''}
                  </div>
                </button>
                <button className="bouton fantome petit" onClick={() => supprimer(document)}>
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      <FeuilleDocument
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

function FeuilleDocument({ cheval, profilId, ouverte, onFermer, onAjoute }) {
  const champRef = useRef(null)
  const nomRef = useRef(null)
  const [categorie, setCategorie] = useState(null)
  const [nom, setNom] = useState('')
  const [fichier, setFichier] = useState(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [preparation, setPreparation] = useState(false)

  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setCategorie(null)
      setNom('')
      setFichier(null)
      setErreur('')
      if (champRef.current) champRef.current.value = ''
    }
  }

  /**
   * La catégorie d'abord, le fichier ensuite : le sélecteur ne s'ouvre
   * qu'une fois la catégorie posée, si bien qu'aucun document ne peut
   * partir sans être classé. Pour les trois catégories nommées, choisir
   * ouvre directement le sélecteur — le classement EST le geste. « Autre »
   * marque un arrêt : le nom d'abord, puisque c'est lui qui dira ce qu'est
   * ce document.
   */
  function choisirCategorie(cle) {
    setCategorie(cle)
    setErreur('')
    if (cle === 'autre') {
      // Le champ n'existe pas encore à cet instant du rendu.
      setTimeout(() => nomRef.current?.focus(), 50)
    } else {
      champRef.current?.click()
    }
  }

  /**
   * La compression se fait DÈS la sélection, pas à l'envoi, et le contrôle
   * de taille porte sur ce qui partira réellement. L'ordre compte : une
   * photo de 8 Mo prise au téléphone finit à quelques centaines de
   * kilooctets une fois ramenée à 1200 px — la refuser sur son poids
   * d'origine reviendrait à refuser à peu près toutes les photos récentes.
   * Un PDF, lui, part tel quel : 5 Mo est sa vraie limite.
   */
  async function surSelection(evenement) {
    const choisi = evenement.target.files?.[0]
    // Rechoisir le même fichier doit redéclencher l'événement.
    evenement.target.value = ''
    if (!choisi) return

    setErreur('')
    setFichier(null)

    if (choisi.type !== 'application/pdf' && !choisi.type.startsWith('image/')) {
      setErreur('Seuls les PDF et les images sont acceptés.')
      return
    }

    setPreparation(true)
    try {
      const prepare = await fichierAEnvoyer(choisi)
      if (prepare.size > TAILLE_MAX_OCTETS) {
        setErreur(
          prepare.type === 'application/pdf'
            ? 'Fichier trop lourd (max 5 Mo). Une photo du document, plutôt qu’un scan haute résolution, passe largement en dessous.'
            : 'Fichier trop lourd (max 5 Mo), même après compression.'
        )
        return
      }
      setFichier(prepare)
    } finally {
      setPreparation(false)
    }
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    if (!categorie) {
      setErreur('Choisissez une catégorie')
      return
    }
    // Obligatoire pour « autre » seulement : sans nom, une ligne « Autre »
    // ne dit rien de ce qu'elle contient. Les trois autres catégories se
    // suffisent — leur libellé sert alors de titre.
    if (categorie === 'autre' && !nom.trim()) {
      setErreur('Donnez un nom à ce document — c’est lui qui s’affichera dans la liste')
      return
    }
    if (!fichier) {
      setErreur('Choisissez un fichier')
      return
    }
    setErreur('')
    setEnvoi(true)
    try {
      // Déjà compressé et jaugé à la sélection : rien à refaire ici.
      const chemin = `${cheval.id}/${crypto.randomUUID()}.${extensionEnvoyee(fichier)}`

      const { error: erreurEnvoi } = await supabase.storage
        .from('documents')
        .upload(chemin, fichier, { contentType: fichier.type, upsert: false })
      if (erreurEnvoi) throw erreurEnvoi

      const { error } = await supabase.from('documents').insert({
        cheval_id: cheval.id,
        categorie,
        nom: nom.trim() || CATEGORIES_DOCUMENT[categorie].libelle,
        chemin,
        taille_octets: fichier.size,
        type_mime: fichier.type,
        ajoute_par: profilId,
      })
      if (error) {
        // La ligne a échoué après un envoi réussi : mieux vaut nettoyer le
        // fichier orphelin que le laisser invisible mais présent.
        await supabase.storage.from('documents').remove([chemin])
        throw error
      }

      onAjoute()
    } catch (e) {
      // Refus du trigger de quota (0016) : le co-cavalier a pu remplir le
      // carnet pendant que cette feuille était ouverte.
      if (e.message?.includes('QUOTA_DOCUMENTS')) {
        setErreur('La limite de documents de ce cheval est atteinte. Fermez cette fenêtre : la liste vous dira quoi faire.')
      } else if (/exceeded the maximum allowed size|Payload too large/i.test(e.message || '')) {
        setErreur('Fichier trop lourd (max 5 Mo).')
      } else {
        setErreur(e.message || "L'envoi a échoué")
      }
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Feuille titre="Nouveau document" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <p className="doux" style={{ marginBottom: 12 }}>
          De quel document s’agit-il ?
        </p>

        <div className="choix-compte" style={{ marginBottom: 16 }}>
          {Object.entries(CATEGORIES_DOCUMENT).map(([cle, config]) => (
            <button
              key={cle}
              type="button"
              className={categorie === cle ? 'actif' : undefined}
              onClick={() => choisirCategorie(cle)}
            >
              <span className="emoji">{config.emoji}</span>
              <span>
                <span className="titre">{config.libelle}</span>
              </span>
            </button>
          ))}
        </div>

        <input
          ref={champRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={surSelection}
          style={{ display: 'none' }}
        />

        {categorie && (
          <>
            {categorie === 'autre' ? (
              <Champ
                label="Nom du document"
                aide="C’est lui qui s’affichera dans la liste"
              >
                <input
                  ref={nomRef}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Facture ostéo mai 2026, certificat de vente…"
                  required
                />
              </Champ>
            ) : (
              <Champ
                label="Nom du document"
                aide={`Facultatif — sinon « ${CATEGORIES_DOCUMENT[categorie].libelle} » servira de titre`}
              >
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={CATEGORIES_DOCUMENT[categorie].libelle}
                />
              </Champ>
            )}

            <Champ label="Fichier" aide="PDF ou photo — 5 Mo maximum, les images sont compressées automatiquement">
              <button
                type="button"
                className="bouton secondaire pleine-largeur"
                onClick={() => champRef.current?.click()}
                disabled={preparation}
              >
                {preparation ? 'Préparation…' : fichier ? fichier.name : 'Choisir un fichier'}
              </button>
            </Champ>
          </>
        )}

        <button
          className="bouton pleine-largeur"
          disabled={envoi || !fichier || !categorie || (categorie === 'autre' && !nom.trim())}
        >
          {envoi ? 'Envoi…' : 'Enregistrer'}
        </button>
      </form>
    </Feuille>
  )
}

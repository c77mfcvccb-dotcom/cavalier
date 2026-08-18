import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { chargerDocuments } from '../../lib/requetes'
import { Champ, Chargement, Erreur, EtatVide, Feuille } from '../../composants/Ui'
import BloquePremium from '../../composants/BloquePremium'
import { CATEGORIES_DOCUMENT } from '../../lib/constantes'
import { formatDate } from '../../lib/format'

const TAILLE_MAX_OCTETS = 15 * 1024 * 1024 // doit rester égal au bucket (migration 0015)

/** « 2,3 Mo », pas d'octets bruts : lisible sans faire le calcul. */
function tailleLisible(octets) {
  if (!octets) return null
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

/**
 * Redimensionne une photo de papier avant l'envoi, comme ChargeurPhoto.
 *
 * Un côté plus grand qu'une photo d'avatar (1600 plutôt que 900) : un
 * document doit rester lisible en zoomant, pas seulement reconnaissable.
 * Un PDF, lui, traverse sans y toucher — le compresser casserait sa mise
 * en page, et il est déjà d'une taille raisonnable la plupart du temps.
 */
async function fichierAEnvoyer(fichier) {
  if (!fichier.type.startsWith('image/')) return fichier

  try {
    const bitmap = await createImageBitmap(fichier)
    const echelle = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const largeur = Math.round(bitmap.width * echelle)
    const hauteur = Math.round(bitmap.height * echelle)

    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    return blob ? new File([blob], fichier.name, { type: 'image/jpeg' }) : fichier
  } catch (e) {
    // HEIC mal supporté par ce navigateur, fichier corrompu… : mieux vaut
    // envoyer l'original que perdre le document.
    console.warn('Redimensionnement impossible, envoi du fichier original', e)
    return fichier
  }
}

/**
 * Extension du fichier tel qu'il part réellement vers le bucket — celui
 * traité par `fichierAEnvoyer`, pas celui choisi dans le sélecteur. Une
 * photo HEIC recompressée en JPEG doit finir en `.jpg`, pas en `.heic`.
 */
function extensionEnvoyee(fichierOriginal, aEnvoyer) {
  const PAR_TYPE = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }
  if (PAR_TYPE[aEnvoyer.type]) return PAR_TYPE[aEnvoyer.type]

  const point = fichierOriginal.name.lastIndexOf('.')
  return point > 0 ? fichierOriginal.name.slice(point + 1).toLowerCase() : 'bin'
}

export default function OngletDocuments({ cheval }) {
  const { profil, estPremium } = useAuth()
  const [documents, setDocuments] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)

  const recharger = useCallback(async () => {
    if (!estPremium) {
      setChargement(false)
      return
    }
    try {
      setDocuments(await chargerDocuments(cheval.id))
    } catch (e) {
      setErreur(e.message || 'Chargement des documents impossible')
    } finally {
      setChargement(false)
    }
  }, [cheval.id, estPremium])

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

  if (!estPremium) {
    return (
      <BloquePremium
        emoji="🪪"
        titre="Documents du cheval"
        texte="Papiers d'identification, contrat de demi-pension, attestation d'assurance : rangés une fois, visibles par tous les cavaliers liés au cheval."
        motif="documents"
      />
    )
  }

  if (chargement) return <Chargement />

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      <button className="bouton pleine-largeur" onClick={() => setFeuilleOuverte(true)}>
        + Ajouter un document
      </button>

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

  function surSelection(evenement) {
    const choisi = evenement.target.files?.[0]
    if (!choisi) return
    if (choisi.size > TAILLE_MAX_OCTETS) {
      setErreur('Ce fichier dépasse 15 Mo. Une photo plutôt qu’un scan haute résolution passe en général largement en dessous.')
      evenement.target.value = ''
      return
    }
    setErreur('')
    setFichier(choisi)
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
      const aEnvoyer = await fichierAEnvoyer(fichier)
      const chemin = `${cheval.id}/${crypto.randomUUID()}.${extensionEnvoyee(fichier, aEnvoyer)}`

      const { error: erreurEnvoi } = await supabase.storage
        .from('documents')
        .upload(chemin, aEnvoyer, { contentType: aEnvoyer.type, upsert: false })
      if (erreurEnvoi) throw erreurEnvoi

      const { error } = await supabase.from('documents').insert({
        cheval_id: cheval.id,
        categorie,
        nom: nom.trim() || CATEGORIES_DOCUMENT[categorie].libelle,
        chemin,
        taille_octets: aEnvoyer.size,
        type_mime: aEnvoyer.type,
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
      setErreur(e.message || "L'envoi a échoué")
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

            <Champ label="Fichier" aide="PDF, photo ou scan — 15 Mo maximum">
              <button
                type="button"
                className="bouton secondaire pleine-largeur"
                onClick={() => champRef.current?.click()}
              >
                {fichier ? fichier.name : 'Choisir un fichier'}
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

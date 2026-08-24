import { useRef, useState } from 'react'
import Icone from './Icone'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'

/**
 * Sélection d'une photo, redimensionnée dans le navigateur avant l'envoi
 * vers le bucket Storage « photos ». Évite d'expédier 5 Mo depuis un mobile.
 *
 * `onEnvoiChange` (optionnel) prévient le parent que l'envoi est en cours :
 * un formulaire de création qui n'attend pas cette fin avant de soumettre
 * enregistre la fiche sans la photo, choisie pourtant à temps — l'envoi
 * n'a simplement pas eu le temps de se terminer.
 */
export default function ChargeurPhoto({
  valeur,
  onChange,
  onEnvoiChange,
  forme = 'carre',
  label = 'Photo',
}) {
  const { utilisateur } = useAuth()
  const champRef = useRef(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  function declarerEnvoi(enCours) {
    setEnvoi(enCours)
    onEnvoiChange?.(enCours)
  }

  async function redimensionner(fichier, cote = 900) {
    const bitmap = await createImageBitmap(fichier)
    const echelle = Math.min(1, cote / Math.max(bitmap.width, bitmap.height))
    const largeur = Math.round(bitmap.width * echelle)
    const hauteur = Math.round(bitmap.height * echelle)

    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur)

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  }

  async function surSelection(evenement) {
    const fichier = evenement.target.files?.[0]
    if (!fichier) return

    setErreur('')
    declarerEnvoi(true)
    try {
      const blob = await redimensionner(fichier)
      const chemin = `${utilisateur.id}/${crypto.randomUUID()}.jpg`

      const { error } = await supabase.storage
        .from('photos')
        .upload(chemin, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error

      const { data } = supabase.storage.from('photos').getPublicUrl(chemin)
      onChange(data.publicUrl)
    } catch (e) {
      setErreur("L'envoi de la photo a échoué")
      console.error(e)
    } finally {
      declarerEnvoi(false)
      if (champRef.current) champRef.current.value = ''
    }
  }

  const styleApercu =
    forme === 'rond'
      ? { width: 76, height: 76, borderRadius: '50%' }
      : { width: 76, height: 76, borderRadius: 12 }

  return (
    <div className="champ">
      <label>{label}</label>
      <div className="rangee">
        {valeur ? (
          <img src={valeur} alt="" style={{ ...styleApercu, objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              ...styleApercu,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--sable)',
              color: 'var(--encre-douce, #8a8578)',
            }}
          >
            <Icone nom="photo" taille={26} />
          </div>
        )}

        <div className="pile" style={{ gap: 6 }}>
          <button
            type="button"
            className="bouton secondaire petit"
            onClick={() => champRef.current?.click()}
            disabled={envoi}
          >
            {envoi ? 'Envoi…' : valeur ? 'Changer' : 'Choisir une photo'}
          </button>
          {valeur && !envoi && (
            <button type="button" className="bouton fantome petit" onClick={() => onChange(null)}>
              Retirer
            </button>
          )}
        </div>
      </div>

      {erreur && <span className="aide" style={{ color: 'var(--rouge)' }}>{erreur}</span>}

      <input
        ref={champRef}
        type="file"
        accept="image/*"
        onChange={surSelection}
        style={{ display: 'none' }}
      />
    </div>
  )
}

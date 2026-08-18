import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Erreur, Succes } from './Ui'

/**
 * Saisie du code d'adhésion d'une écurie — sur l'écran Mon club, et sur
 * l'écran d'abonnement en alternative au paiement : si le club a un
 * abonnement actif, l'adhésion donne le siège d'office (migration 0018) et
 * l'accès complet s'ouvre sur son périmètre, sans payer.
 *
 * Le message de réussite dit exactement ce qui a été obtenu : membre avec
 * accès offert, ou membre en attente de l'abonnement du club. Il annonce
 * aussi la limite — les chevaux personnels hors écurie restent au plan du
 * compte — pour que personne ne se croie premium partout.
 */
export default function CodeClub({ onRejoint }) {
  const { rafraichirAdhesions } = useAuth()
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [resultat, setResultat] = useState(null)

  async function rejoindre(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)
    const { data, error } = await supabase.rpc('rejoindre_club', { p_code: code.trim() })
    setEnvoi(false)

    if (error) {
      setErreur(
        error.message.includes('introuvable')
          ? 'Code introuvable — vérifiez-le auprès de votre écurie.'
          : error.message.replace(/^.*?:\s*/, '')
      )
      return
    }

    setResultat(data)
    setCode('')
    await rafraichirAdhesions()
    onRejoint?.(data)
  }

  return (
    <form onSubmit={rejoindre}>
      <Erreur>{erreur}</Erreur>
      {resultat && (
        <Succes>
          {resultat.deja_membre
            ? `Vous êtes déjà membre de ${resultat.nom}.`
            : `Bienvenue chez ${resultat.nom} !`}{' '}
          L'accès offert par l'écurie couvre ses chevaux — vos chevaux
          personnels restent sur votre plan.
        </Succes>
      )}

      <Champ label="Code d'adhésion" aide="6 caractères, fourni par votre écurie">
        <div className="rangee">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            style={{ textTransform: 'uppercase', flex: 1 }}
            required
          />
          <button className="bouton" disabled={envoi || !code.trim()}>
            {envoi ? '…' : 'Rejoindre'}
          </button>
        </div>
      </Champ>
    </form>
  )
}

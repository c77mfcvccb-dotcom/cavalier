import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Champ, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'

export default function RejoindreCheval() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function surSoumission(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    // La validation du code se fait côté base (fonction security definer) :
    // un code invalide n'expose jamais l'existence du cheval.
    const { data, error } = await supabase.rpc('rejoindre_par_code', {
      p_code: code.trim().toUpperCase(),
    })

    if (error) {
      setErreur(error.message.replace(/^.*?:\s*/, '') || 'Code invalide')
      setEnvoi(false)
      return
    }

    navigate(`/chevaux/${data.cheval_id}`, { replace: true })
  }

  return (
    <>
      <Entete titre="Rejoindre un cheval" retour />

      <main className="contenu">
        <form onSubmit={surSoumission}>
          <Erreur>{erreur}</Erreur>

          <p className="doux" style={{ marginBottom: 18 }}>
            Saisissez le code à 6 caractères que le propriétaire du cheval ou le club vous a
            transmis. Vous serez automatiquement lié au cheval et verrez son calendrier partagé.
          </p>

          <Champ label="Code d'invitation">
            <input
              className="champ-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC123"
              required
              autoFocus
            />
          </Champ>

          <button className="bouton pleine-largeur" disabled={envoi || code.length < 6}>
            {envoi ? 'Vérification…' : 'Rejoindre'}
          </button>
        </form>
      </main>
    </>
  )
}

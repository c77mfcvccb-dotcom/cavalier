import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { Champ, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import BloquePremium from '../composants/BloquePremium'
import { chargerNbChevauxDuCompte } from '../lib/requetes'
import { estErreurQuota, LIMITE_CHEVAUX_GRATUIT } from '../lib/abonnement'
import { PARTICIPANTS_MAX } from '../lib/constantes'

export default function RejoindreCheval() {
  const navigate = useNavigate()
  const { profil, estPremium } = useAuth()
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [quotaAtteint, setQuotaAtteint] = useState(false)

  // On vérifie avant la saisie : sinon on laisse taper un code pour rien,
  // et l'invitation du propriétaire risquerait d'être perçue comme cassée.
  useEffect(() => {
    if (estPremium) return
    chargerNbChevauxDuCompte(profil)
      .then((nb) => setQuotaAtteint(nb >= LIMITE_CHEVAUX_GRATUIT))
      .catch(() => setQuotaAtteint(false))
  }, [estPremium, profil])

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
      setEnvoi(false)
      // Quota du plan gratuit : on conduit vers l'offre. Le code n'a pas été
      // consommé, il reste utilisable après l'abonnement.
      if (estErreurQuota(error)) {
        navigate('/premium?motif=chevaux')
        return
      }
      // Le cheval s'est rempli entre l'émission du code et sa saisie. Le code
      // n'est pas consommé pour autant : il redeviendra valable si une place
      // se libère, d'où la formulation au présent plutôt qu'un « code
      // invalide » qui ferait croire à une erreur de frappe.
      if (error.message?.includes('CHEVAL_COMPLET')) {
        setErreur(
          `Ce cheval compte déjà ${PARTICIPANTS_MAX} cavaliers, le maximum. ` +
            'Votre code reste valable si une place se libère.'
        )
        return
      }
      setErreur(error.message.replace(/^.*?:\s*/, '') || 'Code invalide')
      return
    }

    navigate(`/chevaux/${data.cheval_id}`, { replace: true })
  }

  if (quotaAtteint) {
    return (
      <>
        <Entete titre="Rejoindre un cheval" retour />
        <main className="contenu">
          <BloquePremium
            emoji="🐴"
            titre="Un cheval maximum"
            texte="Le plan gratuit s'arrête à un cheval. Passez en Premium pour rejoindre celui-ci en plus du vôtre — le code qu'on vous a transmis restera valable."
            motif="chevaux"
          />
        </main>
      </>
    )
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

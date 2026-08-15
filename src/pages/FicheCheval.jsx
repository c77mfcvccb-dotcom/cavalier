import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { chargerCavaliersDuCheval } from '../lib/requetes'
import { Chargement, EtatVide, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import OngletFiche from './onglets/OngletFiche'
import OngletCalendrier from './onglets/OngletCalendrier'
import OngletSeances from './onglets/OngletSeances'
import OngletSoins from './onglets/OngletSoins'

const ONGLETS = [
  { cle: 'fiche', libelle: 'Fiche' },
  { cle: 'calendrier', libelle: 'Calendrier' },
  { cle: 'seances', libelle: 'Séances' },
  { cle: 'soins', libelle: 'Soins' },
]

export default function FicheCheval() {
  const { id } = useParams()
  const { profil } = useAuth()
  const [parametres, setParametres] = useSearchParams()
  const ongletActif = parametres.get('onglet') || 'fiche'

  const [cheval, setCheval] = useState(null)
  const [cavaliers, setCavaliers] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const { data, error } = await supabase
      .from('chevaux')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    setCheval(data)
    if (data) setCavaliers(await chargerCavaliersDuCheval(id))
  }, [id])

  useEffect(() => {
    setChargement(true)
    recharger()
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [recharger])

  if (chargement) return <Chargement />

  if (!cheval) {
    return (
      <>
        <Entete titre="Cheval" retour />
        <main className="contenu">
          <Erreur>{erreur}</Erreur>
          <EtatVide
            emoji="🔒"
            titre="Cheval introuvable"
            texte="Cette fiche n'existe plus ou vous n'y avez pas accès."
          />
        </main>
      </>
    )
  }

  // Le propriétaire et le club gèrent la fiche, les invitations et les liaisons.
  const estGestionnaire =
    cheval.club_id === profil.id ||
    cavaliers.some((c) => c.cavalier_id === profil.id && c.role === 'proprietaire')

  const proprietes = { cheval, cavaliers, estGestionnaire, recharger }

  return (
    <>
      <Entete titre={cheval.nom} sousTitre={cheval.race || null} retour />

      <main className="contenu">
        <div className="onglets">
          {ONGLETS.map((onglet) => (
            <button
              key={onglet.cle}
              className={ongletActif === onglet.cle ? 'actif' : undefined}
              onClick={() => setParametres({ onglet: onglet.cle }, { replace: true })}
            >
              {onglet.libelle}
            </button>
          ))}
        </div>

        <Erreur>{erreur}</Erreur>

        {ongletActif === 'fiche' && <OngletFiche {...proprietes} />}
        {ongletActif === 'calendrier' && <OngletCalendrier {...proprietes} />}
        {ongletActif === 'seances' && <OngletSeances {...proprietes} />}
        {ongletActif === 'soins' && <OngletSoins {...proprietes} />}
      </main>
    </>
  )
}

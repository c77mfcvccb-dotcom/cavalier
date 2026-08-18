import { useCallback, useEffect, useRef, useState } from 'react'
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
import OngletDocuments from './onglets/OngletDocuments'

const ONGLETS = [
  { cle: 'fiche', libelle: 'Fiche' },
  { cle: 'calendrier', libelle: 'Calendrier' },
  { cle: 'seances', libelle: 'Séances' },
  { cle: 'soins', libelle: 'Soins' },
  { cle: 'documents', libelle: 'Documents' },
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
  const ongletsRef = useRef(null)

  // Ouvrir directement sur un onglet éloigné (lien, retour arrière, actualisation
  // de page) le laissait hors champ dans la barre défilante : actif, mais
  // invisible tant qu'on n'avait pas pensé à faire glisser la barre soi-même.
  // Dépend aussi de `chargement` : au premier rendu, avant que la fiche ne
  // soit chargée, la fonction s'arrête plus bas sur <Chargement /> et la
  // barre d'onglets n'existe pas encore dans le DOM — l'effet s'exécuterait
  // dans le vide. Sans cette dépendance, il ne se rejoue jamais une fois le
  // contenu réellement monté.
  useEffect(() => {
    ongletsRef.current
      ?.querySelector('.actif')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [ongletActif, chargement])

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
        <div className="onglets" ref={ongletsRef}>
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
        {ongletActif === 'documents' && <OngletDocuments {...proprietes} />}
      </main>
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { chargerCavaliersDuCheval } from '../lib/requetes'
import { Chargement, EtatVide, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import OngletFiche from './onglets/OngletFiche'
import OngletCavaliers from './onglets/OngletCavaliers'
import OngletCalendrier from './onglets/OngletCalendrier'
import OngletSoins from './onglets/OngletSoins'
import OngletDocuments from './onglets/OngletDocuments'

const ONGLETS = [
  { cle: 'fiche', libelle: 'Fiche' },
  { cle: 'cavaliers', libelle: 'Cavaliers' },
  { cle: 'calendrier', libelle: 'Calendrier' },
  { cle: 'soins', libelle: 'Soins' },
  { cle: 'documents', libelle: 'Documents' },
]

export default function FicheCheval() {
  const { id } = useParams()
  const { profil } = useAuth()
  const [parametres, setParametres] = useSearchParams()
  // Un onglet disparu (Séances) ou une valeur inconnue dans un lien devenu
  // périmé retombe sur la Fiche plutôt que de laisser le contenu vide.
  const demande = parametres.get('onglet') || 'fiche'
  const ongletActif = ONGLETS.some((o) => o.cle === demande) ? demande : 'fiche'

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
            titre="Cheval introuvable"
            texte="Cette fiche n'existe plus ou vous n'y avez pas accès."
          />
        </main>
      </>
    )
  }

  // Le club garde le planning (créneaux, séances, indisponibilités) que le
  // cheval ait ou non une propriétaire désignée — voir est_gestionnaire_cheval.
  const estGestionnaire =
    cheval.club_id === profil.id ||
    cavaliers.some((c) => c.cavalier_id === profil.id && c.role === 'proprietaire')

  // La gestion de la fiche elle-même (modifier, accès, suppression) devient
  // exclusive à la propriétaire désignée dès qu'il y en a une — sinon elle
  // reste au gestionnaire actuel (club ou propriétaire de fait). Miroir
  // client de est_proprietaire_cheval() (migration 0029).
  const proprietaireDesignee = cavaliers.find((c) => c.role === 'proprietaire')
  const estProprietaire = proprietaireDesignee
    ? proprietaireDesignee.cavalier_id === profil.id
    : estGestionnaire

  const proprietes = { cheval, cavaliers, estGestionnaire, estProprietaire, recharger }

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
        {ongletActif === 'cavaliers' && <OngletCavaliers {...proprietes} />}
        {ongletActif === 'calendrier' && <OngletCalendrier {...proprietes} />}
        {ongletActif === 'soins' && <OngletSoins {...proprietes} />}
        {ongletActif === 'documents' && <OngletDocuments {...proprietes} />}
      </main>
    </>
  )
}

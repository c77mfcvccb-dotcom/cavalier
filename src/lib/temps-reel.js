import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Tables dont un changement doit rafraîchir un calendrier : les créneaux, et
 * les soins dont la vue `v_echeances` tire les échéances affichées sur la
 * même grille.
 */
const TABLES = ['creneaux', 'soins']

/** Rafale de saisies à deux : on ne recharge qu'une fois. */
const REGROUPEMENT_MS = 150

/**
 * Tient un calendrier à jour pendant qu'un autre cavalier écrit.
 *
 * Deux cavalières d'une même demi-pension posent souvent leurs créneaux
 * ensemble, chacune sur son téléphone : ce que l'une enregistre doit
 * apparaître chez l'autre sans qu'elle ait à recharger.
 *
 * On recharge plutôt que d'appliquer l'événement reçu. C'est un aller-retour
 * de plus, mais la liste vient toujours de la base : pas de divergence
 * possible entre ce qui est affiché et ce qui est enregistré, et rien à
 * réécrire le jour où le calendrier affichera autre chose. À l'échelle d'un
 * cheval, quelques dizaines de lignes, la dépense est théorique.
 *
 * **Aucun filtre côté serveur, volontairement.** Un filtre `cheval_id` ne
 * s'applique pas aux suppressions — le serveur ne peut pas comparer une ligne
 * qu'il vient d'effacer — et les créneaux supprimés resteraient affichés chez
 * l'autre. Le RLS fait déjà le tri : on ne reçoit que ce qu'on avait le droit
 * de lire.
 *
 * Le rappel est gardé dans une référence : le passer en dépendance
 * relancerait l'abonnement à chaque rendu.
 */
export function useAgendaVivant(chevauxIds, surChangement) {
  const rappel = useRef(surChangement)
  rappel.current = surChangement

  // Chaîne triée plutôt que le tableau : deux rendus successifs produisent
  // des tableaux différents pour un même contenu, et l'abonnement se
  // refermerait à chaque fois.
  const cle = [...new Set((chevauxIds ?? []).filter(Boolean))].sort().join(',')

  useEffect(() => {
    if (!supabase || !cle) return

    let minuterie = null
    const rafraichir = () => {
      clearTimeout(minuterie)
      minuterie = setTimeout(() => rappel.current?.(), REGROUPEMENT_MS)
    }

    const canal = supabase.channel(`agenda:${cle}`)
    for (const table of TABLES) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table }, rafraichir)
    }
    canal.subscribe()

    // Filet, indépendant du temps réel : au retour sur l'application, on
    // resynchronise. Couvre le téléphone verrouillé pendant l'échange, une
    // coupure de réseau, et le cas où la publication n'aurait pas encore été
    // activée en base — l'écran reste alors simplement moins vif.
    const surRetour = () => {
      if (document.visibilityState === 'visible') rafraichir()
    }
    document.addEventListener('visibilitychange', surRetour)

    return () => {
      clearTimeout(minuterie)
      document.removeEventListener('visibilitychange', surRetour)
      supabase.removeChannel(canal)
    }
  }, [cle])
}

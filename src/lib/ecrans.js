import { lazy } from 'react'

/**
 * Chargement différé d'un écran, avec rattrapage des déploiements.
 *
 * Un écran différé n'est téléchargé qu'à sa première ouverture. Le nom de son
 * fichier contient une empreinte du contenu : à chaque mise en ligne, les
 * anciens fichiers disparaissent. Une abonnée qui garde l'application ouverte
 * — cas normal sur un téléphone, où l'onglet survit des jours — conserve donc
 * en mémoire des adresses qui n'existent plus. Le premier écran qu'elle ouvre
 * après la mise en ligne échoue, et sans ce rattrapage, elle voit une erreur
 * pour la seule raison qu'on a déployé.
 *
 * Le remède est un rechargement, qui va rechercher la nouvelle liste. Il est
 * tenté **une seule fois** : si l'échec persiste, c'est autre chose qu'un
 * déploiement — réseau coupé, fichier réellement manquant — et il vaut mieux
 * une erreur lisible qu'une page qui se recharge en boucle.
 */
const CLE_RECHARGEMENT = 'licol.rechargement-apres-deploiement'

function memoriser(valeur) {
  try {
    if (valeur) sessionStorage.setItem(CLE_RECHARGEMENT, '1')
    else sessionStorage.removeItem(CLE_RECHARGEMENT)
  } catch {
    /* navigation privée verrouillée : on se passe du garde-fou */
  }
}

function dejaTente() {
  try {
    return sessionStorage.getItem(CLE_RECHARGEMENT) === '1'
  } catch {
    return false
  }
}

export function ecranDiffere(charger) {
  return lazy(() =>
    charger()
      .then((module) => {
        memoriser(false)
        return module
      })
      .catch((erreur) => {
        if (dejaTente()) throw erreur

        console.warn('Écran introuvable, rechargement après déploiement', erreur)
        memoriser(true)
        window.location.reload()

        // La page s'en va : cette promesse ne doit jamais se résoudre, sans
        // quoi React afficherait brièvement une erreur avant le départ.
        return new Promise(() => {})
      })
  )
}

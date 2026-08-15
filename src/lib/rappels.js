/**
 * Rappels d'échéances de soins.
 *
 * Choix assumé : pas de push serveur. Les rappels se déclenchent à
 * l'ouverture de l'application — pastille sur l'icône, bandeau en tête
 * d'écran, et notification locale si l'utilisateur l'a autorisée.
 * Voir docs/notifications.md pour la comparaison des options.
 */

const CLE_DEJA_NOTIFIE = 'cavalier.echeances-notifiees'
const CLE_BANDEAU_MASQUE = 'cavalier.bandeau-masque-le'

export const STATUTS_ALERTE = ['retard', 'urgent']

export function estAlerte(echeance) {
  return STATUTS_ALERTE.includes(echeance.statut)
}

/** Pastille sur l'icône de l'application installée (ignorée si non supportée). */
export function majBadgeApplication(nombre) {
  if (!('setAppBadge' in navigator)) return
  try {
    if (nombre > 0) navigator.setAppBadge(nombre)
    else navigator.clearAppBadge?.()
  } catch {
    // Certaines plateformes exposent l'API sans l'autoriser : sans conséquence.
  }
}

export function notificationsDisponibles() {
  return 'Notification' in window && 'serviceWorker' in navigator
}

export function permissionNotifications() {
  return notificationsDisponibles() ? Notification.permission : 'unsupported'
}

export async function demanderPermissionNotifications() {
  if (!notificationsDisponibles()) return 'unsupported'
  return Notification.requestPermission()
}

function dejaNotifiees() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLE_DEJA_NOTIFIE) || '[]'))
  } catch {
    return new Set()
  }
}

function memoriserNotifiees(cles) {
  localStorage.setItem(CLE_DEJA_NOTIFIE, JSON.stringify([...cles].slice(-200)))
}

/**
 * Notifie les échéances passées en « urgent » ou « retard » depuis la
 * dernière ouverture. La clé inclut le statut : une échéance déjà signalée
 * comme urgente est re-signalée si elle bascule en retard.
 */
export async function notifierNouvellesEcheances(echeances) {
  if (permissionNotifications() !== 'granted') return 0

  const connues = dejaNotifiees()
  const nouvelles = echeances.filter((e) => estAlerte(e) && !connues.has(`${e.id}:${e.statut}`))
  if (nouvelles.length === 0) return 0

  const registration = await navigator.serviceWorker.ready

  if (nouvelles.length === 1) {
    const [echeance] = nouvelles
    await registration.showNotification('Soin à prévoir', {
      body: `${echeance.cheval_nom} — ${echeance.type} ${
        echeance.statut === 'retard' ? 'en retard' : 'cette semaine'
      }`,
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      tag: `echeance-${echeance.id}`,
      data: { url: `/chevaux/${echeance.cheval_id}?onglet=soins` },
    })
  } else {
    await registration.showNotification(`${nouvelles.length} soins à prévoir`, {
      body: nouvelles
        .slice(0, 4)
        .map((e) => `${e.cheval_nom} — ${e.type}`)
        .join('\n'),
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      tag: 'echeances',
      data: { url: '/' },
    })
  }

  nouvelles.forEach((e) => connues.add(`${e.id}:${e.statut}`))
  memoriserNotifiees(connues)
  return nouvelles.length
}

/** Le bandeau se masque pour la journée, pas définitivement. */
export function bandeauMasqueAujourdhui(cleDuJour) {
  return localStorage.getItem(CLE_BANDEAU_MASQUE) === cleDuJour
}

export function masquerBandeau(cleDuJour) {
  localStorage.setItem(CLE_BANDEAU_MASQUE, cleDuJour)
}

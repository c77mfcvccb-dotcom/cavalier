// Service worker minimal : il ne met rien en cache (l'application doit rester
// à jour à chaque visite), il sert uniquement à afficher les notifications
// locales de rappel et à rendre la PWA installable.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evenement) => evenement.waitUntil(self.clients.claim()))

// Un gestionnaire fetch passe-plat : requis pour l'installabilité, sans cache.
self.addEventListener('fetch', () => {})

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close()
  const cible = evenement.notification.data?.url || '/'

  evenement.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if ('focus' in fenetre) {
          fenetre.navigate?.(cible)
          return fenetre.focus()
        }
      }
      return self.clients.openWindow(cible)
    })
  )
})

import { useEffect, useState } from 'react'
import Icone from './Icone'

/** Date du dernier « plus tard », pour ne pas insister à chaque visite. */
const CLE_MASQUE = 'licol.pwa-masque'
const JOURS_AVANT_RAPPEL = 30

function dejaInstallee() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function recemmentMasquee() {
  const brut = localStorage.getItem(CLE_MASQUE)
  if (!brut) return false
  const jours = (Date.now() - Number(brut)) / (1000 * 60 * 60 * 24)
  return jours < JOURS_AVANT_RAPPEL
}

function estIOS() {
  const ua = window.navigator.userAgent
  // iPadOS se présente comme un Mac depuis iOS 13 : seul le multi-touch,
  // absent d'un vrai Mac, permet encore de le distinguer.
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/**
 * Bandeau « Ajouter à l'écran d'accueil ». Deux mécaniques bien distinctes
 * derrière un même bandeau :
 * - Android/Chrome déclenche l'événement `beforeinstallprompt`, intercepté
 *   ici pour l'afficher à notre façon plutôt qu'au moment choisi par le
 *   navigateur, et rejoué au clic sur « Installer ».
 * - iOS Safari n'a pas cet événement : l'installation ne se fait que depuis
 *   le bouton Partager du navigateur, donc le bandeau se contente de guider.
 */
export default function InstallationPWA() {
  const [evenementDiffere, setEvenementDiffere] = useState(null)
  const [visible, setVisible] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (dejaInstallee() || recemmentMasquee()) return

    if (estIOS()) {
      setIos(true)
      setVisible(true)
      return
    }

    function surPropose(evenement) {
      // Sans ce blocage, Chrome afficherait sa propre mini-infobar en plus
      // de la nôtre — deux invites pour la même action.
      evenement.preventDefault()
      setEvenementDiffere(evenement)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', surPropose)
    return () => window.removeEventListener('beforeinstallprompt', surPropose)
  }, [])

  if (!visible) return null

  function masquer() {
    localStorage.setItem(CLE_MASQUE, String(Date.now()))
    setVisible(false)
  }

  async function installer() {
    if (!evenementDiffere) return
    evenementDiffere.prompt()
    // Ne sert qu'une fois : Chrome invalide l'événement après ce choix.
    await evenementDiffere.userChoice
    setEvenementDiffere(null)
    setVisible(false)
  }

  return (
    <div className="bandeau-rappel pwa">
      <div className="rangee" style={{ alignItems: 'flex-start' }}>
        <Icone nom="telecharger" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gras">Installer Licol</div>
          <div className="doux" style={{ fontSize: '0.82rem' }}>
            {ios
              ? "Depuis Safari : bouton Partager, puis « Sur l'écran d'accueil »."
              : "Accès rapide depuis l'écran d'accueil, sans passer par le navigateur."}
          </div>
        </div>
        <button className="bouton fantome petit" onClick={masquer} aria-label="Masquer">
          ✕
        </button>
      </div>

      {!ios && (
        <div className="rangee" style={{ marginTop: 10 }}>
          <button className="bouton petit" onClick={installer}>
            Installer
          </button>
        </div>
      )}
    </div>
  )
}

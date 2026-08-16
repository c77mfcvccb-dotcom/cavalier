import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { initiales } from '../lib/format'

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="chargement">
      <div className="pile" style={{ alignItems: 'center', gap: 12 }}>
        <div className="rotation" />
        <span className="doux">{texte}</span>
      </div>
    </div>
  )
}

export function EtatVide({ emoji = '🐴', titre, texte, action }) {
  return (
    <div className="etat-vide">
      <span className="emoji">{emoji}</span>
      {titre && <h3 style={{ marginBottom: 6 }}>{titre}</h3>}
      {texte && <p>{texte}</p>}
      {action}
    </div>
  )
}

export function Erreur({ children }) {
  if (!children) return null
  return <div className="erreur">{children}</div>
}

export function Succes({ children }) {
  if (!children) return null
  return <div className="succes">{children}</div>
}

export function Avatar({ profil, taille = 'normal' }) {
  const classe = `avatar${taille === 'grand' ? ' grand' : ''}`
  if (profil?.photo_url) {
    return <img className={classe} src={profil.photo_url} alt={profil.nom || ''} />
  }
  return <div className={classe}>{initiales(profil?.nom)}</div>
}

export function PhotoCheval({ cheval, grande = false }) {
  const classe = `photo-cheval${grande ? ' grande' : ''}`
  if (cheval?.photo_url) {
    return <img className={classe} src={cheval.photo_url} alt={cheval.nom} />
  }
  return <div className={`${classe} vide`}>🐴</div>
}

/** Feuille modale qui remonte du bas — le réflexe mobile pour les formulaires. */
export function Feuille({ titre, ouverte, onFermer, children }) {
  useEffect(() => {
    if (!ouverte) return
    const precedent = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const surEchap = (e) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', surEchap)
    return () => {
      document.body.style.overflow = precedent
      window.removeEventListener('keydown', surEchap)
    }
  }, [ouverte, onFermer])

  if (!ouverte) return null

  // Rendue dans <body> par un portail, et non là où le composant est
  // appelé. Sans cela, un ancêtre portant `backdrop-filter`, `transform`
  // ou `filter` devient le bloc conteneur des descendants en
  // `position: fixed` : la feuille se retrouve enfermée dans l'en-tête,
  // haut de 80 px, et sort de l'écran. C'est ce qui est arrivé à la
  // cloche, dont la feuille est appelée depuis <Entete>.
  return createPortal(
    <div className="voile" onClick={onFermer}>
      <div className="feuille" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="poignee" />
        {titre && <h2>{titre}</h2>}
        {children}
      </div>
    </div>,
    document.body
  )
}

export function Champ({ label, aide, children }) {
  return (
    <div className="champ">
      {label && <label>{label}</label>}
      {children}
      {aide && <span className="aide">{aide}</span>}
    </div>
  )
}

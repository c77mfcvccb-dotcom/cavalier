import { Link } from 'react-router-dom'
import { Entete } from './Mise'
import { DERNIERE_MAJ, mentionsIncompletes } from '../lib/legal'

/**
 * Habillage commun aux trois pages légales.
 *
 * Ces pages sont accessibles **sans compte** : elles doivent l'être pour un
 * visiteur qui hésite à s'inscrire, comme pour un abonné qui cherche à
 * résilier. D'où le lien de retour vers l'accueil plutôt que le bouton
 * « ‹ » de l'en-tête, qui ne mène nulle part quand on arrive par un lien
 * direct ou un favori.
 */
export default function PageLegale({ titre, children }) {
  return (
    <>
      <Entete titre={titre} />

      <main className="contenu texte-legal">
        {mentionsIncompletes && (
          <div className="erreur" style={{ marginBottom: 18 }}>
            <strong>Document incomplet.</strong> Certaines coordonnées
            obligatoires ne sont pas renseignées&nbsp;: complétez
            <code> src/lib/legal.js </code> avant toute mise en ligne.
          </div>
        )}

        {children}

        <p className="aide" style={{ marginTop: 28 }}>
          Dernière mise à jour&nbsp;: {DERNIERE_MAJ}.
        </p>

        <nav className="liens-legaux" style={{ marginTop: 18 }}>
          <Link to="/cgv">CGV / CGU</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/">Retour à l’application</Link>
        </nav>
      </main>
    </>
  )
}

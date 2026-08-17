import { Component } from 'react'
import { Link } from 'react-router-dom'

/**
 * Filet de sécurité autour des écrans.
 *
 * Sans lui, une erreur de rendu — un libellé manquant, une donnée d'une forme
 * inattendue — démonte l'arbre React entier : l'application devient une page
 * blanche, sans un mot, y compris sur les écrans qui n'ont rien à voir. C'est
 * ce qui s'est produit dans l'onglet Soins. La cause a été corrigée, mais le
 * mode de défaillance, lui, méritait d'être borné.
 *
 * React n'offre ce mécanisme qu'aux composants de classe : c'est la seule de
 * l'application, et c'est pour cette raison.
 */
export default class LimiteErreur extends Component {
  state = { erreur: null }

  static getDerivedStateFromError(erreur) {
    return { erreur }
  }

  componentDidCatch(erreur, infos) {
    // Le détail part dans la console : c'est ce qui rend un rapport
    // d'utilisateur exploitable.
    console.error('Écran en échec', erreur, infos?.componentStack)
  }

  render() {
    if (!this.state.erreur) return this.props.children

    return (
      <div className="ecran-auth">
        <div className="carte">
          <h2>Cet écran n’a pas pu s’afficher</h2>
          <p className="doux" style={{ marginTop: 10 }}>
            Le reste de l’application fonctionne. Vos données ne sont pas
            touchées : rien n’est enregistré depuis cet écran.
          </p>
          <p className="aide" style={{ marginTop: 10 }}>
            {String(this.state.erreur?.message || this.state.erreur)}
          </p>
        </div>

        <div className="pile" style={{ marginTop: 16 }}>
          <button className="bouton pleine-largeur" onClick={() => window.location.reload()}>
            Recharger
          </button>
          <Link to="/" className="bouton secondaire pleine-largeur">
            Retour à l’accueil
          </Link>
        </div>
      </div>
    )
  }
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Feuille } from './Ui'
import { estResilie, JOURS_ESSAI, libelleStatut, lienGestion, OFFRES } from '../lib/abonnement'
import { formatDate } from '../lib/format'

/**
 * État de l'abonnement et accès à la résiliation, depuis le profil.
 *
 * La résiliation elle-même n'a pas lieu ici : l'abonnement vit chez
 * RevenueCat, et rien dans Supabase ne peut l'interrompre. Le bouton ouvre
 * donc le portail client, seul endroit qui fasse foi. Le statut affiché ici
 * suit ensuite, via le webhook.
 */
export default function BlocAbonnement() {
  const { abonnement, estPremium } = useAuth()
  const [confirmation, setConfirmation] = useState(false)

  const url = lienGestion(abonnement)
  const resilie = estResilie(abonnement)

  if (!estPremium) {
    return (
      <Link to="/premium" className="bouton pleine-largeur" style={{ marginTop: 22 }}>
        Passer en Premium — {JOURS_ESSAI} jours offerts
      </Link>
    )
  }

  return (
    <section style={{ marginTop: 22 }}>
      <div className="titre-section">
        <h2>Abonnement</h2>
      </div>

      <div className="carte">
        <dl className="tableau-infos">
          <dt>Formule</dt>
          <dd>{OFFRES[abonnement?.produit]?.libelle || 'Premium'}</dd>
          <dt>Statut</dt>
          <dd>{libelleStatut(abonnement)}</dd>
          {abonnement?.expire_le && (
            <>
              <dt>{resilie ? 'Accès jusqu’au' : 'Prochain paiement'}</dt>
              <dd>{formatDate(abonnement.expire_le)}</dd>
            </>
          )}
        </dl>

        {resilie ? (
          <p className="aide" style={{ marginTop: 12 }}>
            Votre abonnement ne sera pas renouvelé. Vous gardez l'accès complet
            jusqu'à cette date, puis le compte repasse au plan gratuit sans rien
            perdre de vos données.
          </p>
        ) : (
          <button
            className="bouton danger pleine-largeur"
            style={{ marginTop: 14 }}
            onClick={() => setConfirmation(true)}
          >
            Résilier mon abonnement
          </button>
        )}
      </div>

      <Feuille
        titre="Résilier l'abonnement"
        ouverte={confirmation}
        onFermer={() => setConfirmation(false)}
      >
        <p className="doux" style={{ marginBottom: 14 }}>
          Vous gardez l'accès à Licol Premium jusqu'au{' '}
          <span className="gras">{formatDate(abonnement?.expire_le)}</span>. Passé
          cette date, le compte repasse au plan gratuit : vos chevaux, séances et
          soins restent enregistrés, mais le carnet de santé et le calendrier
          au-delà de la semaine redeviennent inaccessibles.
        </p>

        <div className="pile">
          {url ? (
            <a className="bouton danger" href={url} target="_blank" rel="noopener noreferrer">
              Continuer vers la résiliation
            </a>
          ) : (
            <div className="carte doux" style={{ fontSize: '0.87rem' }}>
              Le lien de gestion n'est pas encore disponible pour votre compte.
              Il figure dans l'email de confirmation d'abonnement, ainsi que
              dans chaque email de renouvellement.
            </div>
          )}

          <button className="bouton fantome" onClick={() => setConfirmation(false)}>
            Garder mon abonnement
          </button>
        </div>

        <p className="aide" style={{ marginTop: 12 }}>
          La résiliation se fait sur la page sécurisée de notre prestataire de
          paiement. Le statut se met à jour ici dans la foulée.
        </p>
      </Feuille>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Entete } from '../composants/Mise'
import { Erreur, Succes } from '../composants/Ui'
import { AVANTAGES_PREMIUM, JOURS_ESSAI, OFFRES } from '../lib/abonnement'
import { formatDate } from '../lib/format'

const LIEN_ACHAT = import.meta.env.VITE_REVENUECAT_LIEN_ACHAT

/** Raison de l'arrivée sur cet écran, pour un message adapté. */
const MOTIFS = {
  chevaux: 'Le plan gratuit est limité à un cheval.',
  soins: 'Le carnet de santé fait partie de Licol Premium.',
  calendrier: 'En gratuit, le calendrier s’arrête au dimanche de la semaine en cours.',
  depenses: 'Le suivi des dépenses fait partie de Licol Premium.',
}

export default function Premium() {
  const { utilisateur, abonnement, estPremium, rafraichirAbonnement } = useAuth()
  const [parametres] = useSearchParams()
  const [offreChoisie, setOffreChoisie] = useState('premium_annuel')
  const [attenteWebhook, setAttenteWebhook] = useState(false)

  const motif = MOTIFS[parametres.get('motif')]
  const retourAchat = parametres.get('achat') === 'ok'
  const sondage = useRef(null)

  /**
   * Au retour du paiement, l'abonnement n'est pas encore en base : il arrive
   * par le webhook RevenueCat, avec quelques secondes de décalage. On
   * interroge donc la base une dizaine de fois avant d'abandonner.
   */
  useEffect(() => {
    if (!retourAchat || estPremium) return

    setAttenteWebhook(true)
    let essais = 0
    sondage.current = setInterval(async () => {
      essais += 1
      await rafraichirAbonnement()
      if (essais >= 10) {
        clearInterval(sondage.current)
        setAttenteWebhook(false)
      }
    }, 3000)

    return () => clearInterval(sondage.current)
  }, [retourAchat, estPremium, rafraichirAbonnement])

  useEffect(() => {
    if (estPremium && sondage.current) {
      clearInterval(sondage.current)
      setAttenteWebhook(false)
    }
  }, [estPremium])

  function souscrire() {
    if (!LIEN_ACHAT) return
    // RevenueCat rattache l'achat au compte via app_user_id : il doit être
    // l'identifiant Supabase, sinon le webhook ne saura pas qui créditer.
    const url = new URL(LIEN_ACHAT)
    url.searchParams.set('app_user_id', utilisateur.id)
    url.searchParams.set('email', utilisateur.email ?? '')
    window.location.href = url.toString()
  }

  if (estPremium) {
    return (
      <>
        <Entete titre="Licol Premium" retour />
        <main className="contenu">
          <Succes>Votre abonnement est actif.</Succes>

          <div className="carte">
            <dl className="tableau-infos">
              <dt>Formule</dt>
              <dd>{OFFRES[abonnement?.produit]?.libelle || '—'}</dd>
              <dt>Statut</dt>
              <dd>{abonnement?.statut === 'essai' ? `Essai ${JOURS_ESSAI} jours` : 'Actif'}</dd>
              {abonnement?.expire_le && (
                <>
                  <dt>{abonnement.statut === 'annule' ? 'Se termine le' : 'Renouvellement'}</dt>
                  <dd>{formatDate(abonnement.expire_le)}</dd>
                </>
              )}
            </dl>
          </div>

          <p className="aide" style={{ marginTop: 16 }}>
            La gestion et la résiliation de l'abonnement se font depuis l'email de
            confirmation reçu à la souscription.
          </p>
        </main>
      </>
    )
  }

  return (
    <>
      <Entete titre="Licol Premium" retour />

      <main className="contenu">
        {motif && <div className="carte" style={{ marginBottom: 18 }}>{motif}</div>}

        {attenteWebhook && (
          <div className="carte centre doux" style={{ marginBottom: 18 }}>
            Paiement enregistré, activation en cours…
          </div>
        )}

        {retourAchat && !attenteWebhook && !estPremium && (
          <Erreur>
            L'activation prend plus de temps que prévu. Fermez et rouvrez
            l'application dans quelques minutes ; si rien ne change, écrivez-nous.
          </Erreur>
        )}

        <section style={{ marginBottom: 22 }}>
          <div className="liste">
            {AVANTAGES_PREMIUM.map((avantage) => (
              <div key={avantage.titre} className="element">
                <span style={{ fontSize: '1.4rem' }}>{avantage.emoji}</span>
                <div className="corps">
                  <div className="titre">{avantage.titre}</div>
                  <div className="meta">{avantage.texte}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="choix-compte">
          {Object.entries(OFFRES).map(([cle, offre]) => (
            <button
              key={cle}
              type="button"
              className={offreChoisie === cle ? 'actif' : undefined}
              onClick={() => setOffreChoisie(cle)}
            >
              <span style={{ flex: 1 }}>
                <span className="titre">
                  {offre.libelle}
                  {offre.recommande && (
                    <span className="badge" style={{ marginLeft: 8 }}>Le plus choisi</span>
                  )}
                </span>
                <span className="desc">{offre.detail}</span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className="gras" style={{ display: 'block' }}>{offre.prix}</span>
                <span className="doux" style={{ fontSize: '0.76rem' }}>{offre.periode}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          className="bouton pleine-largeur"
          style={{ marginTop: 18 }}
          onClick={souscrire}
          disabled={!LIEN_ACHAT}
        >
          Commencer l'essai de {JOURS_ESSAI} jours
        </button>

        {!LIEN_ACHAT && (
          <p className="aide" style={{ marginTop: 10, color: 'var(--rouge)' }}>
            Lien d'achat non configuré : renseignez VITE_REVENUECAT_LIEN_ACHAT.
          </p>
        )}

        <p className="aide centre" style={{ marginTop: 12 }}>
          {JOURS_ESSAI} jours gratuits, puis {OFFRES[offreChoisie].prix}{' '}
          {OFFRES[offreChoisie].periode}. Résiliable à tout moment pendant l'essai.
        </p>
      </main>
    </>
  )
}

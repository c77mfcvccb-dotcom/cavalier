import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { Entete } from '../composants/Mise'
import { Chargement, Erreur, Succes } from '../composants/Ui'
import BlocAbonnement from '../composants/BlocAbonnement'
import {
  AVANTAGES_PREMIUM,
  decrireOffre,
  estResilie,
  JOURS_ESSAI,
  OFFRES,
  trierOffres,
} from '../lib/abonnement'
import {
  acheter,
  aDroitPremium,
  chargerOffre,
  EN_BAC_A_SABLE,
  estAnnulationClient,
  estDejaAbonne,
  infosClient,
} from '../lib/revenuecat'
import { VERSION_CGV } from '../lib/legal'

/** Raison de l'arrivée sur cet écran, pour un message adapté. */
const MOTIFS = {
  chevaux:
    'Le plan gratuit est limité à un cheval, qu’il soit créé ou rejoint avec un code de partage.',
  soins: 'Le carnet de santé fait partie de Licol Premium.',
  calendrier: 'En gratuit, le calendrier s’arrête au dimanche de la semaine en cours.',
  depenses: 'Le suivi des dépenses fait partie de Licol Premium.',
}

/** Sondage de la base après paiement : 10 essais espacés de 3 s. */
const ESSAIS_WEBHOOK = 10
const DELAI_WEBHOOK = 3000

/**
 * Repli affiché si le catalogue RevenueCat n'a pas pu être chargé : les prix
 * codés en dur, pour ne pas présenter une page vide. Le bouton d'achat, lui,
 * reste désactivé — sans package, il n'y a rien à acheter.
 */
const OFFRES_REPLI = Object.entries(OFFRES).map(([cle, offre]) => ({
  ...offre,
  cle,
  paquet: null,
  joursEssai: JOURS_ESSAI,
}))

export default function Premium() {
  const { utilisateur, abonnement, estPremium, rafraichirAbonnement } = useAuth()
  const [parametres] = useSearchParams()

  const [offres, setOffres] = useState(null)
  const [chargementOffres, setChargementOffres] = useState(true)
  const [erreurCatalogue, setErreurCatalogue] = useState(null)

  const [choix, setChoix] = useState(null)
  const [cgvAcceptees, setCgvAcceptees] = useState(false)
  const [achatEnCours, setAchatEnCours] = useState(false)
  const [erreurAchat, setErreurAchat] = useState(null)

  const [attenteWebhook, setAttenteWebhook] = useState(false)
  const [webhookAbandonne, setWebhookAbandonne] = useState(false)
  const [droitRevenueCat, setDroitRevenueCat] = useState(false)

  const motif = MOTIFS[parametres.get('motif')]
  // Ancien parcours par redirection : des liens peuvent encore traîner dans
  // des emails de RevenueCat. On continue de les accueillir.
  const retourAchat = parametres.get('achat') === 'ok'
  const sondage = useRef(null)

  /**
   * Après l'encaissement, l'accès n'est pas encore ouvert : il le sera quand
   * le webhook aura écrit dans `abonnements`, seule table que consultent les
   * politiques RLS. Quelques secondes, en général. On interroge la base
   * plutôt que de croire le SDK sur parole, parce que c'est la base qui
   * décidera à la requête suivante.
   */
  const attendreWebhook = useCallback(() => {
    if (sondage.current) return
    setAttenteWebhook(true)
    setWebhookAbandonne(false)

    let essais = 0
    sondage.current = setInterval(async () => {
      essais += 1
      await rafraichirAbonnement()
      if (essais >= ESSAIS_WEBHOOK) {
        clearInterval(sondage.current)
        sondage.current = null
        setAttenteWebhook(false)
        setWebhookAbandonne(true)
      }
    }, DELAI_WEBHOOK)
  }, [rafraichirAbonnement])

  // Le sondage s'arrête de lui-même dès que l'abonnement est en base.
  useEffect(() => {
    if (estPremium && sondage.current) {
      clearInterval(sondage.current)
      sondage.current = null
      setAttenteWebhook(false)
      setWebhookAbandonne(false)
    }
  }, [estPremium])

  useEffect(() => () => clearInterval(sondage.current), [])

  useEffect(() => {
    if (retourAchat && !estPremium) attendreWebhook()
  }, [retourAchat, estPremium, attendreWebhook])

  /** Catalogue RevenueCat : prix réels, devise du visiteur, essai configuré. */
  useEffect(() => {
    if (!utilisateur || estPremium) return
    let abandonne = false

    setChargementOffres(true)
    chargerOffre(utilisateur.id)
      .then((offering) => {
        if (abandonne) return
        const paquets = trierOffres(offering?.availablePackages ?? []).map(decrireOffre)
        if (!paquets.length) throw new Error('Offering « default » vide')
        setOffres(paquets)
        setChoix((precedent) => precedent ?? paquets[paquets.length - 1].cle)
        setErreurCatalogue(null)
      })
      .catch((erreur) => {
        if (abandonne) return
        console.error('Catalogue RevenueCat indisponible', erreur)
        setOffres(OFFRES_REPLI)
        setChoix((precedent) => precedent ?? OFFRES_REPLI[OFFRES_REPLI.length - 1].cle)
        setErreurCatalogue(
          'Les formules n’ont pas pu être chargées. Vérifiez votre connexion, puis rouvrez cet écran.'
        )
      })
      .finally(() => {
        if (!abandonne) setChargementOffres(false)
      })

    return () => {
      abandonne = true
    }
  }, [utilisateur, estPremium])

  const offreChoisie = offres?.find((offre) => offre.cle === choix) ?? offres?.[0] ?? null

  async function souscrire() {
    if (!offreChoisie?.paquet || achatEnCours) return
    if (!cgvAcceptees) {
      setErreurAchat('Vous devez accepter les conditions générales avant de payer.')
      return
    }

    setErreurAchat(null)
    setAchatEnCours(true)
    try {
      const { customerInfo } = await acheter({
        idUtilisateur: utilisateur.id,
        paquet: offreChoisie.paquet,
        email: utilisateur.email,
        // Trace de l'acceptation, attachée à la transaction elle-même :
        // c'est la preuve la moins contestable, puisqu'elle est horodatée
        // par le prestataire de paiement et non par nous.
        acceptationCgv: VERSION_CGV,
      })
      setDroitRevenueCat(aDroitPremium(customerInfo))
      attendreWebhook()
    } catch (erreur) {
      // Fermer la fenêtre de paiement n'est pas un incident.
      if (await estAnnulationClient(erreur)) return

      // Déjà abonné ailleurs (autre onglet, achat rejoué) : l'accès viendra
      // du webhook, il n'y a rien à réparer côté cavalier.
      if (await estDejaAbonne(erreur)) {
        setDroitRevenueCat(true)
        attendreWebhook()
        return
      }

      console.error('Achat RevenueCat impossible', erreur)
      setErreurAchat(
        erreur?.message ||
          'Le paiement n’a pas pu aboutir. Réessayez dans un instant ; rien n’a été débité.'
      )
    } finally {
      setAchatEnCours(false)
    }
  }

  /** Dernier recours : redemander l'état à RevenueCat, puis relancer l'attente. */
  async function reverifier() {
    setWebhookAbandonne(false)
    try {
      const infos = await infosClient(utilisateur.id)
      setDroitRevenueCat(aDroitPremium(infos))
    } catch (erreur) {
      console.error('Statut RevenueCat illisible', erreur)
    }
    await rafraichirAbonnement()
    attendreWebhook()
  }

  if (estPremium) {
    return (
      <>
        <Entete titre="Licol Premium" retour />
        <main className="contenu">
          <Succes>
            {estResilie(abonnement)
              ? 'Abonnement résilié — vous en gardez le bénéfice jusqu’à l’échéance.'
              : 'Votre abonnement est actif.'}
          </Succes>

          <BlocAbonnement />
        </main>
      </>
    )
  }

  const joursEssaiAffiches = offreChoisie?.joursEssai ?? JOURS_ESSAI

  return (
    <>
      <Entete titre="Licol Premium" retour />

      <main className="contenu">
        {motif && <div className="carte" style={{ marginBottom: 18 }}>{motif}</div>}

        {EN_BAC_A_SABLE && (
          <div className="carte doux" style={{ marginBottom: 18, fontSize: '0.85rem' }}>
            🧪 Mode bac à sable RevenueCat : aucun paiement réel n’est encaissé.
          </div>
        )}

        {attenteWebhook && (
          <div className="carte centre doux" style={{ marginBottom: 18 }}>
            Paiement enregistré, activation en cours…
          </div>
        )}

        {webhookAbandonne && (
          <div style={{ marginBottom: 18 }}>
            <Erreur>
              {droitRevenueCat
                ? 'Votre paiement est bien enregistré chez notre prestataire, mais l’activation tarde à nous parvenir. Rien n’est perdu.'
                : 'L’activation prend plus de temps que prévu.'}
            </Erreur>
            <button className="bouton fantome pleine-largeur" onClick={reverifier}>
              Vérifier à nouveau
            </button>
            <p className="aide" style={{ marginTop: 8 }}>
              Si rien ne change d’ici quelques minutes, écrivez-nous : le
              paiement est tracé de leur côté, l’accès sera rétabli sans
              nouvelle dépense.
            </p>
          </div>
        )}

        {erreurAchat && <Erreur>{erreurAchat}</Erreur>}
        {erreurCatalogue && <Erreur>{erreurCatalogue}</Erreur>}

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

        {chargementOffres ? (
          <Chargement texte="Chargement des formules…" />
        ) : (
          <div className="choix-compte">
            {offres?.map((offre) => (
              <button
                key={offre.cle}
                type="button"
                className={offreChoisie?.cle === offre.cle ? 'actif' : undefined}
                onClick={() => setChoix(offre.cle)}
              >
                <span style={{ flex: 1 }}>
                  <span className="titre">
                    {offre.libelle}
                    {offre.miseEnAvant && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        {offre.miseEnAvant}
                      </span>
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
        )}

        {/* Acceptation demandée une seconde fois, juste avant le paiement :
            c'est ici que l'utilisateur a le tarif et la reconduction sous les
            yeux, ce qui n'était pas le cas au moment de l'inscription. */}
        <label className="case-acceptation" style={{ marginTop: 18 }}>
          <input
            type="checkbox"
            checked={cgvAcceptees}
            onChange={(e) => setCgvAcceptees(e.target.checked)}
          />
          <span>
            J’accepte les{' '}
            <Link to="/cgv" target="_blank" rel="noopener noreferrer">
              conditions générales de vente
            </Link>{' '}
            et je demande l’accès immédiat au service. Je suis informé que
            l’abonnement se reconduit automatiquement à l’issue de l’essai, et
            qu’il reste résiliable à tout moment depuis mon profil.
          </span>
        </label>

        <button
          className="bouton pleine-largeur"
          style={{ marginTop: 14 }}
          onClick={souscrire}
          disabled={
            !offreChoisie?.paquet || !cgvAcceptees || achatEnCours || attenteWebhook
          }
        >
          {achatEnCours
            ? 'Ouverture du paiement…'
            : `Commencer l'essai de ${joursEssaiAffiches} jours`}
        </button>

        {offreChoisie && (
          <p className="aide centre" style={{ marginTop: 12 }}>
            {joursEssaiAffiches} jours gratuits, puis {offreChoisie.prix}{' '}
            {offreChoisie.periode}. Résiliable à tout moment pendant l'essai.
          </p>
        )}
      </main>
    </>
  )
}

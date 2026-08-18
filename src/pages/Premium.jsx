import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
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
  REMISE_PERMANENTE,
  trierOffres,
} from '../lib/abonnement'
import {
  acheter,
  aDroitPremium,
  capacitesPaiement,
  chargerOffre,
  EN_BAC_A_SABLE,
  estAnnulationClient,
  estDejaAbonne,
  infosClient,
  presenterBoutonExpress,
} from '../lib/revenuecat'
import { VERSION_CGV } from '../lib/legal'
import CodeClub from '../composants/CodeClub'
import { accesOffert } from '../lib/club'

/** Raison de l'arrivée sur cet écran, pour un message adapté. */
const MOTIFS = {
  chevaux:
    'Le plan gratuit est limité à un cheval, qu’il soit créé ou rejoint avec un code de partage.',
  soins: 'Le carnet de santé fait partie de Licol Premium.',
  calendrier: 'En gratuit, le calendrier s’arrête au dimanche de la semaine en cours.',
  depenses: 'Le suivi des dépenses fait partie de Licol Premium.',
  documents:
    'Le plan gratuit range 10 documents par cheval — Premium en permet 50.',
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
  const { utilisateur, abonnement, estPremium, rafraichirAbonnement, estClub, adhesions } = useAuth()
  const [parametres] = useSearchParams()

  const [offres, setOffres] = useState(null)
  const [chargementOffres, setChargementOffres] = useState(true)
  const [erreurCatalogue, setErreurCatalogue] = useState(null)

  const [choix, setChoix] = useState(null)
  const [cgvAcceptees, setCgvAcceptees] = useState(false)

  // Le champ reste replié : un code promo visible d'emblée souffle à ceux
  // qui n'en ont pas qu'ils paient le prix fort, et fait quitter l'écran
  // pour aller en chercher un.
  const [champCodeOuvert, setChampCodeOuvert] = useState(false)
  const [codeSaisi, setCodeSaisi] = useState('')
  const [codeApplique, setCodeApplique] = useState(null)
  const [etatCode, setEtatCode] = useState('repos')
  const [achatEnCours, setAchatEnCours] = useState(false)
  const [erreurAchat, setErreurAchat] = useState(null)

  const [attenteWebhook, setAttenteWebhook] = useState(false)
  const [webhookAbandonne, setWebhookAbandonne] = useState(false)
  const [droitRevenueCat, setDroitRevenueCat] = useState(false)

  // Paiement en un geste (Apple Pay / Google Pay). `null` tant que le SDK
  // n'a pas répondu : « pas encore su » et « indisponible » n'appellent pas
  // le même affichage.
  const cibleExpress = useRef(null)
  const majExpress = useRef(null)
  const expressMonte = useRef(false)
  const expressPret = useRef(false)
  const [portefeuillesDispos, setPortefeuillesDispos] = useState(null)
  const [cycleExpress, setCycleExpress] = useState(0)

  const motif = MOTIFS[parametres.get('motif')]
  // Ancien parcours par redirection : des liens peuvent encore traîner dans
  // des emails de RevenueCat. On continue de les accueillir.
  const retourAchat = parametres.get('achat') === 'ok'
  /** `?diag=1` : révèle le verdict du SDK sur les portefeuilles. */
  const diagnostic = parametres.get('diag') === '1'
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

  /**
   * Catalogue RevenueCat : prix réels, devise du visiteur, essai configuré,
   * et remises si un code promo est transmis.
   *
   * Renvoie les offres plutôt que de se contenter de les poser dans l'état,
   * pour que la vérification d'un code puisse juger du résultat.
   */
  const chargerCatalogue = useCallback(
    async (codePromo = null) => {
      const offering = await chargerOffre(utilisateur.id, codePromo)
      const paquets = trierOffres(offering?.availablePackages ?? []).map(decrireOffre)
      if (!paquets.length) throw new Error('Offering « default » vide')
      return paquets
    },
    [utilisateur]
  )

  useEffect(() => {
    if (!utilisateur || estPremium) return
    let abandonne = false

    setChargementOffres(true)
    chargerCatalogue()
      .then((paquets) => {
        if (abandonne) return
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
  }, [utilisateur, estPremium, chargerCatalogue])

  /**
   * Vérifie un code en redemandant le catalogue avec lui.
   *
   * C'est RevenueCat qui tranche, pas nous : si aucune formule ne revient
   * avec une remise, le code est refusé — qu'il soit inexistant, expiré, ou
   * simplement inapplicable à ces produits. Le distinguer plus finement
   * demanderait une API que le SDK n'expose pas, et le message resterait le
   * même pour le cavalier.
   */
  async function appliquerCode() {
    const code = codeSaisi.trim().toUpperCase()
    if (!code) return

    setEtatCode('verification')
    try {
      const paquets = await chargerCatalogue(code)
      if (!paquets.some((offre) => offre.remise)) {
        setEtatCode('invalide')
        return
      }
      setOffres(paquets)
      setCodeApplique(code)
      setEtatCode('applique')
    } catch (erreur) {
      // Un code refusé peut aussi remonter en erreur de requête selon la
      // réponse du backend : on ne peut pas l'imputer au réseau sans plus
      // d'information, et annoncer une panne serait pire qu'un code refusé.
      console.error('Vérification du code promo impossible', erreur)
      setEtatCode('invalide')
    }
  }

  async function retirerCode() {
    setCodeSaisi('')
    setCodeApplique(null)
    setEtatCode('repos')
    try {
      setOffres(await chargerCatalogue())
    } catch (erreur) {
      console.error('Rechargement du catalogue impossible', erreur)
    }
  }

  const offreChoisie = offres?.find((offre) => offre.cle === choix) ?? offres?.[0] ?? null
  const paquetChoisi = offreChoisie?.paquet ?? null

  /** Suite commune aux deux chemins de paiement : tunnel classique et bouton express. */
  const apresPaiement = useCallback(
    (customerInfo) => {
      setDroitRevenueCat(aDroitPremium(customerInfo))
      attendreWebhook()
    },
    [attendreWebhook]
  )

  /** Renvoie ce qui s'est passé, pour que l'appelant sache s'il doit se relancer. */
  const surEchecPaiement = useCallback(
    async (erreur) => {
      // Fermer la fenêtre de paiement n'est pas un incident.
      if (await estAnnulationClient(erreur)) return 'annule'

      // Déjà abonné ailleurs (autre onglet, achat rejoué) : l'accès viendra
      // du webhook, il n'y a rien à réparer côté cavalier.
      if (await estDejaAbonne(erreur)) {
        setDroitRevenueCat(true)
        attendreWebhook()
        return 'deja_abonne'
      }

      console.error('Paiement RevenueCat impossible', erreur)
      setErreurAchat(
        erreur?.message ||
          'Le paiement n’a pas pu aboutir. Réessayez dans un instant ; rien n’a été débité.'
      )
      return 'erreur'
    },
    [attendreWebhook]
  )

  /**
   * Montage du bouton Apple Pay / Google Pay.
   *
   * Le bouton est rendu par le SDK dans un élément à nous, une seule fois :
   * quand la formule change, on le met à jour plutôt que d'en poser un
   * second. D'où les références plutôt que de l'état — remonter le bouton à
   * chaque rendu le ferait clignoter.
   */
  useEffect(() => {
    if (estPremium) return

    // Un code promo ne passe pas par ce chemin (voir presenterBoutonExpress) :
    // le bouton disparaît, et pourra se remonter si le code est retiré.
    if (codeApplique) {
      expressMonte.current = false
      majExpress.current = null
      return
    }

    const cible = cibleExpress.current
    if (!cible || !paquetChoisi || expressMonte.current) return

    expressMonte.current = true
    presenterBoutonExpress({
      idUtilisateur: utilisateur.id,
      paquet: paquetChoisi,
      cible,
      email: utilisateur.email,
      acceptationCgv: VERSION_CGV,
      onPret: (updater, disponibles) => {
        expressPret.current = true
        majExpress.current = updater
        setPortefeuillesDispos(disponibles)
        // Trace volontairement laissée en clair : c'est le seul moyen, depuis
        // un vrai téléphone, de distinguer « domaine non déclaré » de
        // « aucune carte dans le portefeuille ».
        console.info(
          `[Licol] Apple Pay / Google Pay ${disponibles ? 'disponibles' : 'indisponibles'} sur cet appareil`
        )
      },
    })
      .then((resultat) => apresPaiement(resultat?.customerInfo))
      .catch(async (erreur) => {
        // Une même promesse porte deux échecs très différents. Avant que le
        // bouton ne soit prêt, c'est le montage qui a échoué — Stripe
        // injoignable, portefeuille non pris en charge : personne n'a rien
        // tenté, et annoncer un paiement raté serait faux. On se contente
        // alors d'effacer l'emplacement.
        if (!expressPret.current) {
          console.warn('Bouton de paiement express indisponible', erreur)
          setPortefeuillesDispos(false)
          return
        }

        // La promesse ne se résout qu'une fois. Après une feuille refermée,
        // il faut donc reposer un bouton neuf, sans quoi le second appui
        // n'aboutirait plus.
        if ((await surEchecPaiement(erreur)) === 'annule') {
          expressMonte.current = false
          expressPret.current = false
          majExpress.current = null
          cible.replaceChildren()
          setCycleExpress((tour) => tour + 1)
        }
      })
  }, [
    estPremium,
    codeApplique,
    paquetChoisi,
    utilisateur,
    apresPaiement,
    surEchecPaiement,
    cycleExpress,
  ])

  /** Changement de formule : le bouton existant vise la nouvelle. */
  useEffect(() => {
    if (majExpress.current && paquetChoisi) majExpress.current.updatePurchase(paquetChoisi)
  }, [paquetChoisi])

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
        codePromo: codeApplique,
        // Trace de l'acceptation, attachée à la transaction elle-même :
        // c'est la preuve la moins contestable, puisqu'elle est horodatée
        // par le prestataire de paiement et non par nous.
        acceptationCgv: VERSION_CGV,
      })
      apresPaiement(customerInfo)
    } catch (erreur) {
      await surEchecPaiement(erreur)
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

  /** Remise qui s'arrête un jour : le tarif plein doit alors être annoncé. */
  const remiseTemporaire =
    offreChoisie?.remise?.duree && offreChoisie.remise.duree !== REMISE_PERMANENTE

  return (
    <>
      <Entete titre="Licol Premium" retour />

      <main className="contenu">
        {motif && <div className="carte" style={{ marginBottom: 18 }}>{motif}</div>}

        {/* Sur quel compte est-on ?
            Question sans intérêt tant qu'on n'en a qu'un — et décisive dès
            qu'on en a deux. Quelqu'un qui s'abonne avec son adresse, puis se
            connecte ailleurs par « Continuer avec Google », retombe sur cet
            écran sans comprendre pourquoi : son abonnement est intact, mais
            sur l'autre compte. Sans ce rappel, le geste naturel est de
            racheter — et de payer deux fois. */}
        <p className="aide" style={{ marginBottom: 18 }}>
          Compte connecté : <strong>{utilisateur.email}</strong>. Déjà abonné
          avec une autre adresse ? L’abonnement suit le compte :{' '}
          <Link to="/profil">déconnectez-vous</Link> et reconnectez-vous avec
          celui-là plutôt que d’en reprendre un.
        </p>

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

        {/* L'alternative au paiement : le code de son écurie. Un club qui
            offre l'accès à ses membres remplace l'abonnement personnel sur
            tout son périmètre — autant le dire ICI, avant que quelqu'un ne
            paie ce que son écurie lui offre déjà. */}
        {!estClub && (
          <section style={{ marginBottom: 22 }}>
            <div className="carte">
              <p className="gras">🏇 Votre écurie est sur Licol ?</p>
              {accesOffert(adhesions) ? (
                <p className="doux" style={{ marginTop: 6 }}>
                  Votre écurie vous offre déjà l'accès complet sur ses
                  chevaux — voir <Link to="/club">Mon club</Link>.
                  L'abonnement ci-dessous ne sert que pour vos chevaux
                  personnels hors écurie.
                </p>
              ) : (
                <>
                  <p className="doux" style={{ margin: '6px 0 12px' }}>
                    Si elle offre l'accès à ses membres, son code d'adhésion
                    vous ouvre tout le suivi de ses chevaux — sans payer.
                  </p>
                  <CodeClub />
                </>
              )}
            </div>
          </section>
        )}

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
                  {/* Le prix d'origine reste affiché, barré : une remise ne
                      se comprend que rapportée à ce qu'elle remplace. */}
                  {offre.remise && (
                    <span className="prix-barre">{offre.prix}</span>
                  )}
                  <span className="gras" style={{ display: 'block' }}>
                    {offre.remise ? offre.remise.prix : offre.prix}
                  </span>
                  <span className="doux" style={{ fontSize: '0.76rem' }}>{offre.periode}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Code promo — replié par défaut, et posé après les formules :
            c'est un détour, pas une étape du parcours. */}
        <div className="code-promo">
          {!champCodeOuvert ? (
            <button
              type="button"
              className="lien-discret"
              onClick={() => setChampCodeOuvert(true)}
            >
              J’ai un code promo
            </button>
          ) : (
            <>
              <div className="saisie">
                <input
                  value={codeSaisi}
                  onChange={(e) => {
                    setCodeSaisi(e.target.value)
                    if (etatCode === 'invalide') setEtatCode('repos')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && appliquerCode()}
                  placeholder="CODE PROMO"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck="false"
                  disabled={etatCode === 'applique' || etatCode === 'verification'}
                  aria-label="Code promo"
                  aria-invalid={etatCode === 'invalide'}
                />
                {etatCode === 'applique' ? (
                  <button type="button" className="bouton fantome petit" onClick={retirerCode}>
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="bouton secondaire petit"
                    onClick={appliquerCode}
                    disabled={!codeSaisi.trim() || etatCode === 'verification'}
                  >
                    {etatCode === 'verification' ? 'Vérification…' : 'Appliquer'}
                  </button>
                )}
              </div>

              {etatCode === 'applique' && offreChoisie?.remise && (
                <p className="aide succes-code">
                  Code <span className="gras">{codeApplique}</span> appliqué —{' '}
                  {offreChoisie.remise.etiquette}
                  {offreChoisie.remise.duree ? ` sur ${offreChoisie.remise.duree}` : ''}.
                </p>
              )}

              {etatCode === 'invalide' && (
                <p className="aide erreur-code">
                  Ce code n’est pas valable, ou ne s’applique pas à cette formule.
                  Vérifiez la saisie, ou essayez l’autre formule.
                </p>
              )}
            </>
          )}
        </div>

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

        {/* Paiement en un geste : la feuille Apple ou Google s'ouvre
            directement, sans formulaire de carte. Posé AVANT le bouton
            classique, parce que c'est le chemin le plus court — mais après
            la case des CGV, qu'il ne doit pas permettre de contourner. */}
        {!codeApplique && (
          <div
            className={`paiement-express${cgvAcceptees ? '' : ' bloque'}`}
            hidden={portefeuillesDispos === false}
          >
            <div ref={cibleExpress} />
            {portefeuillesDispos && (
              <>
                {!cgvAcceptees && (
                  <p className="aide centre" style={{ marginTop: 6 }}>
                    Cochez la case ci-dessus pour payer en un geste.
                  </p>
                )}
                <div className="separateur">ou</div>
              </>
            )}
          </div>
        )}

        {/* Un code promo appliqué renvoie au tunnel classique : le bouton
            express n'a pas de quoi transporter la remise. Le dire, plutôt
            que de faire disparaître une option déjà vue. */}
        {codeApplique && portefeuillesDispos && (
          <p className="aide centre" style={{ marginTop: 14 }}>
            Apple Pay et Google Pay ne transmettent pas les codes promo :
            passez par le bouton ci-dessous pour que la remise s’applique.
          </p>
        )}

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
            {joursEssaiAffiches} jours gratuits, puis{' '}
            {/* Une remise limitée dans le temps doit dire ce qui vient
                après, sinon le deuxième prélèvement est une surprise. */}
            {remiseTemporaire ? (
              <>
                {offreChoisie.remise.prix} {offreChoisie.remise.duree}, puis{' '}
                {offreChoisie.prix} {offreChoisie.periode}
              </>
            ) : (
              <>
                {offreChoisie.remise ? offreChoisie.remise.prix : offreChoisie.prix}{' '}
                {offreChoisie.periode}
              </>
            )}
            . Résiliable à tout moment pendant l'essai.
          </p>
        )}

        {/* Diagnostic, pas message d'erreur : « indisponible » est le cas
            normal sur un appareil sans portefeuille, et l'afficher à tout le
            monde n'apprendrait rien. On le montre en bac à sable, ou sur
            demande explicite avec ?diag=1, pour pouvoir vérifier depuis un
            vrai téléphone que le domaine est bien déclaré chez Apple. */}
        {portefeuillesDispos === false && !diagnostic && EN_BAC_A_SABLE && (
          <p className="aide centre" style={{ marginTop: 12 }}>
            Apple Pay / Google Pay indisponibles sur cet appareil, ce
            navigateur, ou pour ce domaine.
          </p>
        )}

        {/* ?diag=1 — les quatre mesures qui séparent les causes possibles.
            Un bouton absent ne dit pas laquelle : l'appareil peut ne pas
            savoir faire, ou bien savoir et se heurter à un domaine déclaré
            pour l'autre mode. La réponse tient dans ce tableau. */}
        {diagnostic && <TableauDiagnostic portefeuilles={portefeuillesDispos} />}
      </main>
    </>
  )
}

/**
 * Relevé affiché sur `/premium?diag=1`.
 *
 * Quatre lignes, choisies pour être lues ensemble : la première dit dans
 * quel mode l'application encaisse, les deux suivantes ce que l'appareil
 * sait faire, la dernière le verdict de RevenueCat. Apple Pay présent sur
 * l'appareil mais portefeuilles refusés par RevenueCat désigne le domaine ou
 * le mode ; Apple Pay absent de l'appareil désigne le navigateur ou le
 * portefeuille, et rien ne se règle alors dans un tableau de bord.
 */
function TableauDiagnostic({ portefeuilles }) {
  const mesures = capacitesPaiement()

  const lignes = [
    ['Domaine', mesures.domaine],
    ['Mode d’encaissement', `${mesures.mode} (${mesures.cle})`],
    ['Apple Pay sur l’appareil', mesures.applePaySurAppareil ? 'oui' : 'non'],
    [
      'Apple Pay utilisable',
      mesures.applePayUtilisable === null ? '—' : mesures.applePayUtilisable ? 'oui' : 'non',
    ],
    ['PaymentRequest (Google Pay)', mesures.paymentRequest ? 'oui' : 'non'],
    [
      'Portefeuilles selon RevenueCat',
      portefeuilles === null ? 'pas encore répondu' : portefeuilles ? 'oui' : 'non',
    ],
  ]

  return (
    <div className="carte" style={{ marginTop: 18, fontSize: '0.82rem' }}>
      <div className="gras" style={{ marginBottom: 8 }}>Diagnostic paiement</div>
      <dl className="tableau-infos">
        {lignes.map(([libelle, valeur]) => (
          <Fragment key={libelle}>
            <dt>{libelle}</dt>
            <dd>{valeur}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="aide" style={{ marginTop: 10 }}>
        {mesures.mode === 'bac à sable'
          ? 'Le domaine doit être déclaré côté test tant que l’application encaisse en bac à sable : un enregistrement en mode live ne vaut pas pour ce mode.'
          : mesures.applePaySurAppareil && portefeuilles === false
            ? 'L’appareil sait faire Apple Pay, mais RevenueCat ne le propose pas : c’est la déclaration du domaine, pour ce mode, qu’il faut vérifier.'
            : 'Apple Pay n’est proposé que dans Safari, sur un appareil Apple, avec une carte enregistrée dans Wallet.'}
      </p>
    </div>
  )
}

import PageLegale from '../../composants/PageLegale'
import { EDITEUR, MEDIATEUR, TARIFS, valeur, VERSION_CGV } from '../../lib/legal'
import { LIMITE_CHEVAUX_GRATUIT } from '../../lib/abonnement'

/**
 * Conditions générales de vente et d'utilisation.
 *
 * Le texte couvre les deux volets d'un même contrat : l'usage du service
 * (CGU) et l'abonnement payant (CGV). Les séparer aurait obligé à faire
 * accepter deux documents pour un seul parcours.
 */
export default function Cgv() {
  return (
    <PageLegale titre="Conditions générales">
      <p className="aide">Version {VERSION_CGV}</p>

      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l’accès et l’utilisation de Licol,
        service en ligne de suivi de chevaux — planning partagé, carnet de
        séances, suivi de santé et de dépenses — édité par{' '}
        {valeur(EDITEUR.nom)}. Elles forment un contrat entre l’éditeur et
        toute personne créant un compte, ci-après « l’utilisateur ».
      </p>

      <h2>2. Acceptation</h2>
      <p>
        La création d’un compte suppose l’acceptation expresse des présentes,
        par une case à cocher distincte. Cette acceptation est enregistrée
        avec sa date et le numéro de version du document. Une seconde
        acceptation est demandée avant tout paiement, afin que nul ne
        souscrive sans avoir eu les conditions tarifaires sous les yeux.
      </p>

      <h2>3. Accès au service</h2>
      <p>
        Le service est accessible depuis un navigateur récent, et peut être
        installé sur l’écran d’accueil d’un téléphone. Il suppose une
        connexion Internet, dont le coût reste à la charge de l’utilisateur.
      </p>
      <p>
        La création d’un compte requiert un email valide et un mot de passe
        d’au moins huit caractères, ou une connexion via un compte Google.
        L’utilisateur est responsable de la confidentialité de ses
        identifiants et des actions menées depuis son compte.
      </p>
      <p>
        Le service n’est pas destiné aux personnes de moins de quinze ans sans
        l’autorisation du titulaire de l’autorité parentale.
      </p>

      <h2>4. Plan gratuit</h2>
      <p>
        Le plan gratuit est utilisable sans limite de durée. Il donne accès au
        planning de la semaine en cours, au carnet de séances, et à{' '}
        {LIMITE_CHEVAUX_GRATUIT} cheval au total — qu’il ait été créé par
        l’utilisateur ou rejoint avec un code de partage. Le carnet de santé,
        le suivi des dépenses et le calendrier au-delà du dimanche courant
        relèvent de l’abonnement Premium.
      </p>

      <h2>5. Abonnement Premium</h2>
      <dl className="tableau-infos">
        <dt>Formule mensuelle</dt>
        <dd>{TARIFS.mensuel}</dd>
        <dt>Formule annuelle</dt>
        <dd>{TARIFS.annuel}</dd>
        <dt>Essai gratuit</dt>
        <dd>{TARIFS.essaiJours} jours, sur les deux formules</dd>
      </dl>
      <p>
        Les prix sont indiqués en euros, toutes taxes comprises. Ils
        s’entendent pour un compte. L’éditeur peut les modifier&nbsp;; tout
        changement est notifié par email au moins trente jours avant sa prise
        d’effet, et l’utilisateur reste libre de résilier avant cette date,
        auquel cas le nouveau tarif ne lui est jamais appliqué.
      </p>

      <h2>6. Essai gratuit</h2>
      <p>
        L’essai dure {TARIFS.essaiJours} jours à compter de la souscription et
        donne accès à l’intégralité des fonctions Premium. Aucun montant n’est
        prélevé pendant cette période.
      </p>
      <p>
        <strong>
          À l’issue de l’essai, l’abonnement se poursuit automatiquement et le
          premier prélèvement intervient
        </strong>{' '}
        au tarif de la formule choisie, sauf résiliation avant le terme. La
        résiliation pendant l’essai est immédiate et sans frais&nbsp;: elle
        s’opère depuis <em>Profil → Abonnement</em>, dans les mêmes conditions
        qu’au paragraphe 9.
      </p>

      <h2>7. Paiement</h2>
      <p>
        Le paiement s’effectue par carte bancaire, au moment de la
        souscription puis à chaque échéance. Il est traité par RevenueCat,
        Inc. et Stripe. Les coordonnées bancaires sont saisies directement
        chez le prestataire de paiement&nbsp;: elles ne transitent ni ne sont
        conservées sur les serveurs de l’éditeur.
      </p>
      <p>
        En cas d’échec de prélèvement, l’accès Premium est maintenu jusqu’au
        terme de la période déjà réglée. L’utilisateur est invité à mettre à
        jour son moyen de paiement&nbsp;; à défaut, l’abonnement prend fin à
        l’échéance et le compte repasse au plan gratuit.
      </p>

      <h2>8. Reconduction tacite</h2>
      <p>
        L’abonnement est conclu pour la durée de la formule choisie et se
        reconduit tacitement pour une durée identique, sauf résiliation.
        Conformément à l’article L215-1 du code de la consommation, l’éditeur
        informe l’utilisateur, au plus tôt trois mois et au plus tard un mois
        avant l’échéance de reconduction, de sa faculté de ne pas reconduire.
      </p>

      <h2>9. Résiliation par l’utilisateur</h2>
      <p>
        L’abonnement est résiliable <strong>à tout moment</strong>, sans
        motif ni préavis, depuis <em>Profil → Abonnement</em>. Conformément à
        l’article L215-1-1 du code de la consommation, ce parcours est
        accessible en permanence et en quelques clics depuis l’interface du
        service, sans passer par un email ni par un service client.
      </p>
      <p>
        La résiliation met fin à la reconduction. Elle n’interrompt pas la
        période en cours&nbsp;:{' '}
        <strong>
          l’accès Premium est conservé jusqu’à l’échéance déjà payée
        </strong>
        , après quoi le compte repasse au plan gratuit. Aucun remboursement
        prorata temporis n’est dû pour la période entamée, hors exercice du
        droit de rétractation.
      </p>
      <p>
        Le retour au plan gratuit ne supprime aucune donnée. Les chevaux, les
        séances et les soins déjà enregistrés sont conservés&nbsp;; seules les
        fonctions Premium redeviennent inaccessibles, et redeviennent
        disponibles telles quelles en cas de réabonnement.
      </p>

      <h2>10. Droit de rétractation</h2>
      <p>
        Le consommateur dispose de quatorze jours à compter de la conclusion
        du contrat pour se rétracter sans avoir à motiver sa décision
        (article L221-18 du code de la consommation). Il suffit d’en informer
        l’éditeur par une déclaration dénuée d’ambiguïté, à l’adresse{' '}
        <strong>{valeur(EDITEUR.email)}</strong>.
      </p>
      <p>
        En demandant l’accès immédiat au service, l’utilisateur accepte que
        son exécution commence avant la fin de ce délai. S’il se rétracte
        ensuite, il reste redevable du montant correspondant à la part de
        service effectivement fournie&nbsp;; pendant l’essai gratuit, cette
        part étant nulle, le remboursement est intégral.
      </p>

      <h2>11. Usage du service</h2>
      <p>L’utilisateur s’engage à ne pas&nbsp;:</p>
      <ul>
        <li>
          publier de contenu illicite, diffamatoire ou portant atteinte aux
          droits d’un tiers&nbsp;;
        </li>
        <li>
          enregistrer des données concernant une personne sans qu’elle en soit
          informée — un co-cavalier, un praticien, un propriétaire&nbsp;;
        </li>
        <li>
          tenter d’accéder à des données d’autres comptes, ni de contourner
          les limites du plan gratuit&nbsp;;
        </li>
        <li>
          revendre l’accès au service, ni en automatiser l’usage à des fins
          d’extraction massive de données.
        </li>
      </ul>
      <p>
        Le partage d’une fiche par lien public rend celle-ci consultable, en
        lecture seule, par toute personne disposant de l’adresse. Il revient à
        l’utilisateur d’apprécier ce qu’il diffuse ainsi, et de révoquer le
        lien quand il n’a plus lieu d’être.
      </p>

      <h2>12. Contenus de l’utilisateur</h2>
      <p>
        L’utilisateur reste propriétaire des contenus qu’il dépose. Il concède
        à l’éditeur le droit strictement nécessaire à leur hébergement, leur
        affichage et leur sauvegarde dans le cadre du service — et à ce seul
        cadre. Aucun contenu n’est exploité à des fins commerciales,
        publicitaires ou d’entraînement de modèles.
      </p>

      <h2>13. Disponibilité</h2>
      <p>
        L’éditeur met en œuvre les moyens raisonnables pour assurer la
        continuité du service, sans pouvoir en garantir l’accès ininterrompu.
        Des interruptions peuvent survenir pour maintenance, mise à jour, ou
        du fait d’un prestataire d’hébergement. Elles n’ouvrent pas droit à
        indemnité, sauf indisponibilité prolongée et imputable à l’éditeur,
        auquel cas la période correspondante est prolongée à due
        concurrence.
      </p>

      <h2>14. Limites du service</h2>
      <p>
        <strong>
          Licol est un carnet de suivi, pas un outil de diagnostic.
        </strong>{' '}
        Les rappels d’échéance — vaccins, vermifuges, ferrure — sont des aides
        à l’organisation calculées à partir des informations saisies par
        l’utilisateur. Ils ne constituent en aucun cas un avis vétérinaire et
        ne dispensent ni du suivi d’un praticien, ni du respect des
        obligations sanitaires et réglementaires applicables aux équidés.
      </p>
      <p>
        L’éditeur ne saurait être tenu responsable des conséquences d’une
        décision prise sur la seule foi des informations affichées, ni de
        l’inexactitude de données saisies par l’utilisateur ou par un
        co-cavalier.
      </p>

      <h2>15. Responsabilité</h2>
      <p>
        La responsabilité de l’éditeur est limitée aux dommages directs et
        prévisibles. Elle ne saurait excéder le montant des sommes versées par
        l’utilisateur au cours des douze mois précédant le fait générateur.
        Ces limites ne s’appliquent ni en cas de faute lourde ou dolosive, ni
        aux dommages corporels, ni aux garanties légales de conformité.
      </p>

      <h2>16. Suspension et résiliation par l’éditeur</h2>
      <p>
        En cas de manquement caractérisé aux présentes, l’éditeur peut
        suspendre ou clôturer un compte après mise en demeure restée sans
        effet pendant quinze jours — sauf manquement grave ou illicite, où la
        mesure peut être immédiate. Les sommes versées au titre de la période
        non courue sont alors remboursées, sauf faute de l’utilisateur.
      </p>

      <h2>17. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{' '}
        <a href="/confidentialite">politique de confidentialité</a>, qui fait
        partie intégrante des présentes.
      </p>

      <h2>18. Modification des conditions</h2>
      <p>
        L’éditeur peut modifier les présentes. Toute modification substantielle
        est notifiée par email au moins trente jours avant sa prise d’effet, et
        une nouvelle acceptation est demandée à la prochaine connexion.
        L’utilisateur qui refuse peut résilier sans frais.
      </p>

      <h2>19. Droit applicable et litiges</h2>
      <p>
        Les présentes sont soumises au droit français. En cas de litige,
        l’utilisateur est invité à saisir l’éditeur d’une réclamation écrite.
        À défaut de résolution amiable, il peut recourir gratuitement au
        médiateur de la consommation mentionné à l’article 20, puis, le cas
        échéant, saisir la juridiction compétente.
      </p>
      <p className="aide">
        Le consommateur peut saisir la juridiction du lieu où il demeurait au
        moment de la conclusion du contrat ou de la survenance du fait
        dommageable.
      </p>

      <h2>20. Médiation</h2>
      <p>
        Médiateur compétent&nbsp;: {valeur(MEDIATEUR.nom)},{' '}
        {valeur(MEDIATEUR.adresse)} — {valeur(MEDIATEUR.site)}.
      </p>
    </PageLegale>
  )
}

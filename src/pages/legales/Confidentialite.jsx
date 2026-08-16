import PageLegale from '../../composants/PageLegale'
import { EDITEUR, PRESTATAIRES, valeur } from '../../lib/legal'

/**
 * Politique de confidentialité — RGPD.
 *
 * Le tableau des données est calé sur le schéma réel (migrations 0001 à
 * 0008). Décrire des données que l'application ne collecte pas, ou en taire
 * qu'elle collecte, vide l'exercice de son sens : à revoir donc à chaque
 * migration qui ajoute une colonne.
 */
export default function Confidentialite() {
  return (
    <PageLegale titre="Confidentialité">
      <h2>Responsable du traitement</h2>
      <p>
        {valeur(EDITEUR.nom)}, {valeur(EDITEUR.adresse)}. Pour toute question
        relative à vos données&nbsp;: <strong>{valeur(EDITEUR.email)}</strong>.
      </p>

      <h2>Ce que nous collectons</h2>
      <p>
        Uniquement ce que vous saisissez, et le minimum technique nécessaire
        au fonctionnement. Aucune donnée n’est achetée, enrichie ou croisée
        avec une source extérieure.
      </p>

      <h3>Votre compte</h3>
      <ul>
        <li>Email et mot de passe chiffré, ou identifiant de connexion Google</li>
        <li>Nom ou nom du club, type de compte</li>
        <li>
          Facultatif&nbsp;: photo de profil, téléphone, ville, présentation
        </li>
      </ul>

      <h3>Vos chevaux et leur suivi</h3>
      <ul>
        <li>
          Fiche du cheval&nbsp;: nom, photo, date de naissance, race, robe,
          sexe, nom du propriétaire, notes
        </li>
        <li>Partages&nbsp;: rôle de chaque cavalier, couleur d’affichage</li>
        <li>Créneaux du planning&nbsp;: dates, type, intitulé, notes</li>
        <li>Séances&nbsp;: date, type, ressenti, notes</li>
        <li>
          Soins&nbsp;: type, dates de réalisation et d’échéance, praticien,
          produit, coût, notes
        </li>
      </ul>
      <p className="aide">
        Les données de santé enregistrées concernent des équidés, non des
        personnes&nbsp;: elles ne relèvent pas des données sensibles au sens
        de l’article 9 du RGPD. Le nom d’un praticien, en revanche, est bien
        une donnée personnelle — celle d’un tiers, dont vous devez pouvoir
        justifier l’enregistrement.
      </p>

      <h3>Votre abonnement</h3>
      <ul>
        <li>Statut, formule souscrite, date d’échéance</li>
        <li>Identifiant client chez le prestataire de paiement</li>
      </ul>
      <p className="aide">
        Aucune coordonnée bancaire n’est reçue ni conservée par l’éditeur.
      </p>

      <h3>Données techniques</h3>
      <ul>
        <li>
          Journaux d’accès de l’hébergeur&nbsp;: adresse IP, date, page
          demandée
        </li>
        <li>
          Un jeton de session conservé dans votre navigateur, pour vous éviter
          de vous reconnecter à chaque visite
        </li>
      </ul>

      <h2>Pourquoi, et à quel titre</h2>
      <table className="tableau-legal">
        <thead>
          <tr>
            <th>Finalité</th>
            <th>Base légale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Créer et gérer votre compte, rendre le service</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Partager un cheval avec vos co-cavaliers ou votre club</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Gérer l’abonnement, la facturation et la résiliation</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Conserver les pièces comptables</td>
            <td>Obligation légale</td>
          </tr>
          <tr>
            <td>Assurer la sécurité du service et prévenir les abus</td>
            <td>Intérêt légitime</td>
          </tr>
          <tr>
            <td>Répondre à vos demandes</td>
            <td>Intérêt légitime</td>
          </tr>
        </tbody>
      </table>
      <p>
        Aucun profilage, aucune décision automatisée, aucune prospection
        commerciale à partir de vos données.
      </p>

      <h2>Qui y a accès</h2>
      <h3>Les autres utilisateurs</h3>
      <p>
        C’est le cœur du service, et cela mérite d’être dit sans détour&nbsp;:
        partager un cheval rend visibles à vos co-cavaliers, et au club le cas
        échéant, la fiche du cheval, le planning, les séances et — pour les
        comptes concernés — le carnet de santé et les dépenses. Votre nom et
        votre photo de profil leur sont également visibles.
      </p>
      <p>
        Le lien public d’une fiche, si vous en créez un, la rend consultable
        en lecture seule par toute personne disposant de l’adresse, sans
        compte. Il est révocable à tout moment depuis la fiche du cheval, et
        en régénérer un nouveau invalide immédiatement le précédent.
      </p>

      <h3>Nos sous-traitants</h3>
      <p>
        Chacun agit sur instruction, pour une finalité déterminée, et sans
        droit d’usage propre sur vos données&nbsp;:
      </p>
      {PRESTATAIRES.map((prestataire) => (
        <div className="carte" key={prestataire.cle} style={{ marginBottom: 10 }}>
          <div className="gras">
            {prestataire.nom} — {prestataire.role}
          </div>
          <p className="aide" style={{ marginTop: 4 }}>
            {prestataire.traitement}
            <br />
            Données concernées&nbsp;: {prestataire.donnees}
            <br />
            Localisation&nbsp;: {prestataire.zone}
          </p>
        </div>
      ))}
      <p>
        Les transferts hors Union européenne qu’impliquent certains de ces
        prestataires sont encadrés par les clauses contractuelles types de la
        Commission européenne, complétées le cas échéant par leur
        certification au titre du cadre de protection des données
        UE–États-Unis.
      </p>
      <p>
        Vos données ne sont ni vendues, ni louées, ni transmises à des fins
        publicitaires. Elles ne peuvent être communiquées à un tiers que sur
        réquisition d’une autorité judiciaire.
      </p>

      <h2>Combien de temps</h2>
      <table className="tableau-legal">
        <thead>
          <tr>
            <th>Donnée</th>
            <th>Conservation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Compte et contenus associés</td>
            <td>Toute la vie du compte, puis 30 jours après suppression</td>
          </tr>
          <tr>
            <td>Compte inactif</td>
            <td>3 ans sans connexion, après information préalable par email</td>
          </tr>
          <tr>
            <td>Pièces comptables et factures</td>
            <td>10 ans (obligation légale)</td>
          </tr>
          <tr>
            <td>Journaux techniques</td>
            <td>12 mois au plus</td>
          </tr>
        </tbody>
      </table>
      <p className="aide">
        Le délai de 30 jours après suppression correspond au cycle de
        sauvegarde&nbsp;: passé ce terme, les données ne sont plus
        restaurables, y compris par nous.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de
        limitation, d’opposition et de portabilité, ainsi que du droit de
        définir des directives relatives au sort de vos données après votre
        décès.
      </p>
      <p>
        Pour les exercer&nbsp;: <strong>{valeur(EDITEUR.email)}</strong>. Nous
        répondons sous un mois. Une pièce d’identité ne vous sera demandée
        qu’en cas de doute sérieux sur votre identité.
      </p>
      <p>
        Une part de ces droits s’exerce directement depuis
        l’application&nbsp;: vous pouvez modifier votre profil, corriger ou
        supprimer une séance, un soin ou un cheval, révoquer un lien public et
        retirer un co-cavalier, sans nous écrire.
      </p>
      <p>
        Si notre réponse ne vous satisfait pas, vous pouvez saisir la
        Commission nationale de l’informatique et des libertés — CNIL,
        3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 —{' '}
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
          cnil.fr
        </a>
        .
      </p>

      <h2>Sécurité</h2>
      <p>
        Les échanges sont chiffrés en transit. L’accès aux données est
        cloisonné au niveau de la base de données elle-même, par des règles
        qui s’appliquent à toute requête, y compris hors de
        l’application&nbsp;: un compte ne peut lire que ce à quoi il a droit,
        et aucune manipulation depuis le navigateur ne contourne cette règle.
        Les mots de passe sont conservés sous forme d’empreintes non
        réversibles.
      </p>
      <p>
        En cas de violation de données susceptible d’engendrer un risque élevé
        pour vos droits, vous en serez informé dans les meilleurs délais,
        conformément à l’article 34 du RGPD.
      </p>

      <h2>Cookies</h2>
      <p>
        Le service n’utilise <strong>aucun cookie de mesure d’audience, de
        publicité ou de réseau social</strong>. Le seul stockage local est le
        jeton qui maintient votre session ouverte&nbsp;: strictement
        nécessaire au fonctionnement, il ne requiert pas votre consentement et
        n’appelle donc pas de bandeau. Il disparaît à la déconnexion.
      </p>
      <p className="aide">
        Le prestataire de paiement peut déposer ses propres cookies au moment
        du règlement, à des fins de sécurité et de lutte contre la fraude.
      </p>

      <h2>Modification</h2>
      <p>
        Cette politique peut évoluer. Toute modification substantielle vous
        sera notifiée par email, et la date de dernière mise à jour figure au
        bas de cette page.
      </p>
    </PageLegale>
  )
}

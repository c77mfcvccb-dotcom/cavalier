import PageLegale from '../../composants/PageLegale'
import {
  directeurPublication,
  EDITEUR,
  MEDIATEUR,
  PRESTATAIRES,
  valeur,
} from '../../lib/legal'

/** Mentions légales — article 6 III de la LCEN. */
export default function MentionsLegales() {
  return (
    <PageLegale titre="Mentions légales">
      <h2>Éditeur du service</h2>
      <p>
        Le service Licol, accessible à l’adresse du présent site, est édité
        par&nbsp;:
      </p>
      <dl className="tableau-infos">
        <dt>Éditeur</dt>
        <dd>{valeur(EDITEUR.nom)}</dd>
        <dt>Forme</dt>
        <dd>{valeur(EDITEUR.forme)}</dd>
        <dt>Siège</dt>
        <dd>{valeur(EDITEUR.adresse)}</dd>
        <dt>SIRET</dt>
        <dd>{valeur(EDITEUR.siret)}</dd>
        <dt>RCS</dt>
        <dd>{valeur(EDITEUR.rcs)}</dd>
        <dt>TVA</dt>
        <dd>{valeur(EDITEUR.tva)}</dd>
        <dt>Email</dt>
        <dd>{valeur(EDITEUR.email)}</dd>
        <dt>Téléphone</dt>
        <dd>{valeur(EDITEUR.telephone)}</dd>
        <dt>Directeur de la publication</dt>
        <dd>{valeur(directeurPublication)}</dd>
      </dl>

      <h2>Hébergement</h2>
      <p>
        Le service s’appuie sur des prestataires distincts pour la diffusion
        des pages et pour la conservation des données. Les deux sont listés
        ici&nbsp;: savoir <em>où</em> vivent ses données fait partie de ce
        qu’un utilisateur est en droit de connaître.
      </p>
      {PRESTATAIRES.filter((p) => ['vercel', 'supabase'].includes(p.cle)).map(
        (prestataire) => (
          <dl className="tableau-infos" key={prestataire.cle}>
            <dt>{prestataire.role}</dt>
            <dd>{prestataire.nom}</dd>
            <dt>Adresse</dt>
            <dd>{valeur(prestataire.adresse)}</dd>
            <dt>Localisation</dt>
            <dd>{prestataire.zone}</dd>
          </dl>
        )
      )}

      <h2>Paiement</h2>
      <p>
        Les abonnements sont gérés par RevenueCat, Inc. et encaissés par
        Stripe. Aucune coordonnée bancaire n’est saisie, reçue ni conservée
        par l’éditeur.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La structure du service, ses textes, son interface, son nom et son
        identité visuelle — dont le fer à cheval qui lui sert de logo — sont
        protégés par le droit d’auteur et demeurent la propriété de
        l’éditeur. Toute reproduction ou adaptation, totale ou partielle, sans
        autorisation écrite préalable est interdite.
      </p>
      <p>
        Les contenus déposés par les utilisateurs — noms de chevaux, photos,
        notes de séance, données de suivi — restent la propriété de leurs
        auteurs. L’éditeur n’en acquiert aucun droit&nbsp;: il les héberge
        pour rendre le service, et rien d’autre.
      </p>

      <h2>Signalement d’un contenu illicite</h2>
      <p>
        Conformément à la LCEN, tout contenu manifestement illicite peut être
        signalé à l’adresse <strong>{valeur(EDITEUR.email)}</strong>. Le
        signalement gagne à préciser l’URL concernée, la nature du contenu et
        les motifs pour lesquels il devrait être retiré.
      </p>

      <h2>Médiation de la consommation</h2>
      <p>
        Conformément à l’article L612-1 du code de la consommation, tout
        consommateur peut recourir gratuitement à un médiateur en vue de la
        résolution amiable d’un litige qui l’oppose à l’éditeur&nbsp;:
      </p>
      <dl className="tableau-infos">
        <dt>Médiateur</dt>
        <dd>{valeur(MEDIATEUR.nom)}</dd>
        <dt>Adresse</dt>
        <dd>{valeur(MEDIATEUR.adresse)}</dd>
        <dt>Site</dt>
        <dd>{valeur(MEDIATEUR.site)}</dd>
      </dl>
      <p className="aide">
        La saisine du médiateur suppose d’avoir tenté au préalable de résoudre
        le litige directement auprès de l’éditeur, par une réclamation écrite.
      </p>
    </PageLegale>
  )
}

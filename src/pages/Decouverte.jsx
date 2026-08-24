import { Link } from 'react-router-dom'
import PiedDePage from '../composants/PiedDePage'
import Icone from '../composants/Icone'

/**
 * La vitrine — ce que voit un visiteur sans compte.
 *
 * Avant elle, l'adresse racine renvoyait sur l'écran de connexion : rien ne
 * présentait le produit, rien ne donnait envie d'essayer. La page parle aux
 * deux publics dans l'ordre où ils arrivent — le cavalier d'abord, l'écurie
 * ensuite — et dit les prix sans détour : la confiance d'une écurie se gagne
 * en annonçant la couleur, pas en la cachant derrière un formulaire.
 *
 * Les prix affichés ici sont ceux du repli de src/lib/abonnement.js : à
 * l'écran d'abonnement, ce sont toujours ceux du catalogue RevenueCat qui
 * font foi.
 */
const POUR_CAVALIERS = [
  {
    icone: 'agenda',
    titre: 'Un calendrier partagé par cheval',
    texte:
      'Chaque cavalière pose ses créneaux, les co-cavalières les voient en direct — fini le groupe de messagerie pour savoir qui monte quand.',
  },
  {
    icone: 'cloche',
    titre: 'Le carnet de santé, avec rappels',
    texte:
      'Ferrure, vaccins, vermifuges, ostéo : les échéances se recalculent toutes seules et sonnent avant le retard. Carnet imprimable pour le vétérinaire.',
  },
  {
    icone: 'chevaux',
    titre: 'Les séances et le ressenti',
    texte:
      'Ce que chacun a fait avec le cheval, et comment il était — une boiterie suspectée remonte immédiatement chez tous.',
  },
  {
    icone: 'photo',
    titre: 'Les papiers du cheval, rangés',
    texte:
      'Document d’identification, contrat de demi-pension, assurance : un seul endroit, partagé avec les bonnes personnes.',
  },
]

const POUR_ECURIES = [
  {
    icone: 'accueil',
    titre: 'Les tâches du jour, calculées',
    texte:
      'Chaque matin, la liste exacte des soins à donner — chevaux du club et pensions — au jour, à la semaine ou au mois. Un geste, et l’échéance suivante est posée.',
  },
  {
    icone: 'cours',
    titre: 'Les cours et leurs inscriptions',
    texte:
      'Planning publié, inscription des cavaliers en un appui, liste d’attente automatique, pointage, et l’attribution des chevaux éclairée par leur charge de travail.',
  },
  {
    icone: 'club',
    titre: 'Vos cavaliers, votre code',
    texte:
      'Un code d’adhésion à transmettre : les cavaliers rejoignent seuls, vous attribuez les montures et la formule — demi-pension, tiers, pension complète.',
  },
  {
    icone: 'profil',
    titre: 'L’accès offert à vos cavaliers',
    texte:
      'Votre abonnement couvre tous vos cavaliers sur votre cavalerie, sans limite de nombre : ils profitent du carnet complet sans payer de leur poche.',
  },
]

export default function Decouverte() {
  return (
    <div className="vitrine">
      <header className="vitrine-entete">
        <div className="vitrine-logo">
          <img src="/logo.svg" alt="" width="34" height="34" />
          <span>Licol</span>
        </div>
        <nav className="rangee" style={{ gap: 8 }}>
          <Link to="/connexion" className="bouton fantome petit">Se connecter</Link>
          <Link to="/inscription" className="bouton petit">Créer un compte</Link>
        </nav>
      </header>

      <main>
        <section className="vitrine-heros">
          <h1>Le carnet partagé de votre cheval.</h1>
          <p>
            Demi-pension, soins, séances, cours : tout ce qui se disait dans
            trois conversations et un cahier d’écurie, au même endroit — pour
            les cavaliers et pour les écuries.
          </p>
          <div className="rangee centre" style={{ gap: 10, justifyContent: 'center' }}>
            <Link to="/inscription" className="bouton">Créer un compte gratuit</Link>
            <a href="#ecuries" className="bouton secondaire">Je gère une écurie</a>
          </div>
          <p className="aide">Sans engagement — le plan gratuit suffit pour commencer.</p>

          {/* Un aperçu dessiné de l'écran d'accueil de l'écurie : le produit
              se comprend mieux en le voyant qu'en le lisant. */}
          <div className="vitrine-telephone" aria-hidden="true">
            <div className="tel-ecran">
              <div className="tel-entete">
                <span className="tel-titre">Accueil</span>
                <span className="tel-sous">Écuries du Vallon</span>
              </div>
              <div className="tel-bloc">Tâches du jour</div>
              <div className="tel-ligne">
                <span className="tel-pastille rouge" />
                <span className="tel-texte">Quenotte — Vermifuge</span>
                <span className="badge retard">En retard</span>
              </div>
              <div className="tel-ligne">
                <span className="tel-pastille orange" />
                <span className="tel-texte">Caramel — Ferrure</span>
                <span className="badge urgent">Aujourd'hui</span>
              </div>
              <div className="tel-bloc">Cours du jour</div>
              <div className="tel-ligne">
                <span className="tel-pastille bleue" />
                <span className="tel-texte">18 h — Dressage · Galop 2</span>
                <span className="badge contour">6/8</span>
              </div>
              <div className="tel-nav">
                <Icone nom="accueil" taille={17} />
                <Icone nom="chevaux" taille={17} />
                <Icone nom="club" taille={17} />
                <Icone nom="agenda" taille={17} />
                <Icone nom="cours" taille={17} />
              </div>
            </div>
          </div>
        </section>

        <section className="vitrine-section">
          <div className="vitrine-titre">
            <Icone nom="accueil" />
            <h2>Comment ça marche</h2>
          </div>
          <div className="vitrine-grille">
            <div className="carte">
              <h3>Vous êtes cavalier</h3>
              <ol className="vitrine-etapes">
                <li>Créez votre compte gratuit.</li>
                <li>
                  Ajoutez votre cheval — ou entrez le code que votre écurie ou
                  votre co-demi-pensionnaire vous a transmis.
                </li>
                <li>
                  C'est tout : le calendrier, les soins et les cours se
                  partagent tout seuls, en temps réel.
                </li>
              </ol>
            </div>
            <div className="carte">
              <h3>Vous gérez une écurie</h3>
              <ol className="vitrine-etapes">
                <li>Créez le compte de votre écurie.</li>
                <li>
                  Ajoutez vos chevaux, publiez vos cours, et transmettez votre
                  code d'adhésion aux cavaliers.
                </li>
                <li>
                  Chaque matin, l'accueil vous dit qui soigner et qui monte —
                  et vos cavaliers profitent de l'accès offert.
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="vitrine-section">
          <div className="vitrine-titre">
            <Icone nom="chevaux" />
            <h2>Pour les cavaliers</h2>
          </div>
          <div className="vitrine-grille">
            {POUR_CAVALIERS.map((b) => (
              <div key={b.titre} className="carte vitrine-carte">
                <span className="vitrine-picto"><Icone nom={b.icone} /></span>
                <h3>{b.titre}</h3>
                <p className="doux">{b.texte}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="vitrine-section" id="ecuries">
          <div className="vitrine-titre">
            <Icone nom="club" />
            <h2>Pour les écuries et les clubs</h2>
          </div>
          <div className="vitrine-grille">
            {POUR_ECURIES.map((b) => (
              <div key={b.titre} className="carte vitrine-carte">
                <span className="vitrine-picto"><Icone nom={b.icone} /></span>
                <h3>{b.titre}</h3>
                <p className="doux">{b.texte}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="vitrine-section" id="tarifs">
          <div className="vitrine-titre">
            <Icone nom="agenda" />
            <h2>Des prix simples</h2>
          </div>
          <div className="vitrine-grille tarifs">
            <div className="carte">
              <h3>Cavalier — Gratuit</h3>
              <p className="vitrine-prix">0 €</p>
              <ul className="doux">
                <li>Un cheval, créé ou rejoint par code</li>
                <li>Le calendrier de la semaine en cours</li>
                <li>Les documents du cheval (10 fichiers)</li>
                <li>Les cours de votre club, si vous êtes membre</li>
              </ul>
            </div>
            <div className="carte vitrine-mise-en-avant">
              <h3>Cavalier — Premium</h3>
              <p className="vitrine-prix">
                4,99 €<span className="doux"> / mois — ou 39,99 € / an</span>
              </p>
              <ul className="doux">
                <li>Chevaux illimités</li>
                <li>Carnet de santé complet et rappels d’échéances</li>
                <li>Calendrier sans limite</li>
              </ul>
              <Link to="/inscription" className="bouton pleine-largeur">Essayer gratuitement</Link>
            </div>
            <div className="carte">
              <h3>Écurie</h3>
              <p className="vitrine-prix">Un abonnement, tous vos cavaliers</p>
              <ul className="doux">
                <li>Cavalerie, cours, planning et tâches du jour</li>
                <li>Cavaliers illimités, accès offert sur votre périmètre</li>
                <li>Pensions des propriétaires suivies au même endroit</li>
              </ul>
              <Link to="/inscription" className="bouton secondaire pleine-largeur">
                Créer le compte de mon écurie
              </Link>
            </div>
          </div>
          <p className="aide centre">
            Si votre écurie utilise déjà Licol, demandez-lui simplement son
            code d’adhésion : l’accès offert ne vous coûte rien.
          </p>
        </section>

        <section className="vitrine-section vitrine-finale">
          <h2>Installez-le comme une application</h2>
          <p className="doux">
            Licol fonctionne dans le navigateur et s’ajoute à l’écran
            d’accueil du téléphone — rien à télécharger, rien à mettre à
            jour, vos données restent les vôtres.
          </p>
          <Link to="/inscription" className="bouton">Créer un compte gratuit</Link>
        </section>
      </main>

      <PiedDePage />
    </div>
  )
}

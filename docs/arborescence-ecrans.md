# Arborescence des écrans — Licol V1

Mobile-first : navigation par barre d'onglets en bas d'écran, 4 onglets max,
différente selon le type de compte. Tout est en français.

## Public (non connecté)

```
/connexion            Email + mot de passe, bouton « Continuer avec Google »
                      └─ lien « Mot de passe oublié ? »
/inscription          Étape 1 : je suis CAVALIER ou CLUB
                      Étape 2 : nom, email, mot de passe
/mot-de-passe-oublie  Saisie de l'email → même message de confirmation que
                      l'adresse existe ou non, et rappel que la connexion
                      Google ne demande aucun mot de passe
/reinitialisation     Cible du lien reçu par mail : nouveau mot de passe,
                      confirmation, 8 caractères minimum. Lien expiré ou
                      déjà utilisé → message clair + nouvelle demande
```

`/reinitialisation` est rendue **hors des deux arbres de routes** (voir
`src/App.jsx`) : le lien du mail ouvre une session, l'application basculerait
donc en mode connecté et renverrait vers l'accueil avant toute saisie.

Le lien n'atterrit d'ailleurs pas toujours sur cette URL. Si l'adresse de
retour ne figure pas dans Supabase → **Authentication → URL Configuration →
Redirect URLs** (`https://licol.app/**` suffit), le serveur d'authentification
renvoie sur la **Site URL**, jeton compris : la session s'ouvre sur l'accueil
et le mot de passe n'est jamais changé. `src/lib/recuperation.js` retient donc
qu'une récupération est en cours — `type=recovery` lu dans l'URL **avant** la
création du client Supabase, doublé de l'événement `PASSWORD_RECOVERY` — et
tout chemin ramène à l'écran de saisie tant que le nouveau mot de passe n'a
pas été posé. Une sortie discrète (« Garder mon mot de passe actuel ») évite
d'y rester enfermé.

## Compte CAVALIER

Barre d'onglets : **Accueil · Mes chevaux · Calendrier · Profil**

```
/                     ACCUEIL — tableau de bord
                      ├─ alertes échéances de soins triées par urgence
                      │  (retard en rouge, < 7 j en orange, < 30 j en gris)
                      ├─ mes prochains créneaux
                      └─ accès rapide « Rejoindre un cheval »

/chevaux              MES CHEVAUX — cartes photo + nom + badge de rôle
                      (Propriétaire / Demi-pension / Cheval de club)
                      ├─ bouton « Ajouter un cheval »
                      └─ bouton « Rejoindre avec un code »

/chevaux/nouveau      Formulaire fiche cheval + photo

/rejoindre            Saisie du code d'invitation à 6 caractères

/chevaux/:id          FICHE CHEVAL — 4 onglets internes
   ├─ Fiche           photo, âge, race, robe, sexe, propriétaire,
   │                  cavaliers liés (avec leur couleur), bouton
   │                  « Inviter en demi-pension » → génère le code
   ├─ Calendrier      mois avec étiquettes de couleur par cavalier ;
   │                  un appui choisit le jour, un second sur le même
   │                  jour ouvre la création d'un créneau
   ├─ Séances         carnet chronologique, ajout d'une séance
   └─ Soins           historique par type + prochaines échéances,
                      ajout d'un soin (échéance pré-remplie)

/calendrier           CALENDRIER GLOBAL — tous mes chevaux fusionnés,
                      vue mois puis détail du jour. Deux natures d'événement :
                      créneaux de monte (pastille ronde, couleur du cavalier)
                      et échéances de soins (marque carrée neutre + emoji du
                      type de soin + badge d'urgence).
                      Second appui sur le jour choisi → création : direct
                      avec un seul cheval, sinon on demande lequel

/profil               Nom, photo, galop, ville, téléphone, déconnexion
```

## Compte CLUB

Barre d'onglets : **Cavalerie · Santé · Planning · Profil**

```
/                     CAVALERIE — liste de tous les chevaux du club,
                      recherche, nombre de cavaliers liés par cheval
                      └─ bouton « Ajouter un cheval »

/chevaux/:id          FICHE CHEVAL — mêmes 4 onglets que côté cavalier,
                      plus la gestion des cavaliers liés :
                      inviter un cavalier au cheval, retirer une liaison

/sante                SANTÉ DE LA CAVALERIE — vue globale
                      toutes les échéances de tous les chevaux,
                      triées par urgence, filtrables par type de soin

/planning             PLANNING GLOBAL — qui monte quel cheval quand,
                      vue semaine ; chaque créneau porte le nom du cheval
                      et la couleur du cavalier. Les échéances de soins de
                      la cavalerie s'intercalent au bon jour, dans le même
                      rendu que côté cavalier

/profil               Nom du club, photo, ville, présentation, déconnexion
```

## Écrans partagés

`/chevaux/:id` est le **même composant** pour les deux types de compte : les
droits sont appliqués par le RLS côté base, pas par une logique d'affichage.
Un club voit ses chevaux, un cavalier voit les siens, et un cheval de club
auquel un cavalier est lié apparaît dans les deux.

## Principes d'interface

- Une seule action principale par écran, en bouton flottant ou en pied de carte.
- Les formulaires s'ouvrent en feuille modale qui remonte du bas (réflexe mobile).
- Codes couleur cavaliers repris partout : calendrier, séances, planning club.
- **Deux appuis pour créer un créneau, pas un.** Le premier choisit le jour —
  c'est ce qui permet d'en lire le détail, affiché au-dessus de la grille — et
  le second ouvre le formulaire. Ouvrir dès le premier appui rendrait
  impossible la simple consultation d'une journée, qui est l'usage le plus
  fréquent. Un « + » discret apparaît sur le jour choisi pour annoncer ce que
  fera le second appui.
- Aucun écran ne dépasse deux niveaux de profondeur depuis un onglet.

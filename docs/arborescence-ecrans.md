# Arborescence des écrans — Licol V1

Mobile-first : navigation par barre d'onglets en bas d'écran, 5 onglets max,
différente selon le type de compte. Tout est en français.

## Public (non connecté)

```
/                     VITRINE — la page publique qui présente le produit :
                      cavaliers, écuries, prix (gratuit / premium / écurie),
                      appels à l'inscription. C'est l'adresse à partager
/connexion            Email + mot de passe, bouton « Continuer avec Google »,
                      et « Recevoir un lien de connexion par email » (magic
                      link Supabase, sans mot de passe — réservé aux comptes
                      déjà existants : `shouldCreateUser: false`)
                      └─ lien « Mot de passe oublié ? »
/inscription          Étape 1 : je suis CAVALIER ou CLUB
                      Étape 2 : nom, email, mot de passe
                      Étape 3 (cavalier, une fois connecté) : deux portes
                      d'entrée à égalité — « Créer mon premier cheval »
                      (→ /chevaux/nouveau) ou « J'ai un code d'invitation »
                      (le code d'adhésion club), ou « Plus tard » pour
                      passer. L'écran vit sur /bienvenue dans l'arbre
                      CONNECTÉ (l'inscription ouvre une session qui fait
                      basculer le routeur) : l'inscription pose un drapeau
                      sessionStorage, le premier passage sur l'accueil y
                      redirige une seule fois — voie Google comprise, le
                      drapeau survit à l'aller-retour OAuth
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

Barre d'onglets : **Accueil · Chevaux · Agenda · Cours · Club · Profil**
(six entrées est la limite absolue — d'où les libellés courts). Les
dépenses ont quitté la barre : leur porte d'entrée vit dans le Profil et
sur la fiche de chaque cheval.

```
/                     ACCUEIL — tableau de bord
                      ├─ alertes échéances de soins triées par urgence
                      │  (retard en rouge, < 7 j en orange, < 30 j en gris)
                      ├─ mes prochains créneaux
                      ├─ cours du club à venir, avec mon statut et mon cheval
                      │  (seulement si je suis rattaché à un club)
                      └─ accès rapide « Rejoindre un cheval »

/cours                COURS DU CLUB — le planning publié par mon club, en
                      vue JOUR par défaut, commutable Semaine ou Mois (même
                      sélecteur que l'écurie) : discipline, niveau, coach,
                      places. Filtre par coach : ne voir que les cours de
                      SA monitrice, d'un geste.
                      Un appui déplie le détail : qui vient, sur quel cheval,
                      m'inscrire ou me désinscrire. Complet → inscription en
                      liste d'attente, avec ma position ; une place libérée
                      promeut automatiquement le premier de la liste (base).
                      Le cheval attribué par le club s'affiche dès qu'il l'est

/chevaux              MES CHEVAUX — cartes photo + nom + badge de rôle
                      (Propriétaire / Demi-pension / Cheval de club)
                      ├─ bouton « Ajouter un cheval »
                      └─ bouton « Rejoindre avec un code »

/chevaux/nouveau      Formulaire fiche cheval + photo

/rejoindre            Saisie du code d'invitation à 6 caractères

/chevaux/:id          FICHE CHEVAL — 6 onglets internes
   ├─ Fiche           photo, âge, race, robe, sexe, propriétaire.
   │                  Section Disponibilité : le gestionnaire met le cheval
   │                  au repos (motif, dates, « jusqu'à nouvel ordre ») et
   │                  le remet au travail ; tous les cavaliers le voient.
   │                  « Lever » ferme le repos à HIER — le cheval est
   │                  disponible immédiatement — et garde la ligne en
   │                  historique ; « ✕ » l'efface entièrement, c'est le
   │                  geste de la saisie par erreur (« il n'est pas
   │                  blessé »), avec confirmation.
   │                  Un cheval de club au repos propose de REPORTER ses
   │                  cavaliers sur un autre cheval — la liaison porte
   │                  « Remplace X » et la levée du repos propose d'y
   │                  mettre fin.
   │                  « Dépenses de ce cheval » ouvre le suivi déjà filtré
   │                  (propriétaire cavalier seulement — pas côté club)
   ├─ Cavaliers       qui monte le cheval, chacun avec sa couleur de
   │                  calendrier et son rôle. « + Inviter » génère le code
   │                  (demi-pension). Côté club, « + Attribuer » lie un
   │                  membre sans code en posant la FORMULE : demi-pension,
   │                  tiers de pension, pension complète ou cheval de club
   │                  (migration 0023) — réattribuer ajuste le rôle sans
   │                  rien refaire. Retrait d'une liaison au même endroit
   ├─ Calendrier      mois avec étiquettes de couleur par cavalier ;
   │                  un appui choisit le jour, un second sur le même
   │                  jour ouvre la création d'un créneau
   ├─ Séances         carnet chronologique, ajout d'une séance
   ├─ Soins           historique par type + prochaines échéances,
   │                  ajout d'un soin (échéance pré-remplie)
   └─ Documents        document d'identification, contrat de demi-pension,
                      assurance — un fichier par ligne, ouvert via une URL
                      signée, visible par tous les cavaliers liés au cheval.
                      À l'ajout, la catégorie se choisit AVANT le fichier :
                      rien ne part sans être classé. « Autre » exige un nom
                      libre, qui devient le titre dans la liste

/calendrier           CALENDRIER GLOBAL — tous mes chevaux fusionnés,
                      vue mois puis détail du jour. Deux natures d'événement :
                      créneaux de monte (pastille ronde, couleur du cavalier)
                      et échéances de soins (marque neutre au libellé du
                      type de soin + badge d'urgence).
                      Second appui sur le jour choisi → création : direct
                      avec un seul cheval, sinon on demande lequel

/club                 MON CLUB — une carte par écurie, avec son LOGO, son
                      nom, sa ville et le statut (membre / accès offert) ;
                      « Mes chevaux ici » : les montures que le club m'a
                      attribuées (photo + rôle DP ou cheval de club) et mes
                      chevaux en pension ; mise en pension, cours du club,
                      quitter, et le code d'adhésion pour rejoindre.
                      L'accès offert par l'écurie = premium sur son
                      périmètre uniquement ; les chevaux personnels hors
                      écurie restent sur le plan du compte

/profil               Nom, photo, galop, ville, téléphone, déconnexion,
                      badge de plan (Premium / Accès offert par l'écurie /
                      Plan gratuit) et entrée « Mon club »
```

## Compte CLUB

Barre d'onglets : **Accueil · Chevaux · Cavaliers · Planning · Cours · Profil**
(pas de dépenses côté club : la fonction n'existe que côté cavalier)

```
/                     ACCUEIL — la page par défaut du club, recalculée à
                      chaque chargement depuis les soins (aucun cron) :
                      ├─ TÂCHES : vermifuges, vaccins, ferrures… — sur les
                      │  chevaux du club ET les pensions confirmées —
                      │  commutables Aujourd'hui (d'office) / 7 jours /
                      │  30 jours, GROUPÉES « En retard / Aujourd'hui /
                      │  À venir » avec compteur coloré : un moniteur lit
                      │  l'écran en trois secondes. Chaque ligne dit
                      │  l'action d'abord (« Vermifuge · Quenotte ») et
                      │  porte un vrai bouton « Fait » pour voir venir ce
                      │  qu'il y aura à faire — la borne du mois est à
                      │  30 jours parce que la saisie d'un soin pré-remplit
                      │  l'échéance à 4-12 semaines selon le type. Chaque
                      │  tâche : cheval, type, échéance, badge d'urgence
                      │  (En retard / Aujourd'hui / Cette semaine / Ce
                      │  mois-ci — les retards restent sur tous les
                      │  horizons) et une case « Fait » qui
                      │  écrit le soin au carnet et recalcule la prochaine
                      │  échéance selon la périodicité du cheval.
                      │  Rien à faire → « Tout est à jour ». Sous les
                      │  tâches, « PLUS TARD » : les prochaines échéances
                      │  AU-DELÀ de l'horizon choisi, datées — un soin
                      │  saisi à l'instant (échéance pré-remplie à 7-52
                      │  semaines) y apparaît immédiatement au lieu de
                      │  sembler perdu
                      ├─ COURS DU JOUR : le programme de la journée, avec
                      │  l'alerte « N sans cheval » et le lien vers l'onglet
                      ├─ PLUS TARD : TOUTES les échéances au-delà de
                      │  l'horizon (replié à 5, « Tout afficher » au-delà —
                      │  un plafond recréait le bug du soin invisible),
                      │  chacune avec son bouton « Fait » : le maréchal
                      │  passé en avance se pointe d'ici
                      └─ DERNIERS SOINS NOTÉS : les 5 dernières saisies,
                         échéance ou pas — la preuve immédiate que le soin
                         enregistré est bien arrivé.
                      L'ancien onglet Santé a fusionné ici — les données
                      n'ont pas bougé, l'historique reste sur chaque fiche

/chevaux              CAVALERIE — liste de tous les chevaux du club ET des
                      pensions confirmées (badge « En pension » —
                      l'Accueil rappelle leurs soins, le cheval doit donc
                      se trouver ici), recherche, nombre de cavaliers liés,
                      charge de travail (« 2 aujourd'hui · 5 sur la
                      semaine ») et badge « Au repos » quand une
                      indisponibilité court
                      └─ bouton « Ajouter un cheval »

/chevaux/:id          FICHE CHEVAL — mêmes 4 onglets que côté cavalier,
                      plus la gestion des cavaliers liés :
                      inviter un cavalier au cheval, retirer une liaison

/planning             LE PLANNING DES CHEVAUX — la raison d'être de l'écran :
                      qui monte quel cheval quand. Bascule LISTE / TABLEAU,
                      TABLEAU par défaut — c'est lui qui remplace le
                      tableau blanc de la sellerie : chevaux de CLUB en
                      lignes (pas les pensions), jours de la semaine en
                      colonnes, colonne Soins au bout (échéances de la
                      semaine, retards compris), cases Repos teintées avec
                      leur vrai motif (Ostéopathie, Vétérinaire, Vacances…),
                      défilement horizontal avec colonne des noms collante,
                      flèches pour feuilleter de semaine en semaine.
                      La vue Liste garde le sélecteur Jour/Semaine/Mois
                      (commun avec l'onglet Cours), filtrable par cheval
                      (avec bannière « au repos » sur le cheval filtré).
                      Deux natures de ligne : créneaux de monte, et
                      passages en cours (cheval attribué). Les échéances de
                      soins vivent sur l'Accueil et les fiches, les cours
                      dans leur onglet

/cours                COURS (onglet dédié) — les cours de la JOURNÉE par
                      défaut, commutables Semaine ou Mois, filtrables par
                      COACH (chaque monitrice isole son planning d'un
                      geste) ; création par le
                      bouton + (capacité 1-30, discipline, niveau, coach),
                      RÉCURRENCE hebdomadaire optionnelle (« Se répète
                      chaque semaine » + date de fin OBLIGATOIRE → une ligne
                      par semaine, 52 occurrences maximum, même serie_id,
                      migration 0026 ; la création est bloquée sans date de
                      fin — sinon un seul cours se crée en silence, sans
                      lien de série), cartes par jour avec inscrits/attente
                      et alerte « N sans cheval ». Un appui ouvre la
                      feuille : inscrits et liste d'attente, inscription
                      d'office, pointage présent/absent, l'ATTRIBUTION des
                      chevaux — le sélecteur annonce la charge du jour et
                      grise ceux au repos ; la base refuse de toute façon un
                      cheval indisponible ou hors club (triggers 0017) — et
                      la SUPPRESSION : un cours issu d'une récurrence
                      propose « cette date seulement » (par id) OU « toute
                      la série » (par serie_id, N cours à la fois). Un
                      cours SANS serie_id (posé à la main, avant la case
                      « Se répète », ou sans date de fin choisie) est quand
                      même comparé aux autres cours à venir du club — même
                      discipline, même coach, même jour de semaine, même
                      heure — et propose alors « cette date seulement » OU
                      « supprimer aussi » les cours identiques trouvés.
                      Un cours vraiment seul n'a que « Supprimer ce
                      cours ». Vue Liste uniquement : « Sélectionner
                      plusieurs cours » fait
                      apparaître une case à cocher sur chaque carte, une
                      barre en bas annonce le compte et propose « Tout
                      sélectionner » et « Supprimer (N) » — le ménage d'une
                      saison entière, cours posés un par un sans lien de
                      série compris.
                      Bascule LISTE / TABLEAU : le tableau recrée celui de
                      la sellerie — les créneaux du jour affiché en
                      colonnes (une par cours, triées par heure), la liste
                      cavalier : cheval dedans, colonne Balade distinguée
                      (fond sable) ; un appui sur l'en-tête ouvre le cours

/club                 MES CAVALIERS (gérant, onglet « Cavaliers ») — par
                      membre : ses montures attribuées avec leur rôle
                      (demi-pension ou cheval de club) et leur retrait,
                      « + Attribuer un cheval » (cheval + rôle, c'est le
                      club qui attribue la monture d'une DP), ses chevaux
                      de propriétaire en pension à l'écurie (fiche visible,
                      données au propriétaire), accès offert donné/retiré,
                      retrait du club. Plus le code d'adhésion multi-usage
                      (affichage, partage, régénération : l'ancien meurt).
                      Bandeau si l'abonnement du club est inactif

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
- **Les calendriers se tiennent à jour tout seuls.** Deux cavalières d'une même
  demi-pension posent souvent leurs créneaux ensemble, chacune sur son
  téléphone : ce que l'une enregistre apparaît chez l'autre sans rechargement
  (`src/lib/temps-reel.js`, migration 0014). On recharge la liste plutôt que
  d'appliquer l'événement reçu — un aller-retour de plus, mais aucune
  divergence possible entre l'affichage et la base. Un retour au premier plan
  resynchronise également, ce qui couvre le téléphone verrouillé, la coupure
  de réseau, et la migration pas encore exécutée.
- Aucun écran ne dépasse deux niveaux de profondeur depuis un onglet.

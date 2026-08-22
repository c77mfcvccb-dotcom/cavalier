# Licol

**Le carnet partagé de votre cheval.** Application web mobile-first pour les
cavaliers et les clubs équestres.

Le nom vient du licol, la pièce qui relie le cavalier à son cheval au
quotidien — et c'est bien de lien qu'il s'agit ici : entre co-cavaliers d'une
même demi-pension, et entre un club et ses cavaliers. Il se distingue aussi
de la nomenclature dominante du secteur, largement construite sur le préfixe
« Equi- ».

L'identité tient dans deux fichiers : `public/logo.svg` (fer à cheval avec
ses étampures, pour l'icône d'application) et `public/favicon.svg` (même fer,
sans les trous, qui se refermeraient en bouillie à 16 px). Les PNG de la PWA
se régénèrent avec `npm run icones`.

- **Côté cavalier** : ses chevaux, le partage en demi-pension par code
  d'invitation, un calendrier partagé par cheval mis à jour en temps réel,
  un carnet de séances, le suivi santé avec alertes d'échéances, et les
  documents administratifs du cheval rangés une fois pour toutes.
- **Côté club** : le pilotage de la cavalerie, le même suivi santé en vue
  globale triée par urgence, et le planning complet — les cours avec leurs
  inscriptions et leur liste d'attente, l'attribution des chevaux éclairée
  par la charge de travail et les indisponibilités, et les créneaux « qui
  monte quel cheval quand ». Côté cavalier, l'écran **Cours** montre le
  planning de son club, l'inscription en un appui, et le cheval attribué.

PWA installable sur l'écran d'accueil. Interface entièrement en français.

## Stack

| Couche       | Choix                                             |
|--------------|---------------------------------------------------|
| Front        | React 18 + Vite, React Router                     |
| Back         | Supabase (Postgres, Auth, Storage) avec RLS       |
| Hébergement  | Vercel                                            |
| Paiement     | RevenueCat Web Billing (`@revenuecat/purchases-js`) |
| Style        | CSS, une feuille unique, mobile-first             |
| Vérification | Playwright, en français (`npm run verif`)         |

Aucune dépendance UI externe : tout l'habillage tient dans une feuille de
style. Le SDK de paiement, lui, pèse plus lourd que le reste de
l'application — il est donc chargé à la demande, dans son propre *chunk*, à
la seule ouverture de l'écran d'abonnement.

## Documentation

- [`docs/modele-de-donnees.md`](docs/modele-de-donnees.md) — tables, relations, RLS
- [`docs/arborescence-ecrans.md`](docs/arborescence-ecrans.md) — écrans et navigation
- [`docs/notifications.md`](docs/notifications.md) — pourquoi le rappel à
  l'ouverture plutôt que le push serveur
- [`docs/abonnement.md`](docs/abonnement.md) — plan gratuit, premium, et
  montage RevenueCat
- [`docs/rappels.md`](docs/rappels.md) — rappels de soins, périodicités, et
  fonctionnement de la cloche

> **Pages légales.** Les CGV/CGU, mentions légales et politique de
> confidentialité vivent dans `src/pages/legales/`, et toutes les
> coordonnées qu'elles affichent sont réunies dans
> [`src/lib/legal.js`](src/lib/legal.js). **Ce fichier contient des valeurs
> `À_COMPLETER` à renseigner avant toute mise en ligne** : tant qu'il en
> reste une, les trois pages affichent un bandeau d'avertissement.

## Migrations SQL, dans l'ordre

| Fichier | Contenu |
|---|---|
| `0001_schema.sql` | Tables, fonctions, RLS, bucket `photos` |
| `0002_correctif_rls_chevaux.sql` | Correctif RLS sur la création d'un cheval |
| `0003_carnet_depenses_partage.sql` | Ressenti des séances, seuil d'inactivité, protocoles de vaccin, contrainte de montant, liens publics |
| `0004_correctif_token_lien_public.sql` | Génération du jeton sans pgcrypto (invisible depuis un `security definer` sur Supabase) |
| `0005_abonnements_et_limites.sql` | Table `abonnements`, `est_premium()`, et limites du plan gratuit appliquées en RLS |
| `0006_limite_chevaux_partages.sql` | Le plan gratuit compte les chevaux rejoints par code, pas seulement les créés |
| `0007_resiliation.sql` | URL du portail client, et accès maintenu jusqu'à l'échéance après résiliation |
| `0008_ordre_evenements_webhook.sql` | Un événement RevenueCat rejoué dans le désordre ne défait plus un événement plus récent |
| `0009_depenses.sql` | Table `depenses` et module de suivi du budget, réservé au premium |
| `0010_depenses_unifiees.sql` | Le coût d'un soin alimente `depenses` par trigger ; un soin s'écrit désormais à son propre nom |
| `0011_rappels_soins.sql` | Périodicités de rappel réglables par cheval, et seuil d'alerte à 14 jours |
| `0012_rappels_in_app.sql` | Rappels dans l'application plutôt que par email : cloche, marquage comme lu, retrait de l'envoi planifié |
| `0013_participants_cheval.sql` | Borne haute du partage : dix cavaliers par cheval de particulier, aucune pour un cheval de club |
| `0014_agenda_temps_reel.sql` | Diffusion temps réel des créneaux et des soins : le calendrier d'un co-cavalier se met à jour pendant qu'un autre écrit |
| `0015_documents.sql` | Table `documents` et bucket de stockage privé pour les papiers du cheval (identification, contrat DP, assurance) |
| `0016_documents_quotas.sql` | Documents ouverts au plan gratuit avec quota (10 par cheval, 50 en premium), 5 Mo par fichier, WebP accepté |
| `0017_cours_et_indisponibilites.sql` | L'outil écurie : planning des cours avec inscriptions et liste d'attente, attribution des chevaux, indisponibilités et charge de travail |
| `0018_adhesion_club.sql` | Le modèle club : adhésion par code d'écurie, accès premium offert aux membres sur le périmètre du club, premium contextuel par cheval, pension |
| `0019_remplacement_et_couts.sql` | Remplacement d'un cheval au repos, liaison directe d'un membre par le club, et coûts de soins visibles du seul auteur et du gestionnaire |
| `0020_mes_cavaliers.sql` | La fiche d'un cheval en pension devient visible de son écurie, et l'attribution d'une monture porte son rôle (demi-pension ou cheval de club) |
| `0021_pension_confirmee.sql` | La pension se demande et l'écurie la confirme : sans acceptation du gérant, aucun cheval n'entre dans le périmètre du club ni dans son accès offert |
| `0023_roles_pension.sql` | Les formules de pension à l'attribution : demi-pension, tiers de pension, pension complète ou cheval de club — contrainte de table et fonction d'attribution élargies (la 0022 vit dans la PR des soins privés) |
| `0024_acces_pension.sql` | `a_acces_cheval()` s'ouvre à l'écurie d'une pension CONFIRMÉE : soins, carnet, créneaux, séances et documents du cheval hébergé — sans en faire la gestionnaire (fiche, suppression, indisponibilités et coûts restent au propriétaire) |
| `0025_motif_vacances.sql` | « Vacances » rejoint les motifs d'indisponibilité autorisés — un bloc de plusieurs jours annoncé à l'avance, distinct du repos du quotidien |
| `0026_serie_cours.sql` | `cours` gagne `serie_id` : les occurrences d'une récurrence hebdomadaire le partagent, pour les supprimer toutes d'un coup plutôt qu'une par une |

> Écrire du SQL pour Supabase : les extensions y vivent dans le schéma
> `extensions`, pas dans `public`. Une fonction `security definer` déclarée
> `set search_path = public` ne voit donc **aucune** fonction d'extension.
> Préférer les fonctions du cœur de PostgreSQL — `gen_random_uuid()` plutôt
> que `gen_random_bytes()` de pgcrypto.

## Mise en route

### 1. Créer le projet Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Ouvrez **SQL Editor** et exécutez les fichiers de
   [`supabase/migrations/`](supabase/migrations/) **dans l'ordre de leur
   numéro**. `0001_schema.sql` crée les tables, les fonctions, les politiques
   RLS et le bucket de stockage `photos` ; les migrations suivantes sont des
   correctifs à appliquer par-dessus.

   > Sur une base déjà installée avant le correctif `0002`, la création d'un
   > cheval échoue avec « new row violates row-level security policy for table
   > "chevaux" ». Exécuter `0002_correctif_rls_chevaux.sql` suffit à la
   > réparer, sans toucher aux données existantes.
3. Dans **Authentication → Providers**, laissez « Email » activé. Pour la
   connexion Google (optionnelle), activez le provider Google et renseignez
   vos identifiants OAuth.
4. Pendant le développement, vous pouvez désactiver « Confirm email » dans
   **Authentication → Sign In / Providers** pour vous connecter immédiatement
   après l'inscription.

### 2. Lancer l'application en local

```bash
cp .env.example .env    # puis renseignez l'URL et la clé anon du projet
npm install
npm run dev
```

L'application est servie sur http://localhost:5173.

### 3. Déployer sur Vercel

1. Importez le dépôt dans Vercel (framework détecté : Vite).
2. Ajoutez les variables d'environnement `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY`.
3. Déployez. Le fichier `vercel.json` gère déjà la réécriture des routes
   côté client.
4. Dans Supabase → **Authentication → URL Configuration**, ajoutez l'URL de
   production dans « Site URL » et un motif large dans « Redirect URLs »
   (`https://licol.app/**`). Sans cela, ni le retour de la connexion Google
   ni le lien de réinitialisation de mot de passe
   (`https://licol.app/reinitialisation`) n'aboutissent : Supabase renvoie
   alors sur la Site URL.
5. Pour l'abonnement, ajoutez `VITE_REVENUECAT_CLE_PUBLIQUE`. Sans cette
   variable, le paywall tourne en bac à sable et l'annonce à l'écran :
   voir [`docs/abonnement.md`](docs/abonnement.md).

## Scripts

| Commande          | Effet                                             |
|-------------------|---------------------------------------------------|
| `npm run dev`     | Serveur de développement                          |
| `npm run build`   | Build de production dans `dist/`                  |
| `npm run preview` | Prévisualise le build                             |
| `npm run icones`  | Régénère les icônes PNG de la PWA                 |
| `npm run verif`   | Vérifications de fumée sur le build de production  |
| `node scripts/nettoyer-documents.mjs` | Liste (et supprime avec `--supprimer`) les fichiers orphelins du bucket `documents` — clé service_role requise |

### Avant chaque mise en ligne

```bash
npm run verif
```

Construit l'application, la sert, et ouvre **dix-sept écrans en 320 et 390 px
de large** dans un vrai navigateur : chacun doit s'afficher, sans erreur
JavaScript et sans déborder de l'écran. S'y ajoutent le carnet de santé sur
ses trois paliers d'échéance, la création d'un créneau depuis le calendrier,
les cours du club (statut, cheval attribué, désinscription), le cheval au
repos signalé sur sa fiche, et le repli du plan gratuit. Supabase n'est jamais appelé : les réponses sont
simulées dans [`tests/fumee.mjs`](tests/fumee.mjs), avec les données qui
piègent — un cheval partagé entre trois cavaliers dont deux homonymes.

Ce n'est pas une couverture complète : c'est le filet qui attrape ce qu'un
abonné verrait tout de suite. La sortie est en français, et un échec dit de
ne pas déployer.

Première fois, sur un poste neuf :

```bash
npm install
npx playwright install chromium
```


## Comment fonctionne le partage en demi-pension

1. Le propriétaire ouvre la fiche de son cheval, onglet **Fiche**, et appuie
   sur **+ Inviter** : un code à 6 caractères est généré (valable 30 jours,
   une seule utilisation).
2. L'autre cavalier saisit ce code dans **Mes chevaux → Rejoindre avec un
   code**.
3. Il est immédiatement lié au cheval, reçoit sa propre couleur, et voit le
   même calendrier, le même carnet de séances et le même suivi santé.

Le partage n'est pas limité à deux : un cheval de particulier accepte
**jusqu'à dix cavaliers**, un cheval de club autant qu'il en faut. Chaque code
d'invitation ne sert qu'une fois — il faut donc en générer un par personne, ce
qui évite qu'un code transmis dans un groupe ne fasse entrer un inconnu.

Attention à ne pas confondre avec la limite du plan gratuit, qui n'a pas
bougé : **un cheval par compte**, qu'il soit créé ou rejoint par code.

La validation du code se fait dans une fonction Postgres `security definer` :
un code invalide ne révèle jamais l'existence du cheval, et personne ne peut
lister les invitations d'un cheval auquel il n'a pas accès.

Un club procède de la même façon pour rattacher un cavalier à un cheval de
club : le cheval apparaît alors dans l'onglet « Mes chevaux » du cavalier.

## Sécurité

Toutes les tables sont protégées par Row Level Security. L'accès aux données
d'un cheval découle d'une seule règle, centralisée dans la fonction
`a_acces_cheval` : être lié au cheval via `cheval_cavaliers`, ou en être le
club propriétaire. Le détail des politiques est décrit dans
[`docs/modele-de-donnees.md`](docs/modele-de-donnees.md).

## Hors périmètre V1

Réservation et paiement de cours, facturation, messagerie interne et
notifications push. Les emails de rappel d'échéances sont prévus en V1.1
(la vue `v_echeances` fournit déjà les données nécessaires : il suffira d'une
Edge Function planifiée).

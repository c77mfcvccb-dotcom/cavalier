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
  d'invitation, un calendrier partagé par cheval, un carnet de séances et
  le suivi santé avec alertes d'échéances.
- **Côté club** : le pilotage de la cavalerie, le même suivi santé en vue
  globale triée par urgence, et le planning « qui monte quel cheval quand ».

PWA installable sur l'écran d'accueil. Interface entièrement en français.

## Stack

| Couche       | Choix                                             |
|--------------|---------------------------------------------------|
| Front        | React 18 + Vite, React Router                     |
| Back         | Supabase (Postgres, Auth, Storage) avec RLS       |
| Hébergement  | Vercel                                            |
| Style        | CSS, une feuille unique, mobile-first             |

Aucune dépendance UI externe : le poids du bundle reste sous 50 ko gzip.

## Documentation

- [`docs/modele-de-donnees.md`](docs/modele-de-donnees.md) — tables, relations, RLS
- [`docs/arborescence-ecrans.md`](docs/arborescence-ecrans.md) — écrans et navigation
- [`docs/notifications.md`](docs/notifications.md) — pourquoi le rappel à
  l'ouverture plutôt que le push serveur

## Migrations SQL, dans l'ordre

| Fichier | Contenu |
|---|---|
| `0001_schema.sql` | Tables, fonctions, RLS, bucket `photos` |
| `0002_correctif_rls_chevaux.sql` | Correctif RLS sur la création d'un cheval |
| `0003_carnet_depenses_partage.sql` | Ressenti des séances, seuil d'inactivité, protocoles de vaccin, contrainte de montant, liens publics |
| `0004_correctif_token_lien_public.sql` | Génération du jeton sans pgcrypto (invisible depuis un `security definer` sur Supabase) |

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
   production dans « Site URL » et « Redirect URLs » pour que la connexion
   Google fonctionne.

## Scripts

| Commande          | Effet                                             |
|-------------------|---------------------------------------------------|
| `npm run dev`     | Serveur de développement                          |
| `npm run build`   | Build de production dans `dist/`                  |
| `npm run preview` | Prévisualise le build                             |
| `npm run icones`  | Régénère les icônes PNG de la PWA                 |

## Comment fonctionne le partage en demi-pension

1. Le propriétaire ouvre la fiche de son cheval, onglet **Fiche**, et appuie
   sur **+ Inviter** : un code à 6 caractères est généré (valable 30 jours,
   une seule utilisation).
2. L'autre cavalier saisit ce code dans **Mes chevaux → Rejoindre avec un
   code**.
3. Il est immédiatement lié au cheval, reçoit sa propre couleur, et voit le
   même calendrier, le même carnet de séances et le même suivi santé.

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

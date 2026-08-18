# Modèle de données — Licol V1

Base Postgres hébergée par Supabase, Row Level Security activée sur **toutes**
les tables. L'authentification s'appuie sur `auth.users` (email + mot de passe,
Google en option).

## Vue d'ensemble

```
auth.users
    │ 1-1
    ▼
  profils ──────────┐ (type_compte = 'club')
    │               │
    │ N             │ club_id (cheval de club)
    ▼               ▼
cheval_cavaliers ─► chevaux ◄─── invitations (code à 6 caractères)
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
    creneaux       seances         soins
   (calendrier)   (carnet)     (santé + échéances)
```

La table **`cheval_cavaliers`** est la pièce centrale : c'est elle qui pilote
le code d'invitation, le calendrier partagé, le code couleur et les droits
d'accès. Tout le RLS des tables filles passe par elle.

---

## Tables

### `profils`
Un profil par compte. Le champ `type_compte` distingue cavalier et club ;
les deux vivent dans la même table pour qu'un club puisse être référencé
comme propriétaire d'un cheval sans duplication.

| colonne        | type            | notes                                        |
|----------------|-----------------|----------------------------------------------|
| `id`           | uuid PK         | = `auth.users.id`                            |
| `type_compte`  | text            | `cavalier` \| `club`                          |
| `nom`          | text            | nom du cavalier ou nom du club                |
| `photo_url`    | text            | Supabase Storage, bucket `photos`             |
| `niveau_galop` | int             | 1 à 7, cavalier uniquement                    |
| `telephone`    | text            |                                               |
| `ville`        | text            |                                               |
| `bio`          | text            | présentation du club / du cavalier            |
| `cree_le`      | timestamptz     |                                               |

Créé automatiquement par le trigger `on_auth_user_created` à l'inscription,
qui lit `type_compte` et `nom` dans les métadonnées d'inscription.

### `chevaux`
| colonne            | type        | notes                                       |
|--------------------|-------------|---------------------------------------------|
| `id`               | uuid PK     |                                             |
| `nom`              | text        | obligatoire                                 |
| `photo_url`        | text        |                                             |
| `date_naissance`   | date        | l'âge est calculé à l'affichage             |
| `race`             | text        |                                             |
| `robe`             | text        |                                             |
| `sexe`             | text        | `jument` \| `hongre` \| `entier`             |
| `proprietaire_nom` | text        | texte libre (le proprio n'a pas de compte)  |
| `club_id`          | uuid FK     | non nul ⇒ cheval de club                    |
| `cree_par`         | uuid FK     | profil créateur                             |
| `notes`            | text        |                                             |

Un trigger `apres_creation_cheval` crée automatiquement la liaison du créateur
(rôle `proprietaire`, ou aucune liaison si c'est un club qui crée : le club
accède à ses chevaux via `club_id`).

### `cheval_cavaliers` — table de liaison
| colonne       | type    | notes                                                    |
|---------------|---------|----------------------------------------------------------|
| `cheval_id`   | uuid FK |                                                          |
| `cavalier_id` | uuid FK | profil de type `cavalier`                                |
| `role`        | text    | `proprietaire` \| `demi_pension` \| `cavalier_club`        |
| `couleur`     | text    | hérité — voir la note ci-dessous                         |

> La colonne `couleur` n'est plus lue par l'application. Elle attribuait une
> couleur par paire (cheval, cavalier), si bien qu'un même cavalier changeait
> de teinte d'un cheval à l'autre. La couleur est désormais calculée dans
> `src/lib/couleurs.js` : dérivée de l'identifiant du cavalier — donc la même
> partout — puis décalée si un co-cavalier du même cheval l'occupe déjà.
> La colonne est conservée telle quelle : la supprimer n'apporterait rien et
> demanderait une migration.

Unicité sur `(cheval_id, cavalier_id)`.

#### Combien de cavaliers par cheval

**Dix au plus pour un cheval de particulier ; aucune limite pour un cheval de
club** (migration 0013, fonction `participants_max`). Rien n'obligeait à
plafonner — la base tient sans peine un cheval à trente cavaliers, et six
fonctionnaient déjà avant cette migration. La borne existe pour deux raisons
plus concrètes : la palette du calendrier compte dix couleurs, et un code
d'invitation qui circule dans un groupe de messagerie n'a plus de garde-fou
sans elle. Une cavalerie d'école, elle, tourne couramment avec vingt
cavaliers : c'est son usage normal, d'où l'exemption des chevaux de club.

Le verrou est un trigger `BEFORE INSERT`, et non une politique RLS, pour la
même raison qu'en 0006 : `rejoindre_par_code()` est en `security definer` et
passe outre le RLS. `rejoindre_par_code()` et `generer_code_invitation()`
vérifient en plus explicitement, ce qui évite de consommer une invitation
vouée à échouer — un code émis avant que le cheval ne se remplisse reste
valable si une place se libère.

**Cette limite n'a rien à voir avec celle du plan gratuit.** L'une compte les
cavaliers d'un cheval, l'autre les chevaux d'un compte : le plan gratuit
reste à **un cheval par compte, créé ou rejoint** (migration 0006).

### `documents` — pièces administratives du cheval

| colonne         | type    | notes                                                |
|-----------------|---------|-------------------------------------------------------|
| `cheval_id`     | uuid FK |                                                       |
| `categorie`     | text    | `identification` \| `contrat_dp` \| `assurance` \| `autre` |
| `nom`           | text    | nom affiché, modifiable à la saisie                  |
| `chemin`        | text    | chemin dans le bucket `documents`, unique             |
| `taille_octets` | int     |                                                       |
| `type_mime`     | text    |                                                       |
| `ajoute_par`    | uuid FK | profil de l'auteur                                    |

Fonctionnalité **premium** (migration 0015), sur le même modèle que le
carnet de soins : la politique RLS conditionne l'accès, pas l'interface.

**Bucket privé**, à la différence de `photos` : une carte d'immatriculation
n'a pas vocation à être accessible par une URL publique devinable. Le
téléchargement passe par une URL signée (`createSignedUrl`, 60 secondes),
dont l'émission est elle-même soumise au RLS de `storage.objects`.

Convention de chemin : `{cheval_id}/{uuid}.{extension}`. Le premier segment
porte le cheval, ce qui permet à la politique de stockage de retrouver
`a_acces_cheval()` à partir du seul nom de fichier — `storage.objects` ne
connaît ni cheval, ni relation, seulement un chemin :

```sql
using (
  bucket_id = 'documents'
  and est_premium(auth.uid())
  and a_acces_cheval((storage.foldername(name))[1]::uuid, auth.uid())
)
```

Pas de politique `update` : un document se remplace (suppression puis
nouvel envoi), il ne se corrige pas — ça évite qu'un fichier et sa ligne de
métadonnées divergent silencieusement.

### `invitations`
| colonne          | type   | notes                                     |
|------------------|--------|-------------------------------------------|
| `code`           | text   | 6 caractères, unique, sans I/O/0/1        |
| `cheval_id`      | uuid   |                                           |
| `role_propose`   | text   | rôle attribué à celui qui saisit le code  |
| `expire_le`      | timestamptz | 30 jours par défaut                  |
| `utilisations` / `utilisations_max` | int | 1 par défaut          |
| `actif`          | bool   |                                           |

Le code n'est **jamais** lisible par un non-membre : la validation passe par
la fonction `rejoindre_par_code(code)` en `security definer`, qui vérifie
l'expiration, le quota, l'absence de doublon, puis crée la liaison.

### `creneaux` — calendrier partagé
| colonne       | type        | notes                                                |
|---------------|-------------|------------------------------------------------------|
| `cheval_id`   | uuid        |                                                      |
| `cavalier_id` | uuid        | qui monte — donne la couleur affichée                |
| `debut` / `fin` | timestamptz |                                                    |
| `type`        | text        | `monte` \| `seance` \| `balade` \| `cours` \| `soin` \| `autre` |
| `titre`, `notes` | text     |                                                      |

Tous les cavaliers liés au cheval (et le club propriétaire) voient les mêmes
créneaux. Chacun ne modifie que les siens ; le propriétaire et le club peuvent
tout modifier.

### `seances` — carnet de séances
`cheval_id`, `cavalier_id`, `date`, `type` (`dressage`, `obstacle`, `balade`,
`longe`, `cross`, `plat`, `autre`), `duree_min`, `notes`. Visible par tous les
cavaliers liés.

### `soins` — table unique santé/soins
C'est le choix structurant demandé : **une seule table** pour ferrure, véto,
vaccin, vermifuge, ostéo, dentiste.

| colonne              | type | notes                                                      |
|----------------------|------|------------------------------------------------------------|
| `cheval_id`          | uuid |                                                            |
| `type`               | text | `ferrure` \| `veterinaire` \| `vaccin` \| `vermifuge` \| `osteopathe` \| `dentiste` \| `autre` |
| `date_realisee`      | date |                                                            |
| `prochaine_echeance` | date | nullable — c'est ce champ qui alimente les alertes         |
| `praticien`, `produit`, `notes` | text |                                                 |
| `cout`               | numeric |                                                         |

À la saisie, l'application pré-remplit `prochaine_echeance` avec l'intervalle
habituel du type (ferrure 6 semaines, vermifuge 3 mois, vaccin 1 an, dentiste
1 an, ostéo 6 mois) — modifiable.

### Vue `v_echeances`
Vue en `security_invoker` (le RLS des tables sous-jacentes s'applique) qui
expose chaque soin ayant une `prochaine_echeance`, avec le nom et la photo du
cheval, le nombre de jours restants et un `statut` :

- `retard` — échéance dépassée
- `urgent` — sous 7 jours
- `bientot` — sous 30 jours
- `ok` — au-delà

C'est la source unique du tableau de bord cavalier **et** du tableau de bord
cavalerie du club, triée par urgence.

---

## Sécurité (RLS)

Deux fonctions `security definer` évitent la récursion de politiques et
centralisent la règle d'accès :

- `a_acces_cheval(cheval, user)` — vrai si l'utilisateur est lié au cheval
  via `cheval_cavaliers`, **ou** s'il est le club propriétaire (`club_id`).
- `est_gestionnaire_cheval(cheval, user)` — vrai si l'utilisateur est
  `proprietaire` du cheval ou le club propriétaire. Contrôle la modification
  de la fiche, la génération d'invitations et le retrait d'un cavalier.

Toutes les tables filles (`creneaux`, `seances`, `soins`, `cheval_cavaliers`,
`invitations`) sont filtrées par `a_acces_cheval`. Conséquence directe : un
cheval n'expose ses données qu'aux cavaliers liés et/ou au club propriétaire,
comme demandé.

### Le cas particulier de la politique SELECT sur `chevaux`

```sql
using (cree_par = auth.uid() or club_id = auth.uid() or a_acces_cheval(id, auth.uid()))
```

Les deux premiers termes ne sont pas redondants, ils sont **nécessaires**.
PostgreSQL applique aussi la politique SELECT à la ligne renvoyée par un
`INSERT ... RETURNING` — ce que fait le client à chaque création de cheval
(`.insert().select().single()`). À cet instant précis :

- la liaison dans `cheval_cavaliers` n'existe pas encore, puisqu'elle est
  créée par un trigger `AFTER INSERT` qui ne s'est pas déclenché ;
- la nouvelle ligne n'est pas visible à une sous-requête sur `chevaux`, car
  une ligne insérée par la commande en cours est hors de son propre snapshot.
  Le test `club_id` échoue donc lui aussi s'il passe par `a_acces_cheval`.

Tester d'abord `cree_par` et `club_id`, qui sont des colonnes de la ligne
candidate elle-même, est la seule façon de laisser passer la création tout en
gardant le cloisonnement pour toutes les autres lectures.

`profils` n'est lisible que par soi-même et par les personnes avec qui on
partage au moins un cheval (fonction `partage_un_cheval`) — nécessaire pour
afficher les noms et couleurs dans le calendrier.

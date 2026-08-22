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
| `role`        | text    | `proprietaire` \| `demi_pension` \| `tiers_pension` \| `pension_complete` \| `cavalier_club` (0023) |
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
reste à **un cheval par compte, créé ou rejoint** (migration 0006) — les
chevaux de club en sont exclus depuis la 0018.

**Liaison directe et remplacement** (migrations 0019/0020/0023). Le club
peut lier un de SES membres à un de SES chevaux en un geste, sans code, par
`lier_membre_au_cheval()` — l'invitation reste la porte normale quand c'est
le cavalier qui agit. La fonction pose aussi le **rôle** de l'attribution,
la formule réelle de l'écurie : `demi_pension`, `tiers_pension`,
`pension_complete` ou `cavalier_club` — jamais `proprietaire`, qui se
constate à la création du cheval ; rappelée sur une liaison existante, elle
ajuste le rôle au lieu d'échouer. La colonne `remplacement_de` (uuid → chevaux,
nullable) mémorise le cheval indisponible qu'une liaison remplace : elle
porte le badge « Remplace X » sur la fiche, et la levée de
l'indisponibilité propose de clore d'un coup les remplacements qui
pointaient vers le cheval revenu.

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

Module **freemium** (migrations 0015 puis 0016) : accessible à tous les
cavaliers liés au cheval, borné par un quota — **10 documents par cheval en
gratuit, 50 en premium**. Le quota se compte par cheval, la limite dépend du
plan de celui qui ajoute ; c'est un trigger `BEFORE INSERT`
(`verifier_quota_documents`, code d'erreur `QUOTA_DOCUMENTS`) qui l'impose,
pour les mêmes raisons qu'en 0006 : il couvre tous les chemins d'écriture et
son message se traduit à l'écran.

**5 Mo par fichier**, verrouillés par le `file_size_limit` du bucket — la
borne de l'interface n'est qu'un message plus aimable. Les images (JPG, PNG,
WebP, HEIC) sont compressées côté client avant l'envoi : 1200 px sur le plus
grand côté, JPEG qualité 80. Une photo de téléphone de 8 Mo finit à quelques
centaines de kilooctets ; la limite ne mord en pratique que sur les PDF, qui
partent tels quels.

**Suppression et orphelins.** Supprimer un cheval efface ses lignes en
cascade, mais seule l'API Storage détruit réellement un fichier :
l'application purge donc le dossier du cheval **avant** de le supprimer
(tant que le RLS de stockage l'y autorise encore), en meilleur effort. Le
script `scripts/nettoyer-documents.mjs` (clé service_role) liste puis, avec
`--supprimer`, efface les fichiers orphelins et les lignes fantômes.

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

> **Le coût est confidentiel** (migration 0019) : visible du seul **auteur
> du soin** et du **gestionnaire du cheval**. Le RLS ne masquant que des
> lignes, le verrou est un droit de colonne — le rôle client n'a plus le
> SELECT sur `cout`, et la lecture passe par la vue **`v_soins`**, qui
> rejoue la politique de lignes de la table et ne rend le coût qu'à qui y a
> droit. La demi-pensionnaire d'un cheval de club ne voit donc plus la
> facture du vétérinaire de l'écurie ; `v_echeances` et la cloche, qui ne
> lisent pas cette colonne, ne changent pas. Attention : toute migration
> future qui referait un `grant select` global sur `soins` rouvrirait la
> colonne.

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

### `membres_club` — l'adhésion à une écurie (migration 0018)

| colonne | type | notes |
|---|---|---|
| `club_id` | uuid FK | profil de type `club` |
| `cavalier_id` | uuid FK | unique par club ; type `cavalier` (trigger) |
| `siege` | boolean | vrai par défaut : l'adhésion donne l'accès offert d'office |
| `siege_depuis` | timestamptz | rafraîchie quand le siège est rendu (trigger) |

L'adhésion est la relation de base du modèle club : on rejoint l'écurie
(avec son code), puis on est lié à des chevaux. `est_cavalier_du_club()`
(0017) lit désormais cette table — cours et écrans existants ont basculé
sans réécriture, et une reprise a créé les adhésions des cavaliers déjà
liés à un cheval de club. **Sièges illimités** : le gérant ne gère pas un
quota, il retire (et rend) l'accès membre par membre. On n'entre que par
`rejoindre_club(code)` — aucune politique d'INSERT ; le membre se retire
lui-même, le gérant peut retirer n'importe qui.

### `codes_adhesion` — le code d'écurie

Une ligne par club (`club_id` clé primaire) : régénérer **remplace**, donc
l'ancien code meurt mécaniquement. Multi-usage et longue durée — à la
différence des `invitations`, par cheval et à usage unique. Lisible par le
seul gérant ; la saisie passe par `rejoindre_club()` en `security definer`,
et un code faux ne révèle jamais l'existence de l'écurie.

### `chevaux.ecurie_id` — la pension (demandée, puis confirmée)

`club_id` signifie **propriété** et donne les droits de gestionnaire ;
`ecurie_id` signifie **stationné chez** — il sert au périmètre premium et,
depuis la 0020, à la **visibilité de la fiche** : l'écurie voit les chevaux
en pension chez elle (sans quoi « Mes cavaliers » afficherait des pensions
fantômes). Depuis la **0024**, une pension **confirmée** entre aussi dans
`a_acces_cheval()` : l'écurie lit et écrit les soins du cheval qu'elle
héberge (c'est ce qui fait vivre les tâches de son Accueil), voit son
calendrier, ses séances et ses documents. Elle n'en devient pas pour
autant **gestionnaire** : modifier la fiche, supprimer le cheval, poser
une indisponibilité, générer le lien public et lire les coûts des soins
d'autrui restent au propriétaire — et une demande de pension en attente
n'ouvre rien. Le propriétaire rattache son
cheval (trigger : uniquement une écurie dont il est membre, sinon
`ECURIE_NON_MEMBRE`) ; lui ou le gérant détachent (`detacher_de_ecurie()`).

**La pension est une demande** (migration 0021) : `pension_confirmee`,
fausse par défaut et remise à faux à chaque changement d'écurie, ne passe
à vrai que par `confirmer_pension()` — sous l'identité de l'écurie visée,
le trigger refuse toute auto-confirmation du propriétaire
(`PENSION_A_CONFIRMER`). Tant qu'elle n'est pas acceptée, la pension
n'ouvre **rien** : `couverture_club()` l'ignore, le cheval ne compte pas
dans le périmètre premium. Le gérant voit la demande sur « Mes
cavaliers » et l'accepte ou la refuse (le refus = détacher).

> **Deux clés de `cheval_cavaliers` vers `chevaux`** depuis la 0019
> (`cheval_id` et `remplacement_de`) : toute jointure PostgREST entre ces
> deux tables doit nommer sa colonne — `cheval:cheval_id(...)`,
> `cheval_cavaliers!cheval_id(count)` — sous peine de « more than one
> relationship was found ».

### Le premium contextuel

`est_premium(uid)` (l'abonnement du compte) reste, mais les politiques
posent désormais la question par cheval :

```
premium_cheval(cheval, user) = est_premium(user)
                            ou couverture_club(cheval, user)

couverture_club = membre + siège + abonnement du CLUB actif
                + cheval dans le périmètre (club_id OU ecurie_id)
```

Rien n'est jamais matérialisé — aucun drapeau premium posé sur le
cavalier : chaque contrôle relit adhésion, siège et abonnement du club à
l'instant T. La perte d'un siège ou l'expiration de l'abonnement club
ferment l'accès immédiatement **sans toucher aux données**, et tout
revient dès qu'un siège est réattribué ou qu'un abonnement personnel
arrive ; l'accès le plus favorable gagne toujours. Sont contextuelles :
soins, réglages de rappels, borne du calendrier gratuit, dépenses (sur les
chevaux couverts seulement — jamais la comptabilité sans cheval), et le
quota de documents (10/50). L'abonnement du club vit dans la même table
`abonnements`, écrit par le même webhook ; le produit dédié à prix fixe
restera à créer côté RevenueCat/Stripe.

Deux conséquences de bord : les chevaux de club ne comptent plus dans la
limite « un cheval » du plan gratuit (la relation d'école est l'affaire du
club), et `profils_select` s'étend au lien gérant ↔ membre
(`lien_club()`) pour que la liste des membres ne soit pas aveugle.
L'interface interroge `mes_adhesions()` — le RLS d'abonnements ne
laisserait pas un membre lire l'abonnement de son club, la fonction répond
sans rien exposer d'autre.

### `indisponibilites` — le cheval au repos (migration 0017)

| colonne     | type | notes                                                       |
|-------------|------|-------------------------------------------------------------|
| `cheval_id` | uuid |                                                             |
| `motif`     | text | `boiterie` \| `repos` \| `osteo` \| `veterinaire` \| `vacances` \| `autre` (0025) |
| `debut`     | date | aujourd'hui par défaut                                      |
| `fin`       | date | **nullable** — vide = jusqu'à nouvel ordre                  |
| `note`, `cree_par` | |                                                       |

En **dates**, pas en horodatages : « au repos jusqu'au 25 » est une réalité
de journées. Tous les cavaliers du cheval la voient ; seul le gestionnaire
(propriétaire ou club) la pose et la lève. « Lever » ferme l'indisponibilité
(`fin` = aujourd'hui) au lieu de l'effacer : l'historique dira pourquoi le
cheval n'a pas tourné cette semaine-là.

### `cours` — le planning du club (migration 0017)

| colonne      | type        | notes                                        |
|--------------|-------------|----------------------------------------------|
| `club_id`    | uuid FK     | profil de type `club`                        |
| `debut`/`fin`| timestamptz |                                              |
| `discipline` | text        | `dressage` \| `obstacle` \| `cross` \| `balade` \| `poney` \| `autre` |
| `niveau`     | text        | libre — « Galop 3-4 »                        |
| `places`     | int         | 1 à 30, 6 par défaut                         |
| `moniteur`   | text        | simple texte : en faire un compte serait un troisième rôle, prématuré |
| `notes`      | text        |                                              |
| `serie_id`   | uuid        | nullable — partagé par toutes les occurrences d'une récurrence hebdomadaire posée en une fois (0026), permet de les supprimer ensemble ; nul pour un cours seul |

Un cours n'est **pas** un créneau : le créneau lie un cavalier à un cheval,
le cours est une **capacité** sur laquelle des cavaliers s'inscrivent et
reçoivent chacun un cheval. Visible du club et de ses cavaliers — est « du
club » quiconque est lié à au moins un de ses chevaux
(`est_cavalier_du_club()`, pas de table d'adhésion : elle divergerait de la
réalité au premier départ).

### `inscriptions_cours` — inscriptions, attribution, pointage

| colonne       | type | notes                                                 |
|---------------|------|-------------------------------------------------------|
| `cours_id`    | uuid |                                                       |
| `cavalier_id` | uuid | unique par cours                                      |
| `cheval_id`   | uuid | **l'attribution**, posée par le club, jamais par le cavalier |
| `statut`      | text | `inscrit` \| `attente` — décidé par la base, pas par le client |
| `present`     | bool | nullable — le pointage du jour J                      |

Trois triggers portent les règles :

- `placer_inscription` (BEFORE INSERT) compte les inscrits sous verrou de la
  ligne du cours et place le nouveau venu — `inscrit` s'il reste une place,
  `attente` sinon. Deux inscriptions simultanées sur la dernière place ne
  peuvent pas passer toutes les deux.
- `promouvoir_attente` (AFTER DELETE) : une place se libère → le plus ancien
  de la liste d'attente monte, automatiquement.
- `verifier_cheval_cours` (BEFORE INSERT/UPDATE de `cheval_id`) refuse un
  cheval d'un autre club (`CHEVAL_HORS_CLUB`) ou indisponible à la date du
  cours (`CHEVAL_INDISPONIBLE`) — l'interface prévient, la base tranche.

Côté RLS, le cavalier s'inscrit lui-même **les mains vides** (ni cheval ni
présence à l'insertion) et peut se désinscrire ; attribution, pointage et
inscriptions d'office restent au club.

### Vue `v_charge_chevaux`

`security_invoker`, une ligne par cheval visible : `aujourd_hui` et
`semaine` (de J−3 à J+4) comptent créneaux du calendrier **et** attributions
de cours confondus. C'est le « Quenotte a déjà tourné trois fois » qui rend
l'attribution intelligente, affiché sur la cavalerie du club et dans le
sélecteur d'attribution.

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

# Rappels de soins

Vermifuge, ferrure, vaccin : Licol calcule la prochaine échéance à partir de
la date du soin, la signale à l'écran, et envoie un email à 14 jours, 7
jours, puis le jour même.

Fonctionnalité **premium**, vérifiée en base et non dans l'interface — la
fonction `rappels_du_jour()` (migration 0011) joint les abonnements, si bien
qu'un abonnement expiré cesse de produire des emails sans qu'aucun code
front n'ait à s'en soucier.

## Périodicités

| Type | Par défaut |
|---|---|
| Ferrure | 49 jours (7 semaines) |
| Vermifuge | 120 jours (4 mois) |
| Vaccin | 365 jours |
| Dentiste | 365 jours |
| Ostéopathe | 365 jours |
| Vétérinaire, Autre | aucune |

Ce sont des usages courants, pas des règles vétérinaires : un cheval au pré
et un cheval de concours ne suivent pas le même rythme. D'où le réglage par
cheval, dans **fiche du cheval → Soins → 🔔**.

Vétérinaire et « autre » n'ont volontairement pas de périodicité : une
visite n'appelle pas mécaniquement la suivante, et lui inventer un rythme
produirait des rappels sans objet. La date reste saisissable à la main.

**Le réglage porte sur le cheval, pas sur le compte.** Il décrit le rythme
de soins d'un animal, que tous ses cavaliers partagent — un changement est
donc visible par le co-cavalier. C'est l'inverse du choix fait pour les
dépenses, et pour la raison inverse : une dépense est payée par quelqu'un,
un rythme de parage appartient au cheval.

Les valeurs sont écrites à deux endroits — `TYPES_SOIN`
(`src/lib/constantes.js`) et `intervalle_soin_defaut()` en SQL. Elles
doivent rester alignées, sinon le formulaire propose une date que le rappel
par email ne confirme pas.

### Ordre de précision

Quand plusieurs périodicités pourraient s'appliquer, la plus spécifique
gagne :

1. le **protocole de vaccin** choisi (primo à 30 jours, tétanos à 3 ans…) ;
2. le **réglage du cheval** ;
3. la **valeur par défaut** du type.

Le protocole passe devant le réglage du cheval : une primo-vaccination se
rappelle à 30 jours quel que soit le rythme annuel réglé par ailleurs.

## Recalage automatique

Enregistrer un soin ne demande **rien à effacer sur le précédent**. La vue
`v_echeances` ne retient, pour chaque couple (cheval, type), que le soin le
plus récent portant une échéance. Une ferrure de juillet supersède donc
celle de juin, et l'ancienne échéance cesse d'exister pour l'affichage
comme pour les emails.

C'est aussi ce qui garantit qu'un cheval ne reçoit jamais deux rappels de
ferrure pour deux soins successifs.

## Code couleur

| État | Couleur | Règle |
|---|---|---|
| En retard | rouge | échéance dépassée |
| À prévoir | orange | sous 14 jours |
| À jour | vert | au-delà |

Trois états au lieu de quatre : le palier « ce mois-ci » diluait l'alerte.
Une échéance à 29 jours n'appelle aucune action, et la signaler apprend à
ignorer les signalements.

Les échéances à jour **restent affichées** sur l'accueil. Sans le vert, un
carnet en règle serait indistinguable d'un carnet vide.

Un rappel coupé sur un cheval sort de la vue : un seul interrupteur, un seul
effet. Le soin reste évidemment lisible dans le carnet.

## Emails

### Ce que reçoit le cavalier

Un **seul email par personne et par jour**, quel que soit le nombre
d'échéances. Trois emails le même matin pour trois chevaux d'une même
écurie, ce sont trois occasions de se désabonner.

> **Ivoire — vermifuge à prévoir le 30 août 2026**

Tous ceux qui s'occupent du cheval sont prévenus : les cavaliers rattachés
comme le club qui l'héberge.

Le consentement est stocké dans `profils.rappels_email`, activé par défaut
et coupable depuis **Profil**. Un rappel non sollicité reste un email non
sollicité.

### Pas de doublon, jamais

La table `rappels_envoyes` journalise chaque envoi. Sans elle, un cron
rejoué — reprise après incident, deux déclenchements le même jour —
réexpédierait tout.

La clé porte l'échéance elle-même : si la date est corrigée, le rappel
redevient légitime et repart. Le journal est écrit **après** l'envoi et
seulement en cas de succès : un email qui n'est pas parti doit repartir
demain.

## Mise en place

### 1. Migration

Exécuter `0011_rappels_soins.sql` dans le SQL Editor.

### 2. Service d'email

Le code utilise **Resend**, pour sa compatibilité directe avec les Edge
Functions Deno et son domaine de test immédiat. Changer de prestataire ne
touche qu'au `fetch` de `supabase/functions/rappels-soins/index.ts`.

1. Créer un compte sur [resend.com](https://resend.com) et une clé API.
2. Vérifier le domaine d'envoi. Tant que ce n'est pas fait, Resend
   n'autorise l'expédition que vers votre propre adresse, avec
   `onboarding@resend.dev` en expéditeur — suffisant pour tester, pas pour
   la production.

### 3. Déployer la fonction

```bash
supabase functions deploy rappels-soins --no-verify-jwt
supabase secrets set RESEND_API_KEY=<clé Resend>
supabase secrets set RAPPELS_EXPEDITEUR="Licol <rappels@votre-domaine.fr>"
supabase secrets set RAPPELS_SECRET=$(openssl rand -hex 32)
supabase secrets set LICOL_URL=https://votre-domaine.fr
```

`--no-verify-jwt` est nécessaire : l'appel vient de pg_cron, pas d'un
navigateur. L'authentification repose sur `RAPPELS_SECRET`, comparé à
l'octet près à l'en-tête `Authorization` — sans préfixe `Bearer`.

### 4. Planifier l'appel

Dans le SQL Editor, activer les extensions puis programmer l'envoi. Le cron
est en **UTC** : `0 7 * * *` correspond à 9 h en heure d'été française, 8 h
en hiver.

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'rappels-soins-quotidien',
  '0 7 * * *',
  $$
  select net.http_post(
    url     := 'https://<ref>.supabase.co/functions/v1/rappels-soins',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', '<RAPPELS_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
```

> Le secret apparaît en clair dans la définition du job, lisible par tout
> rôle ayant accès à `cron.job`. C'est acceptable ici — il ne protège qu'un
> déclenchement d'envoi, pas des données — mais ne réutilisez pas cette
> valeur ailleurs.

### 5. Vérifier

```sql
-- Ce qui partirait aujourd'hui
select * from rappels_du_jour();

-- Le job est-il planifié ?
select jobname, schedule, active from cron.job;

-- Les derniers déclenchements
select start_time, status, return_message
from cron.job_run_details
order by start_time desc limit 10;
```

Un déclenchement manuel, pour ne pas attendre le lendemain :

```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/rappels-soins" \
  -H "Authorization: <RAPPELS_SECRET>" \
  -H 'Content-Type: application/json' -d '{}'
```

La réponse compte les destinataires, les envois et les échecs. `{"destinataires":0}`
signifie simplement qu'aucune échéance ne tombe sur un jalon aujourd'hui —
`rappels_du_jour()` le confirme.

## Points à trancher

- **Les jalons sont figés** à 14 / 7 / 0 jours. Les rendre réglables
  supposerait une colonne de plus et un écran ; l'usage dira si le besoin
  existe.
- **Aucun rappel de relance après l'échéance.** Un vermifuge oublié cesse
  d'être signalé par email le lendemain, alors qu'il reste rouge à l'écran.
  Une relance hebdomadaire tant que le soin n'est pas fait se défend.
- **Le club reçoit un email par cheval de sa cavalerie**, regroupés en un
  seul message. Sur une écurie de trente chevaux, le message peut être
  long : un format tableau, ou une périodicité hebdomadaire pour les
  comptes club, mériterait d'être étudié.

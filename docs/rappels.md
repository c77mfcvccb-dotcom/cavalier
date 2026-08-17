# Rappels de soins

Vermifuge, ferrure, vaccin : Licol calcule la prochaine échéance à partir de
la date du soin, la signale sur l'accueil, et la remonte dans une cloche
présente sur tous les écrans.

Fonctionnalité **premium**, vérifiée en base et non dans l'interface : les
vues s'appuient sur `soins`, dont les politiques RLS exigent déjà
l'abonnement. Un compte qui repasse en gratuit cesse de voir la cloche sans
qu'aucun code front n'ait à s'en soucier.

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
doivent rester alignées, sinon le formulaire propose une date que la cloche
ne confirme pas.

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
celle de juin, et l'ancienne échéance cesse d'exister — pour l'accueil comme
pour la cloche.

C'est aussi ce qui garantit qu'un cheval ne produit jamais deux rappels de
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

> Le seuil des 14 jours vit dans `SEUIL_URGENCE_JOURS`
> (`src/lib/constantes.js`) et dans `v_echeances`. Il a été écrit en clair
> dans deux fichiers avec deux valeurs différentes — 7 d'un côté, 14 de
> l'autre — et l'onglet Soins produisait en plus un quatrième statut qui
> n'existait plus, ce qui vidait l'écran. D'où la constante partagée, et le
> repli sur « à jour » partout où un libellé est lu.

Les échéances à jour **restent affichées** sur l'accueil. Sans le vert, un
carnet en règle serait indistinguable d'un carnet vide. La cloche, elle, ne
retient que le rouge et l'orange : une échéance à jour n'est pas un rappel.

Un rappel coupé sur un cheval sort des deux vues : un seul interrupteur, un
seul effet. Le soin reste évidemment lisible dans le carnet.

## La cloche

Dans l'en-tête, sur tous les écrans. Le badge compte les rappels **non
lus** ; le panneau les montre tous, retards d'abord puis par date. Chaque
ligne mène à l'onglet Soins du cheval concerné.

### Pourquoi pas l'email

Un envoi planifié supposait un prestataire d'emailing, un cron et quatre
secrets — trois dépendances externes pour un service que la cloche rend sans
aucune. L'email avait aussi un défaut propre : un rappel parti de travers ne
se rattrape pas, quand un affichage se corrige au rechargement suivant.

Le revers est assumé et figure dans les points à trancher : rien ne prévient
plus en dehors de l'application.

### Marquer comme lu

`rappels_lus` (migration 0012) porte les accusés de lecture. La clé comprend
l'échéance elle-même : quand une ferrure est refaite, la nouvelle échéance
n'a jamais été lue, et la cloche redevient légitimement active.

Le marquage est **personnel**, contrairement aux périodicités qui
appartiennent au cheval : sur un cheval en demi-pension, que l'un ait pris
connaissance du rappel ne dit rien de l'autre.

Marquer comme lu retire le rappel **du compteur, pas de la liste**. Une
échéance reste à traiter tant que le soin n'est pas enregistré — « j'ai vu »
n'est pas « c'est fait ».

### Une seule définition de l'urgence

`v_rappels` est bâtie sur `v_echeances`, où vivent déjà le seuil des 14
jours, le dédoublonnage par type et le respect des rappels coupés. Deux
définitions de « ce qui est urgent » auraient divergé au premier
ajustement.

## Mise en place

Exécuter `0011_rappels_soins.sql` puis `0012_rappels_in_app.sql` dans le SQL
Editor. **C'est tout** : aucun service tiers, aucun cron, aucun secret.

Si un cron `rappels-soins-quotidien` avait été planifié avant la bascule :

```sql
select cron.unschedule('rappels-soins-quotidien');
```

Contrôle :

```sql
select * from v_rappels;            -- ce que la cloche affiche
select count(*) from rappels_lus;   -- accusés de lecture
```

## Points à trancher

- **Le seuil est figé à 14 jours.** Le rendre réglable supposerait une
  colonne de plus et un écran ; l'usage dira si le besoin existe.
- **Rien ne prévient hors de l'application.** La cloche suppose une visite ;
  un vermifuge oublié trois semaines ne se rappelle à personne. C'est le
  prix de l'abandon de l'email.
- **Redondance avec le bandeau de rappel** (`src/composants/Rappels.jsx`),
  qui affiche le même décompte en haut de l'écran à l'ouverture. Le
  supprimer au profit de la seule cloche se défend — il porte toutefois la
  pastille de l'icône PWA et les notifications locales, que la cloche ne
  fait pas.

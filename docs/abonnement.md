# Plan gratuit et Premium

## Ce que limite le plan gratuit

| Limite | Règle |
|---|---|
| Chevaux | 1 cheval **au total**, créé ou rejoint avec un code |
| Carnet de santé | inaccessible, lecture comprise |
| Calendrier | aucun créneau créé ni déplacé au-delà du dimanche courant |
| Dépenses | module inaccessible, lecture comprise |

> Les dépenses sont **cloisonnées par compte** : sur un cheval en
> demi-pension, chaque cavalier ne voit et ne totalise que ce qu'il a
> lui-même engagé. La règle est posée en RLS (`profil_id = auth.uid()`),
> pas dans l'interface.

Premium : **4,99 €/mois** ou **39,99 €/an**, après **7 jours d'essai gratuit**.

## Les limites sont appliquées par la base, pas par l'interface

C'est le point central. Une limite posée dans React se contourne en ouvrant
la console du navigateur et en appelant l'API PostgREST directement. Les
règles vivent donc dans les politiques RLS
([`0005_abonnements_et_limites.sql`](../supabase/migrations/0005_abonnements_et_limites.sql)),
et s'imposent à `curl` comme à l'application.

```sql
-- Création d'un cheval
with check (cree_par = auth.uid()
            and (est_premium(auth.uid()) or nb_chevaux_du_compte(auth.uid()) < 1))

-- Créneau : insertion ET modification
and (est_premium(auth.uid()) or debut < fin_semaine_courante())

-- Soins : les quatre opérations, lecture comprise
using (est_premium(auth.uid()) and a_acces_cheval(cheval_id, auth.uid()))
```

Le `WITH CHECK` sur l'`UPDATE` des créneaux n'est pas décoratif : sans lui, un
compte gratuit créerait un créneau aujourd'hui puis le déplacerait au mois
suivant.

La borne de semaine est calculée en heure de Paris (`fin_semaine_courante()`),
et non en UTC : sinon un dimanche soir français tomberait déjà dans la semaine
suivante.

L'interface reprend ces règles (`src/lib/abonnement.js`) uniquement pour éviter
d'afficher une erreur technique. Quand le serveur refuse malgré tout — décalage
d'horloge, fuseau différent, quota atteint dans un autre onglet — le refus est
rattrapé et conduit à l'écran d'abonnement.

### Rejoindre par code : pourquoi un trigger et non une politique

`rejoindre_par_code()` est en `security definer` — elle **contourne le RLS**
de `cheval_cavaliers` par construction, puisqu'elle doit écrire une liaison
sur un cheval que l'appelant ne voit pas encore. Une politique n'aurait donc
rien retenu.

La limite est posée par un **trigger `BEFORE INSERT`** sur
`cheval_cavaliers` : il s'applique à tous les chemins d'écriture — la
fonction d'invitation, l'ajout direct par un gestionnaire, et tout appel qui
serait ajouté plus tard.

La fonction vérifie aussi le quota **avant** d'écrire, pour ne pas consommer
une invitation à usage unique lors d'une tentative refusée : le code reste
valable, et fonctionnera après l'abonnement.

## Ce qui reste possible en gratuit, volontairement

- **Lire et supprimer** les créneaux déjà posés au-delà de la semaine, par
  exemple après un retour au plan gratuit. Seules la création et la
  modification sont bornées.
- **Conserver ses données de soins.** Un compte qui repasse en gratuit ne perd
  rien : les lignes restent en base et redeviennent visibles au retour en
  premium.
- **Garder ses chevaux au-delà de la limite** après un retour au plan gratuit.
  Un compte qui avait trois chevaux en premium les conserve ; il ne peut
  simplement plus en ajouter. Aucune liaison n'est supprimée.

## Le premium ne peut pas s'auto-attribuer

La table `abonnements` n'a **aucune** politique d'écriture pour le rôle
`authenticated` : seulement une politique de lecture de sa propre ligne. Un
`update` depuis le navigateur touche zéro ligne, un `insert` est refusé.

Le seul chemin d'écriture est le webhook RevenueCat, qui utilise la clé
`service_role` et contourne donc le RLS. Cette clé ne doit jamais se retrouver
dans le front.

`est_premium()` refuse par ailleurs de renseigner sur le statut d'un autre
compte, pour ne pas transformer une fonction utilitaire en sonde.

## Montage RevenueCat

L'application est une PWA : le SDK mobile de RevenueCat ne s'applique pas.
C'est **RevenueCat Web Billing** qui est utilisé, avec le SDK
[`@revenuecat/purchases-js`](https://www.npmjs.com/package/@revenuecat/purchases-js).
Le paiement se déroule **dans la page**, dans un tunnel hébergé par
RevenueCat (Stripe derrière) : le cavalier ne quitte plus l'application.

C'est ce qui a remplacé le **Web Purchase Link**, une simple redirection. Le
gain n'est pas cosmétique : sur une PWA installée, partir vers un domaine
tiers puis revenir signifiait rouvrir l'application, souvent sur un écran
froid, avec un `?achat=ok` en guise de fil d'Ariane. Les anciens liens
restent accueillis (le paramètre est encore lu), mais plus personne n'en
fabrique.

Surtout, `app_user_id` n'est plus un paramètre d'URL : il est porté par le
SDK, configuré avec l'identifiant Supabase du compte connecté. Le webhook
sait donc toujours quel compte créditer, sans dépendre d'une URL que
n'importe qui pouvait réécrire.

### Catalogue

| Dans RevenueCat | Valeur |
|---|---|
| Entitlement | `premium` — le seul droit vendu |
| Offering | `default` |
| Package `$rc_monthly` | produit `premium_mensuel`, 4,99 €/mois |
| Package `$rc_annual` | produit `premium_annuel`, 39,99 €/an, mis en avant |
| Essai gratuit | 7 jours, sur les deux produits |

Les identifiants produits sont repris à trois endroits : dans `OFFRES`
(`src/lib/abonnement.js`), dans le webhook, et dans la contrainte `check` de
la colonne `abonnements.produit` (migration 0005). Un renommage côté
RevenueCat casse les trois — pas seulement l'affichage.

Les **prix affichés viennent de RevenueCat**, avec la devise et le format du
visiteur. Ceux de `OFFRES` ne servent que de repli si le catalogue n'a pas pu
être chargé ; dans ce cas le bouton d'achat reste désactivé, puisqu'il n'y a
aucun package à acheter.

### Apple Pay et Google Pay

Un bouton de paiement en un geste est posé sur l'écran d'abonnement, au-dessus
du bouton classique : `presentExpressPurchaseButton` (SDK 1.52, marqué
`@experimental`). Un appui ouvre la feuille native de l'appareil ; ni
formulaire de carte, ni saisie d'adresse.

**Il ne s'affiche que si le domaine est déclaré.** Apple Pay sur le web
n'apparaît que sur un domaine vérifié auprès d'Apple. RevenueCat enregistre
automatiquement ses propres domaines hébergés (`pay.rev.cat`, `signup.cat`) —
mais l'achat se déroulant dans la page, c'est `licol.app` qu'il faut inscrire
soi-même dans les *payment method domains* de Stripe, et **par mode** :
l'enregistrement du mode test ne vaut pas pour le mode live.

Le rappel `onButtonReady(updater, walletsAvailable)` donne le verdict de
l'appareil. Il est écrit dans la console (`[Licol] Apple Pay / Google Pay …`)
et, quand les portefeuilles sont indisponibles, affiché à l'écran en bac à
sable ou sur `/premium?diag=1`. C'est le seul moyen de vérifier depuis un vrai
téléphone que la déclaration du domaine a pris : le bouton absent ne distingue
pas « domaine non déclaré » de « aucune carte dans le portefeuille ».

Trois points de conception :

- **Le bouton reste inerte tant que les CGV ne sont pas acceptées.** Il serait
  sinon un contournement de la case à cocher, qui vaut consentement.
- **Il disparaît dès qu'un code promo est appliqué.** `presentExpressPurchaseButton`
  n'expose pas de `discountCode`, contrairement à `purchase()` : un appui
  ferait payer plein tarif. Mieux vaut un geste de plus qu'une remise perdue.
- **Un échec de montage n'est pas un échec de paiement.** La même promesse
  porte les deux ; avant que `onButtonReady` n'ait répondu, personne n'a rien
  tenté, et l'emplacement s'efface en silence plutôt que d'annoncer un
  paiement raté.

### Clés

La clé publique du SDK vit dans `VITE_REVENUECAT_CLE_PUBLIQUE`
(RevenueCat → API keys → **SDK API keys**). Elle est faite pour le front :
elle ne permet que de lire le catalogue et de démarrer un achat.

`.env.example` porte la clé de **production**. La bascule tient en deux
gestes, et le second n'est pas facultatif&nbsp;: déclarer la variable dans
Vercel → Settings → Environment Variables, **puis redéployer**. Vite lit les
variables au moment du build et non à la requête&nbsp;; sans redéploiement,
le site continue de tourner en bac à sable quoi qu'affiche le tableau de
bord.

Le repli du code, lui, reste **délibérément** celui du bac à sable. Une
variable oubliée, un `.env` absent, une préproduction montée à la
hâte&nbsp;: dans tous ces cas, le pire qui puisse arriver est qu'aucun
paiement ne soit encaissé. L'inverse — débiter une vraie carte par accident
de configuration — ne se rattrape pas d'un redéploiement.

En local, pensez donc à décommenter la clé de bac à sable dans votre `.env`
personnel&nbsp;: un achat de test depuis `npm run dev` avec la clé de
production débite une vraie carte.

Le bandeau 🧪 de l'écran d'abonnement est le témoin le plus simple&nbsp;: il
disparaît dès que la clé active n'est plus une clé `rcb_sb_`.

> La clé secrète (**Secret API keys**) n'a rien à faire ici, ni dans le
> front, ni dans le webhook : celui-ci n'appelle pas l'API RevenueCat, il la
> reçoit.

### Mise en place

1. Créer l'entitlement `premium`, les deux produits, et l'offering `default`
   avec ses deux packages, tel que décrit ci-dessus.
2. Renseigner `VITE_REVENUECAT_CLE_PUBLIQUE`.
3. Déployer le webhook :

   ```bash
   supabase functions deploy revenuecat-webhook --no-verify-jwt
   supabase secrets set REVENUECAT_SECRET_WEBHOOK=<une valeur longue et aléatoire>
   supabase secrets set REVENUECAT_CLE_SECRETE=<clé secrète V1 RevenueCat>
   ```

   `--no-verify-jwt` est nécessaire — RevenueCat n'envoie pas de JWT Supabase.
   L'authentification repose entièrement sur le secret partagé, transmis dans
   l'en-tête `Authorization`.
4. Dans RevenueCat → Integrations → Webhooks, renseigner l'URL de la fonction
   et ce même secret. Laisser l'environnement sur **All environments** : sur
   `Production` seul, aucun achat de test en bac à sable n'arrive, et le
   paywall tourne indéfiniment sur « activation en cours… ».
5. Facultatif — renseigner `VITE_REVENUECAT_LIEN_PORTAIL` avec l'URL du
   portail client. C'est un repli pour les comptes dont la ligne
   d'abonnement est antérieure à la récupération de `url_gestion`.

> Aucune origine à déclarer côté RevenueCat : la configuration Web Billing
> ne comporte pas de liste de domaines autorisés, et le SDK démarre un achat
> depuis n'importe quel hôte servant l'application.

### Le SDK encaisse, il ne donne aucun droit

`customerInfo.entitlements.active.premium` ne déverrouille rien. L'accès
premium est lu dans la table `abonnements`, que seul le webhook écrit, et sur
laquelle s'appuient les politiques RLS. Un front complaisant — ou trafiqué —
n'obtient donc rien de la base.

D'où l'attente après paiement : le SDK a rendu la main, mais la ligne n'est
pas encore écrite. L'écran interroge la base toutes les trois secondes
pendant trente secondes, puis propose une revérification manuelle plutôt que
d'afficher un état faussement négatif. Le message distingue les deux cas —
« paiement bien enregistré chez notre prestataire » quand RevenueCat, lui,
confirme le droit.

### Poids du bundle

Le SDK pèse plus lourd que tout le reste de l'application (~220 ko gzip).
Il est donc chargé en `import()` dynamique depuis `src/lib/revenuecat.js`,
et Vite l'isole dans son propre *chunk* : il n'est téléchargé qu'à
l'ouverture de l'écran d'abonnement, que la grande majorité des visites ne
croise jamais.

## Résiliation

Le bouton « Résilier mon abonnement » vit dans **Profil → Abonnement**, sans
détour par un email ni par un support. Il ouvre le **portail client
RevenueCat**, qui est le seul endroit faisant foi : l'abonnement vit chez
RevenueCat et Stripe, et **rien dans Supabase ne peut l'interrompre**. Écrire
`statut = 'annule'` en base ne ferait qu'arrêter le service en continuant à
prélever — exactement ce qu'il ne faut pas faire.

L'URL du portail est celle transmise par le webhook (`url_gestion`), avec
`VITE_REVENUECAT_LIEN_PORTAIL` en repli.

Le trajet retour est le webhook : RevenueCat émet `CANCELLATION`, le statut
passe à `annule`, et l'application affiche « Accès jusqu'au … ».

### Résilié n'est pas expiré

C'est le piège corrigé par la migration 0007. `est_premium()` excluait le
statut `annule` : une résiliation coupait donc l'accès **sur-le-champ**, alors
que la période en cours est due et déjà payée.

`CANCELLATION` signifie seulement « ne sera pas renouvelé ». L'accès court
jusqu'à `expire_le` ; c'est `EXPIRATION` qui met fin au service. Les trois
statuts `actif`, `essai` et `annule` ouvrent donc l'accès, toujours sous
réserve de la date.

### Ce que le webhook fait de chaque événement

| Événement RevenueCat | Statut écrit | Accès |
|---|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION`, `SUBSCRIPTION_EXTENDED` | `essai` si `period_type = TRIAL`, sinon `actif` | ouvert |
| `CANCELLATION`, `BILLING_ISSUE` | `annule` | ouvert jusqu'à `expire_le` |
| `EXPIRATION` | `expire` | fermé |
| `TRANSFER`, `SUBSCRIBER_ALIAS`, `TEST`… | rien | inchangé |

`BILLING_ISSUE` était rangé avec `EXPIRATION`, et c'est le même piège qu'en
0007 : RevenueCat l'émet dès le **premier échec de prélèvement**, alors que
l'abonnement est encore valide — période payée non écoulée, ou délai de grâce
en cours. Une carte arrivée à expiration fermait donc le carnet de santé d'un
abonné parfaitement à jour, le temps qu'il la remplace. Il rejoint désormais
`CANCELLATION` : le renouvellement est compromis, le service ne l'est pas
encore.

La date de fin retenue est la plus lointaine de `expiration_at_ms` et de
`grace_period_expiration_at_ms`, précisément parce que le délai de grâce peut
courir au-delà de l'échéance.

Le webhook vérifie enfin que l'événement porte bien l'entitlement `premium`,
quand RevenueCat le transmet : un futur produit vendu à côté ne doit pas
ouvrir le carnet de santé au passage.

### Les événements n'arrivent pas dans l'ordre

RevenueCat réessaie un envoi échoué pendant des heures. Un `EXPIRATION`
rejoué peut donc arriver **après** le `RENEWAL` qui l'a rendu caduc — et le
webhook, qui écrasait la ligne à chaque fois, repassait le compte en gratuit
alors qu'il venait d'être renouvelé. Rien ne le rattrapait avant l'événement
suivant, soit un mois plus tard.

La migration 0008 ajoute `abonnements.dernier_evenement_le`, alimentée par
`event_timestamp_ms` — l'instant où l'événement a été **produit**, et non
celui où il nous parvient. `maj_le` ne pouvait pas servir : il enregistre la
réception, donc précisément la valeur faussée par un rejeu tardif.

Un trigger `BEFORE UPDATE` écarte alors toute écriture plus ancienne que la
ligne en place. Il vit dans la base plutôt que dans la fonction Edge parce
que c'est la table qui doit refuser un retour en arrière, quel que soit le
chemin d'écriture : webhook redéployé de travers, correctif manuel, futur
script de reprise.

Le trigger renvoie `OLD` au lieu de lever une exception. C'est délibéré :
l'écriture est annulée, le webhook répond 200, et RevenueCat cesse de
réessayer un message qui n'a plus rien à apporter. Une exception aurait
produit l'inverse — un 500, puis des réessais sans fin d'un événement
périmé.

Deux cas passent volontairement : une ligne dont `dernier_evenement_le` est
null (héritée d'avant la migration, sinon elle resterait figée à jamais), et
une écriture sans horodatage, qui conserve alors la date connue plutôt que
de l'effacer — sans quoi la protection se désarmerait toute seule.

### D'où vient l'URL du portail

Les événements Web Billing ne portent pas `management_url` — contrairement
aux boutiques mobiles. Le bouton « Résilier mon abonnement » restait donc
muet, et retombait sur `VITE_REVENUECAT_LIEN_PORTAIL`.

Le webhook la demande maintenant à l'API REST : `GET
https://api.revenuecat.com/v1/subscribers/{app_user_id}`, avec la clé
secrète **V1** dans `REVENUECAT_CLE_SECRETE`. La valeur lue dans
`subscriber.management_url` part dans `url_gestion`.

Cet appel est en **meilleur effort**, et c'est délibéré : il est plafonné à
cinq secondes et toute erreur est avalée. L'écriture du statut est ce qui
ouvre l'accès premium — une panne chez RevenueCat ne peut pas avoir pour
conséquence qu'un abonné qui vient de payer reste bloqué en gratuit. En cas
d'échec, l'`upsert` conserve simplement l'URL déjà en base, et le prochain
événement retentera.

Sans `REVENUECAT_CLE_SECRETE`, l'appel est sauté et tout le reste fonctionne
à l'identique.

> Cette clé donne accès en lecture **et en écriture** à tous les abonnés du
> projet. Elle vit dans les secrets de la fonction, jamais dans le front, et
> jamais dans une variable `VITE_*` — celles-là finissent dans le bundle.

## Points à trancher

- **Les comptes club** sont soumis aux mêmes limites que les cavaliers, faute
  d'instruction contraire. Une écurie avec un seul cheval n'a pas grand
  intérêt : un plan club, facturé au nombre de chevaux, mériterait d'exister.
- **La résiliation en trois clics** (article L215-1-1 du code de la
  consommation) impose, pour un abonnement souscrit en ligne par un
  consommateur, un chemin de résiliation aussi simple que la souscription.
  Le bouton en profil va dans ce sens, mais le parcours réel se termine chez
  RevenueCat : à faire valider par votre conseil.
- **Un demi-pensionnaire gratuit ne voit pas les soins** du cheval, même si le
  propriétaire est premium. Le carnet est attaché au cheval, mais l'accès est
  vendu au compte. C'est cohérent avec « module bloqué en gratuit », et c'est
  un moteur de conversion, mais cela peut surprendre.

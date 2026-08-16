# Plan gratuit et Premium

## Ce que limite le plan gratuit

| Limite | Règle |
|---|---|
| Chevaux | 1 cheval **au total**, créé ou rejoint avec un code |
| Carnet de santé | inaccessible, lecture comprise |
| Calendrier | aucun créneau créé ni déplacé au-delà du dimanche courant |

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
C'est **RevenueCat Web Billing** qui est utilisé, via un **Web Purchase Link**
— une URL hébergée par RevenueCat, ce qui évite d'embarquer un SDK de paiement
dans le bundle.

1. Créer dans RevenueCat deux produits : `premium_mensuel` (4,99 €) et
   `premium_annuel` (39,99 €), avec 7 jours d'essai, rattachés à une même
   entitlement.
2. Générer un Web Purchase Link et le renseigner dans
   `VITE_REVENUECAT_LIEN_ACHAT`. L'écran d'abonnement y ajoute
   `app_user_id=<identifiant Supabase>` : **c'est indispensable**, sinon le
   webhook ne saura pas quel compte créditer.
3. Déployer le webhook :

   ```bash
   supabase functions deploy revenuecat-webhook --no-verify-jwt
   supabase secrets set REVENUECAT_SECRET_WEBHOOK=<une valeur longue et aléatoire>
   ```

   `--no-verify-jwt` est nécessaire — RevenueCat n'envoie pas de JWT Supabase.
   L'authentification repose entièrement sur le secret partagé, transmis dans
   l'en-tête `Authorization`.
4. Dans RevenueCat → Integrations → Webhooks, renseigner l'URL de la fonction
   et ce même secret.
5. Configurer l'URL de retour après paiement vers `/premium?achat=ok`.
6. Renseigner `VITE_REVENUECAT_LIEN_PORTAIL` avec l'URL du portail client,
   qui sert de repli tant que le webhook n'a pas transmis l'URL propre au
   compte.

Le webhook peut mettre quelques secondes : l'écran d'abonnement interroge la
base toutes les trois secondes pendant trente secondes après le retour de
paiement, plutôt que d'afficher un état faussement négatif.

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

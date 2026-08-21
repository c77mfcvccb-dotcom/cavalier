# Checklist de lancement commercial

Ce que l'application sait déjà faire est en place ; cette liste réunit ce
qui ne peut se décider ou se configurer **qu'en dehors du code** — comptes,
prix, mentions légales. À dérouler dans l'ordre.

## 1. Base de données (Supabase, éditeur SQL)

- [ ] Exécuter les migrations en attente, dans l'ordre : `0023`, `0024`
      (et `0022` au merge de la PR des soins privés).
- [ ] Vérifier `Authentication → URL Configuration` : Site URL
      `https://licol.app`, Redirect URLs `https://licol.app/**`.
- [ ] Réactiver « Confirm email » (désactivé pendant le développement).

## 2. Mentions légales — bloquant avant tout encaissement

- [ ] Renseigner les valeurs `À_COMPLETER` de `src/lib/legal.js`
      (identité de l'éditeur, SIRET, adresse, email de contact,
      hébergeur…). Tant qu'il en reste une, les pages légales portent un
      bandeau d'avertissement.
- [ ] Relire CGV : prix, essai gratuit et droit de rétractation doivent
      correspondre au catalogue RevenueCat réellement configuré.

## 3. Paiement (RevenueCat + Stripe)

- [ ] Vérifier les produits cavalier (`premium_mensuel` 4,99 €,
      `premium_annuel` 39,99 €, essai gratuit) dans le tableau de bord
      RevenueCat, en mode LIVE et non sandbox.
- [ ] **Décider le prix de l'abonnement écurie**, créer le produit
      RevenueCat/Stripe correspondant, puis me demander de brancher :
      ajout au `check` de `abonnements.produit` (migration), écran
      d'abonnement côté club, et mise à jour de la carte « Écurie » de la
      page d'accueil publique.
- [ ] Vérifier le webhook RevenueCat → Supabase en production (un achat
      test de bout en bout).

## 4. Diffusion

- [ ] La page d'accueil publique est en ligne sur `/` — c'est l'adresse à
      partager. Les fiches publiques de chevaux (`/public/…`) sont exclues
      des moteurs de recherche (robots.txt).
- [ ] Canal de vente le plus court : **les écuries**. Une écurie
      convaincue amène tous ses cavaliers d'un coup — le compte écurie est
      gratuit à ouvrir, l'abonnement ne se paie que pour offrir l'accès
      aux cavaliers. Argumentaire : la page `/#ecuries`.
- [ ] Prévoir une adresse de contact (dans `legal.js`) qui reçoit
      vraiment les emails.

## 5. Après l'ouverture

- [ ] Exécuter une fois `scripts/nettoyer-documents.mjs` depuis un poste
      de confiance (variables `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` —
      la clé service ne doit jamais entrer dans le dépôt).
- [ ] Surveiller les premiers webhooks RevenueCat et les inscriptions ;
      la table `abonnements` fait foi.

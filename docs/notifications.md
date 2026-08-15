# Rappels d'échéances : quelle mécanique ?

Trois options étaient possibles pour prévenir qu'un soin passe en « urgent »
(moins de 7 jours) ou en « retard ». Voici l'arbitrage, puis ce qui est
effectivement implémenté.

## Option A — Push serveur (Web Push + VAPID)

Le vrai push : la notification arrive même application fermée.

**Ce qu'il faut mettre en place**
- Générer une paire de clés VAPID et la stocker côté serveur.
- Une table `abonnements_push` (endpoint, clés p256dh/auth) par appareil.
- Une Edge Function Supabase (Deno) qui signe et envoie les messages Web Push.
- Un `pg_cron` quotidien qui appelle cette fonction pour les échéances du jour.
- Un service worker gérant l'événement `push`.

**Avantages** — le seul mécanisme qui prévient sans ouvrir l'application.

**Inconvénients**
- Les Edge Functions ne s'installent pas depuis le SQL Editor : il faut la
  CLI Supabase, un déploiement séparé, et des secrets à gérer.
- Sur iPhone, le push web ne fonctionne **que** si la PWA a été ajoutée à
  l'écran d'accueil (iOS 16.4+). Une bonne partie des cavalières et cavaliers
  ne recevra donc rien tant qu'elle n'a pas installé l'application.
- Les abonnements expirent silencieusement : il faut gérer les endpoints morts,
  sinon les envois échouent sans que personne ne le sache.
- C'est la brique la plus fragile à maintenir pour un bénéfice qui, ici,
  porte sur des échéances à l'échelle de la semaine, pas de la minute.

## Option B — Emails de rappel

**Ce qu'il faut** — `pg_cron` + une Edge Function appelant un fournisseur
d'envoi (Resend, Postmark…), avec une clé API et un domaine vérifié.

**Avantages** — fonctionne partout, sans installation ni permission.

**Inconvénients** — Supabase n'envoie pas d'email applicatif sans fournisseur
tiers (le SMTP intégré est réservé aux emails d'authentification). Cela ajoute
un compte externe, une facturation, un domaine à configurer, et les rappels
finissent souvent en indésirables.

## Option C — Rappel à l'ouverture *(retenue)*

Pastille sur l'icône de l'application, bandeau en tête d'écran, et
notification locale si l'utilisateur l'a autorisée.

**Avantages**
- Zéro infrastructure : aucune Edge Function, aucun cron, aucun secret,
  aucune table d'abonnements. Rien à déployer hors de l'application.
- Fonctionne sur tous les appareils, y compris iPhone sans installation.
- La pastille sur l'icône (`navigator.setAppBadge`) est visible depuis
  l'écran d'accueil, sans ouvrir l'application, dès lors que la PWA est
  installée — soit l'essentiel du bénéfice du push, sans son coût.
- La demande de permission n'arrive **qu'après** un geste explicite
  (« Activer les rappels »), jamais au premier chargement.

**Inconvénient assumé** — la notification ne part qu'à l'ouverture de
l'application. Pour un rappel de ferrure ou de vermifuge, dont la fenêtre
utile est de plusieurs jours, c'est suffisant.

## Ce qui est implémenté

- `src/lib/rappels.js` — pastille d'icône, permission, notifications locales,
  et mémorisation des échéances déjà signalées (`localStorage`). La clé de
  déduplication inclut le statut : une échéance signalée « urgente » est
  re-signalée si elle bascule en « retard ».
- `src/composants/Rappels.jsx` — bandeau affiché en tête d'application dès
  qu'un soin est en retard ou dû dans la semaine, masquable pour la journée.
- `public/sw.js` — service worker minimal : il n'a **aucun cache** (pour ne
  jamais servir une version périmée), il sert à afficher les notifications et
  à rendre la PWA installable.

## Passer au push plus tard

Rien n'est à défaire : la table des abonnements et l'Edge Function
s'ajouteraient à côté. `v_echeances` fournit déjà exactement la liste à
envoyer, et le service worker existe — il ne lui manquerait qu'un
gestionnaire d'événement `push`.

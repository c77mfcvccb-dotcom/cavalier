/**
 * Vérifications de fumée — à passer avant chaque mise en ligne.
 *
 * Le but n'est pas de tout couvrir, mais d'attraper ce qui casse pour un
 * abonné : un écran qui ne s'affiche plus, une erreur JavaScript qui vide la
 * page, une mise en page qui déborde du téléphone. Ce sont les pannes qui se
 * voient tout de suite et se pardonnent mal.
 *
 * Supabase n'est jamais appelé : toutes les réponses sont simulées ici, avec
 * des données choisies pour leurs pièges — un cheval partagé entre trois
 * cavaliers dont deux homonymes, et des échéances de soins dans chacune des
 * trois fenêtres du code couleur.
 *
 *   npm run verif
 */
import { chromium } from 'playwright'

const CHEVAL = 'cccccccc-0000-4000-8000-00000000000a'
const MOI = '11111111-2222-4333-8444-555555555551'
const AUTRE = '11111111-2222-4333-8444-555555555552'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const dans = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const jourDuMois = (n, h = 10) => {
  const d = new Date()
  d.setDate(n)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}

/** Réponses simulées de Supabase, calquées sur les formes réelles. */
function reponse(url, methode, premium) {
  if (url.includes('/auth/v1/')) {
    return {
      id: MOI, aud: 'authenticated', role: 'authenticated',
      email: 'alice@licol.app', user_metadata: {}, app_metadata: {},
    }
  }
  if (url.includes('/rest/v1/profils')) {
    return [{ id: MOI, nom: 'Alice Martin', type_compte: 'cavalier', ville: 'Chantilly' }]
  }
  if (url.includes('/rest/v1/abonnements')) {
    return premium
      ? [{ statut: 'actif', produit: 'premium_annuel', expire_le: '2030-01-01T00:00:00Z', url_gestion: null }]
      : [{ statut: 'gratuit', produit: null, expire_le: null, url_gestion: null }]
  }
  if (url.includes('/rest/v1/chevaux')) {
    return [{
      id: CHEVAL, nom: 'Ivoire de la Bergerie', club_id: null, cree_par: AUTRE,
      race: 'Selle français', robe: 'Bai', sexe: 'jument', date_naissance: '2015-04-12',
      proprietaire_nom: 'Marine Leroy', notes: 'Sensible du dos.',
    }]
  }
  if (url.includes('/rest/v1/cheval_cavaliers')) {
    // Deux prénoms identiques : le cas qui exige de désambiguïser les
    // étiquettes du calendrier.
    return [
      { id: 'l0', cheval_id: CHEVAL, cavalier_id: AUTRE, role: 'proprietaire', couleur: '#6366f1', cree_le: '2024-01-01', profil: { id: AUTRE, nom: 'Marie Leroy' }, cheval: { id: CHEVAL, nom: 'Ivoire de la Bergerie', club_id: null, cree_par: AUTRE } },
      { id: 'l1', cheval_id: CHEVAL, cavalier_id: MOI, role: 'demi_pension', couleur: '#e11d48', cree_le: '2024-02-01', profil: { id: MOI, nom: 'Alice Martin' }, cheval: { id: CHEVAL, nom: 'Ivoire de la Bergerie', club_id: null, cree_par: AUTRE } },
      { id: 'l2', cheval_id: CHEVAL, cavalier_id: 'x3', role: 'demi_pension', couleur: '#059669', cree_le: '2024-03-01', profil: { id: 'x3', nom: 'Marie Dupont' }, cheval: { id: CHEVAL, nom: 'Ivoire de la Bergerie', club_id: null, cree_par: AUTRE } },
    ]
  }
  if (url.includes('/rest/v1/creneaux')) {
    if (methode === 'POST') return []
    return [
      { id: 'cr1', cheval_id: CHEVAL, cavalier_id: MOI, debut: jourDuMois(10), fin: jourDuMois(10, 11), type: 'monte', titre: null, notes: null, cheval: { id: CHEVAL, nom: 'Ivoire de la Bergerie' }, cavalier: { id: MOI, nom: 'Alice Martin' } },
      { id: 'cr2', cheval_id: CHEVAL, cavalier_id: AUTRE, debut: jourDuMois(11), fin: jourDuMois(11, 11), type: 'monte', titre: 'Cours', notes: null, cheval: { id: CHEVAL, nom: 'Ivoire de la Bergerie' }, cavalier: { id: AUTRE, nom: 'Marie Leroy' } },
    ]
  }
  if (url.includes('/rest/v1/soins')) {
    // Une échéance dans chacune des trois fenêtres, dont la zone 8–30 jours
    // qui a déjà vidé l'écran une fois.
    return [
      { id: 's1', cheval_id: CHEVAL, type: 'vermifuge', date_realisee: dans(-125), prochaine_echeance: dans(-4), praticien: null, produit: 'Equimax', protocole: null, cout: 22, notes: null, cree_par: MOI },
      { id: 's2', cheval_id: CHEVAL, type: 'ferrure', date_realisee: dans(-40), prochaine_echeance: dans(9), praticien: 'Maréchal Dupont', produit: null, protocole: null, cout: 95, notes: null, cree_par: AUTRE },
      { id: 's3', cheval_id: CHEVAL, type: 'dentiste', date_realisee: dans(-345), prochaine_echeance: dans(20), praticien: null, produit: null, protocole: null, cout: 110, notes: null, cree_par: AUTRE },
      { id: 's4', cheval_id: CHEVAL, type: 'vaccin', date_realisee: dans(-300), prochaine_echeance: dans(65), praticien: 'Dr Martin', produit: null, protocole: 'rappel', cout: 60, notes: 'RAS', cree_par: MOI },
    ]
  }
  if (url.includes('/rest/v1/seances')) {
    return [
      { id: 'se1', cheval_id: CHEVAL, cavalier_id: AUTRE, date: dans(-2), type: 'dressage', duree_min: 45, ressenti: 'raide', notes: null, cavalier: { id: AUTRE, nom: 'Marie Leroy' } },
      { id: 'se2', cheval_id: CHEVAL, cavalier_id: MOI, date: dans(-6), type: 'balade', duree_min: 90, ressenti: 'ras', notes: null, cavalier: { id: MOI, nom: 'Alice Martin' } },
    ]
  }
  if (url.includes('/rest/v1/documents')) {
    if (methode === 'POST') return []
    return [
      { id: 'doc1', cheval_id: CHEVAL, categorie: 'identification', nom: 'Carte immatriculation', chemin: `${CHEVAL}/doc1.pdf`, taille_octets: 245000, type_mime: 'application/pdf', cree_le: dans(-40), profil: { id: AUTRE, nom: 'Marie Leroy' } },
      { id: 'doc2', cheval_id: CHEVAL, categorie: 'contrat_dp', nom: 'Contrat demi-pension', chemin: `${CHEVAL}/doc2.pdf`, taille_octets: 98000, type_mime: 'application/pdf', cree_le: dans(-10), profil: { id: MOI, nom: 'Alice Martin' } },
    ]
  }
  if (url.includes('/rest/v1/depenses')) {
    return [
      { id: 'd1', profil_id: MOI, cheval_id: CHEVAL, montant: 320, categorie: 'pension', date: dans(-3), note: null, cheval: { id: CHEVAL, nom: 'Ivoire de la Bergerie' } },
      { id: 'd2', profil_id: MOI, cheval_id: null, montant: 89.9, categorie: 'materiel', date: dans(-12), note: 'Guêtres', cheval: null },
    ]
  }
  if (url.includes('/rest/v1/v_echeances') || url.includes('/rest/v1/v_rappels')) {
    return [{ id: 'e1', cheval_id: CHEVAL, cheval_nom: 'Ivoire de la Bergerie', type: 'vermifuge', prochaine_echeance: dans(-4), jours_restants: -4, statut: 'retard', praticien: null, lu: false }]
  }
  return []
}

async function ouvrirPage(navigateur, base, { premium = true, largeur = 390 } = {}) {
  const page = await navigateur.newPage({
    viewport: { width: largeur, height: 844 }, isMobile: true, hasTouch: true,
  })
  const erreurs = []
  // Le temps réel n'a pas de serveur ici : l'échec de connexion est attendu,
  // et l'application est justement faite pour continuer sans lui. Tout le
  // reste compte.
  const bruitAttendu = (texte) => /WebSocket connection to/.test(texte)
  const noter = (texte) => !bruitAttendu(texte) && erreurs.push(texte)
  page.on('pageerror', (e) => noter(e.message))
  page.on('console', (m) => m.type() === 'error' && noter(m.text()))

  await page.route('**/*.supabase.co/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reponse(route.request().url(), route.request().method(), premium)),
    })
  )
  // Aucun appel sortant : ni paiement, ni temps réel. Le canal temps réel
  // est intercepté puis laissé muet — sans cela, le SDK tente la connexion
  // en boucle à travers le proxy du poste de test, et ces tentatives à
  // rallonge finissent par ralentir la page au point de fausser les mesures.
  await page.route(/revenuecat|stripe/, (route) => route.abort())
  await page.routeWebSocket(/supabase/, () => {})

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jeton = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: MOI, exp, role: 'authenticated' })}.sig`
  await page.evaluate(
    ([id, jwt, fin]) =>
      localStorage.setItem(
        'sb-exemple-auth-token',
        JSON.stringify({
          access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: fin,
          refresh_token: 'r',
          user: { id, email: 'alice@licol.app', aud: 'authenticated', role: 'authenticated', user_metadata: {} },
        })
      ),
    [MOI, jeton, exp]
  )
  return { page, erreurs }
}

const ECRANS = [
  ['/', 'Accueil'],
  ['/chevaux', 'Mes chevaux'],
  ['/calendrier', 'Calendrier'],
  ['/depenses', 'Dépenses'],
  ['/profil', 'Profil'],
  ['/premium', 'Abonnement'],
  ['/cgv', 'CGV'],
  ['/mentions-legales', 'Mentions légales'],
  ['/confidentialite', 'Confidentialité'],
  [`/chevaux/${CHEVAL}?onglet=fiche`, 'Cheval · fiche'],
  [`/chevaux/${CHEVAL}?onglet=calendrier`, 'Cheval · calendrier'],
  [`/chevaux/${CHEVAL}?onglet=seances`, 'Cheval · séances'],
  [`/chevaux/${CHEVAL}?onglet=soins`, 'Cheval · soins'],
  [`/chevaux/${CHEVAL}?onglet=documents`, 'Cheval · documents'],
  [`/chevaux/${CHEVAL}/carnet`, 'Carnet imprimable'],
  [`/chevaux/${CHEVAL}/rappels`, 'Réglages des rappels'],
]

export async function verifier(base) {
  // Playwright trouve seul son navigateur après `npx playwright install
  // chromium`. La variable CHROMIUM sert aux environnements où il est
  // installé ailleurs — un conteneur d'intégration continue, par exemple.
  const navigateur = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
  )
  const resultats = []
  const noter = (nom, ok, detail = '') => resultats.push({ nom, ok, detail })

  try {
    // ── Chaque écran s'affiche, sans erreur et sans déborder ──────────
    for (const largeur of [320, 390]) {
      const { page, erreurs } = await ouvrirPage(navigateur, base, { largeur })
      for (const [chemin, nom] of ECRANS) {
        process.stdout.write(`  · ${largeur} px ${nom}\n`)
        erreurs.length = 0
        await page.goto(`${base}${chemin}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(900)

        const etat = await page.evaluate(() => ({
          texte: (document.body.innerText || '').trim().length,
          debord: document.documentElement.scrollWidth - window.innerWidth,
          panne: Boolean(document.body.innerText.includes('n’a pas pu s’afficher')),
        }))

        noter(`${nom} — s'affiche (${largeur} px)`, etat.texte > 0 && !etat.panne,
          etat.panne ? 'écran de secours affiché' : 'page vide')
        noter(`${nom} — pas d'erreur JavaScript (${largeur} px)`, erreurs.length === 0,
          erreurs[0]?.slice(0, 120) ?? '')
        noter(`${nom} — tient dans l'écran (${largeur} px)`, etat.debord <= 0,
          `déborde de ${etat.debord} px`)
      }
      await page.close()
    }

    // ── Le carnet de santé affiche bien ses trois paliers ─────────────
    {
      const { page } = await ouvrirPage(navigateur, base)
      await page.goto(`${base}/chevaux/${CHEVAL}?onglet=soins`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      const badges = await page.locator('section .liste .element .badge').allInnerTexts()
      noter('Soins — quatre échéances listées', badges.length === 4, `${badges.length} trouvée(s)`)
      noter('Soins — un badge par échéance, tous nommés',
        badges.every((b) => b.trim().length > 0), badges.join(' | '))
      noter('Soins — le retard est signalé', badges.includes('En retard'), badges.join(' | '))
      await page.close()
    }

    // ── Documents : la liste s'affiche, groupée par catégorie ─────────
    {
      const { page } = await ouvrirPage(navigateur, base)
      await page.goto(`${base}/chevaux/${CHEVAL}?onglet=documents`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      const lignes = await page.locator('section .liste .element, .liste .element').allInnerTexts()
      noter('Documents — deux documents listés', lignes.length === 2, `${lignes.length} trouvé(s)`)
      noter('Documents — bouton d’ajout présent',
        (await page.getByRole('button', { name: /Ajouter un document/ }).count()) === 1)
      await page.close()
    }

    // ── Documents : accessibles en gratuit, quota annoncé ─────────────
    {
      const { page } = await ouvrirPage(navigateur, base, { premium: false })
      await page.goto(`${base}/chevaux/${CHEVAL}?onglet=documents`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1200)
      const lignes = await page.locator('.liste .element').count()
      const texte = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      noter('Documents — la liste s’affiche en plan gratuit', lignes === 2, `${lignes} ligne(s)`)
      noter('Documents — le quota gratuit est annoncé', texte.includes('/10 documents'), texte.slice(0, 100))
      noter('Documents — l’ajout reste possible sous le quota',
        (await page.getByRole('button', { name: /Ajouter un document/ }).count()) === 1)
      await page.close()
    }

    // ── Le calendrier crée un créneau au second appui ─────────────────
    {
      const { page } = await ouvrirPage(navigateur, base)
      await page.goto(`${base}/chevaux/${CHEVAL}?onglet=calendrier`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      const jour = page
        .locator('.grille-mois .jour:not(.hors-mois)')
        .filter({ has: page.locator('.numero', { hasText: /^14$/ }) })
        .first()
      await jour.click()
      await page.waitForTimeout(250)
      noter('Calendrier — le premier appui choisit le jour',
        (await page.locator('.feuille').count()) === 0)
      await jour.click()
      await page.waitForTimeout(400)
      noter('Calendrier — le second appui ouvre la création',
        (await page.locator('.feuille').count()) === 1)
      await page.close()
    }

    // ── Le plan gratuit ferme bien ce qu'il doit fermer ───────────────
    {
      const { page } = await ouvrirPage(navigateur, base, { premium: false })
      await page.goto(`${base}/chevaux/${CHEVAL}?onglet=soins`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      const texte = await page.locator('main').innerText()
      noter('Plan gratuit — le carnet de santé renvoie à l\'abonnement',
        texte.includes('Premium') || texte.includes('premium'), texte.slice(0, 80))
      await page.close()
    }
  } finally {
    await navigateur.close()
  }

  return resultats
}

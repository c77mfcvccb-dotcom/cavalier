/**
 * `npm run verif` — construit l'application, la sert, et passe les
 * vérifications de fumée dessus.
 *
 * Sur le build de production, et non sur le serveur de développement : c'est
 * ce qui part chez les abonnés, avec son découpage en fichiers et sa
 * minification. Un écran différé qui ne se charge pas ne se voit qu'ici.
 */
import { spawn } from 'node:child_process'
import { verifier } from '../tests/fumee.mjs'

const PORT = 4173
const BASE = `http://localhost:${PORT}`

function lancer(commande, args) {
  return spawn(commande, args, { stdio: ['ignore', 'ignore', 'inherit'], shell: false })
}

async function attendre(url, essais = 60) {
  for (let i = 0; i < essais; i++) {
    try {
      const reponse = await fetch(url)
      if (reponse.ok) return true
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

console.log('› Construction…')
await new Promise((resoudre, rejeter) => {
  // L'URL Supabase est imposée ici, par-dessus tout `.env` : les tests
  // interceptent `*.supabase.co`, et un build parti avec une autre valeur
  // les ferait expirer un à un sans dire pourquoi. Les variables
  // d'environnement priment sur le fichier chez Vite.
  const build = spawn('npx', ['vite', 'build'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://exemple.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'cle-factice-pour-la-verification',
    },
  })
  build.on('exit', (code) => (code === 0 ? resoudre() : rejeter(new Error('build en échec'))))
})

console.log('› Démarrage du serveur…')
const serveur = lancer('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'])
const arreter = () => serveur.kill('SIGTERM')
process.on('exit', arreter)
process.on('SIGINT', () => {
  arreter()
  process.exit(130)
})

if (!(await attendre(BASE))) {
  arreter()
  console.error('✗ Le serveur n’a pas démarré.')
  process.exit(1)
}

console.log('› Vérifications…\n')
let resultats
try {
  resultats = await verifier(BASE)
} catch (erreur) {
  arreter()
  console.error('✗ Les vérifications n’ont pas pu s’exécuter :', erreur.message)
  process.exit(1)
} finally {
  arreter()
}

const echecs = resultats.filter((r) => !r.ok)
for (const r of resultats) {
  if (!r.ok) console.log(`  ✗ ${r.nom}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(
  `\n${resultats.length - echecs.length}/${resultats.length} vérifications passées.`
)

if (echecs.length) {
  console.error('\n✗ Ne pas déployer en l’état.')
  process.exit(1)
}
console.log('✓ Rien de cassé sur les parcours vérifiés.')

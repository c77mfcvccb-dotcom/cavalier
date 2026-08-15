/**
 * Rasterise public/logo.svg vers les PNG de la PWA (192 et 512 px).
 *
 * Ce n'est pas une étape de build : les PNG sont versionnés, et ce script ne
 * sert qu'à les régénérer quand le logo change. Il s'appuie sur Chromium via
 * Playwright, qui n'est pas une dépendance du projet — d'où l'installation à
 * la demande :
 *
 *   npx --yes playwright@1 install --with-deps chromium
 *   node scripts/generer-icones.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error(
    "Playwright est absent. Installez-le ponctuellement :\n" +
      '  npx --yes playwright@1 install --with-deps chromium\n' +
      '  npm i -D playwright && node scripts/generer-icones.mjs'
  )
  process.exit(1)
}

const svg = readFileSync(join(racine, 'public', 'logo.svg'), 'utf8')
const navigateur = await chromium.launch()

for (const taille of [192, 512]) {
  const page = await navigateur.newPage({ viewport: { width: taille, height: taille } })
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`
  )
  const image = await page.screenshot({ omitBackground: true })
  const chemin = join(racine, 'public', `icone-${taille}.png`)
  writeFileSync(chemin, image)
  console.log(`✓ ${chemin}`)
  await page.close()
}

await navigateur.close()

// Génère les icônes PNG de la PWA sans dépendance externe.
// Dessine un fer à cheval clair sur fond vert, avec un léger anticrénelage.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')

const FOND = [31, 58, 46] // #1f3a2e
const FER = [245, 233, 215] // #f5e9d7

const melange = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// Distance signée au fer à cheval : anneau ouvert vers le bas + extrémités arrondies
function distanceFer(x, y, taille) {
  const cx = taille / 2
  const cy = taille * 0.47
  const rayon = taille * 0.27 // rayon de la ligne moyenne du fer
  const demiEpaisseur = taille * 0.055
  const sinus = 0.5 // ouverture de ±30° autour de la verticale basse

  const dx = x - cx
  const dy = y - cy

  // Anneau, puis on évide le secteur bas pour ouvrir le fer
  let d = Math.abs(Math.hypot(dx, dy) - rayon) - demiEpaisseur
  const distance = Math.hypot(dx, dy) || 1
  if (dy > 0 && Math.abs(dx) / distance < sinus) d = taille

  // Extrémités arrondies des deux branches
  const ey = cy + rayon * Math.sqrt(1 - sinus * sinus)
  for (const signe of [-1, 1]) {
    const ex = cx + signe * rayon * sinus
    d = Math.min(d, Math.hypot(x - ex, y - ey) - demiEpaisseur)
  }
  return d
}

// Coin arrondi du fond (rayon ~22 %)
function dansLeFond(x, y, taille) {
  const r = taille * 0.22
  const dx = Math.max(r - x, 0, x - (taille - r))
  const dy = Math.max(r - y, 0, y - (taille - r))
  return Math.hypot(dx, dy) - r
}

function creerPng(taille) {
  const lignes = []
  for (let y = 0; y < taille; y++) {
    const ligne = Buffer.alloc(1 + taille * 4)
    ligne[0] = 0 // filtre "none"
    for (let x = 0; x < taille; x++) {
      const px = x + 0.5
      const py = y + 0.5

      const dFond = dansLeFond(px, py, taille)
      const alpha = Math.max(0, Math.min(1, 0.5 - dFond))
      const dFer = distanceFer(px, py, taille)
      const partFer = Math.max(0, Math.min(1, 0.5 - dFer))

      const [r, g, b] = melange(FOND, FER, partFer)
      const i = 1 + x * 4
      ligne[i] = r
      ligne[i + 1] = g
      ligne[i + 2] = b
      ligne[i + 3] = Math.round(alpha * 255)
    }
    lignes.push(ligne)
  }

  const bloc = (type, data) => {
    const longueur = Buffer.alloc(4)
    longueur.writeUInt32BE(data.length)
    const corps = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(corps) >>> 0)
    return Buffer.concat([longueur, corps, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(taille, 0)
  ihdr.writeUInt32BE(taille, 4)
  ihdr[8] = 8 // profondeur
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(Buffer.concat(lignes), { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ])
}

const tableCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const octet of buf) c = tableCrc[(c ^ octet) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

for (const taille of [192, 512]) {
  const chemin = join(racine, 'public', `icone-${taille}.png`)
  writeFileSync(chemin, creerPng(taille))
  console.log(`✓ ${chemin}`)
}

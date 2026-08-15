// Helpers de dates et de formatage, tous en français.

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

// Abréviations françaises d'usage : elles ne se déduisent pas d'une troncature.
const MOIS_ABREGES = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

export const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Convertit une valeur en Date locale.
 * Les colonnes DATE de Postgres arrivent en « AAAA-MM-JJ » : `new Date()` les
 * lit comme minuit UTC, ce qui décale l'affichage d'un jour dans les fuseaux
 * en retard sur UTC. On les construit donc explicitement en heure locale.
 */
export function enDateLocale(valeur) {
  if (valeur instanceof Date) return valeur
  if (typeof valeur === 'string') {
    const jourSeul = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur)
    if (jourSeul) {
      const [, annee, mois, jour] = jourSeul
      return new Date(Number(annee), Number(mois) - 1, Number(jour))
    }
  }
  return new Date(valeur)
}

/** Clé « AAAA-MM-JJ » dans le fuseau local (pas d'UTC : évite les décalages de jour). */
export function cleJour(date) {
  const d = enDateLocale(date)
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jour = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mois}-${jour}`
}

export function formatDate(valeur, options = {}) {
  if (!valeur) return '—'
  const d = enDateLocale(valeur)
  if (Number.isNaN(d.getTime())) return '—'
  const { avecJour = false, court = false } = options
  const mois = court ? MOIS_ABREGES[d.getMonth()] : MOIS[d.getMonth()]
  const base = `${d.getDate()} ${mois} ${d.getFullYear()}`
  return avecJour ? `${JOURS[d.getDay()]} ${base}` : base
}

export function formatHeure(valeur) {
  if (!valeur) return ''
  const d = new Date(valeur)
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatMoisAnnee(date) {
  return `${MOIS[date.getMonth()]} ${date.getFullYear()}`
}

/** « dans 3 jours », « aujourd'hui », « il y a 5 jours » */
export function joursRelatifs(jours) {
  if (jours === null || jours === undefined) return ''
  if (jours === 0) return "aujourd'hui"
  if (jours === 1) return 'demain'
  if (jours === -1) return 'hier'
  if (jours > 0) return `dans ${jours} jours`
  return `il y a ${Math.abs(jours)} jours`
}

export function calculerAge(dateNaissance) {
  if (!dateNaissance) return null
  const n = enDateLocale(dateNaissance)
  const aujourdhui = new Date()
  let age = aujourdhui.getFullYear() - n.getFullYear()
  const m = aujourdhui.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && aujourdhui.getDate() < n.getDate())) age--
  return age
}

export function texteAge(dateNaissance) {
  const age = calculerAge(dateNaissance)
  if (age === null) return null
  return age <= 1 ? `${age} an` : `${age} ans`
}

/** Ajoute des jours à une date et renvoie une valeur « AAAA-MM-JJ » pour les <input type="date">. */
export function ajouterJours(date, jours) {
  const d = new Date(date)
  d.setDate(d.getDate() + jours)
  return cleJour(d)
}

/** Grille du mois : semaines de 7 jours commençant le lundi. */
export function grilleMois(annee, mois) {
  const premier = new Date(annee, mois, 1)
  const decalage = (premier.getDay() + 6) % 7 // lundi = 0
  const debut = new Date(annee, mois, 1 - decalage)

  const finDuMois = new Date(annee, mois + 1, 0)
  const semaines = []
  for (let s = 0; s < 6; s++) {
    const debutSemaine = new Date(debut)
    debutSemaine.setDate(debut.getDate() + s * 7)
    if (s > 0 && debutSemaine > finDuMois) break

    semaines.push(
      Array.from({ length: 7 }, (_, j) => {
        const d = new Date(debutSemaine)
        d.setDate(debutSemaine.getDate() + j)
        return d
      })
    )
  }
  return semaines
}

/** Lundi de la semaine contenant `date`. */
export function debutSemaine(date) {
  const d = new Date(date)
  const decalage = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - decalage)
  d.setHours(0, 0, 0, 0)
  return d
}

export function initiales(nom) {
  if (!nom) return '?'
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((mot) => mot[0])
    .join('')
    .toUpperCase()
}

/** Valeur pour <input type="datetime-local"> à partir d'une date locale. */
export function valeurDatetimeLocal(date) {
  const d = new Date(date)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

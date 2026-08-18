/**
 * Nettoyage du bucket `documents` : détecte, et supprime sur demande, ce qui
 * a divergé entre la table `documents` et les fichiers réellement stockés.
 *
 * Deux dérives possibles, aux causes opposées :
 *
 * - **Orphelins** : des fichiers sans ligne. Un cheval supprimé pendant une
 *   coupure réseau — l'application purge le bucket avant la suppression,
 *   mais en meilleur effort — ou une suppression faite en SQL directement.
 *   Ils occupent de l'espace facturé sans être visibles nulle part.
 * - **Fantômes** : des lignes sans fichier. Un envoi interrompu entre le
 *   fichier et la ligne (le code nettoie déjà ce cas, mais un onglet fermé
 *   au mauvais instant y échappe). Ils s'affichent dans la liste et
 *   échouent à l'ouverture.
 *
 * Sans argument, le script LISTE et ne touche à rien. `--supprimer` efface
 * les orphelins (via l'API Storage, la seule qui détruise vraiment un
 * fichier) et les lignes fantômes.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE=eyJ... \
 *   node scripts/nettoyer-documents.mjs [--supprimer]
 *
 * ⚠️ La clé service_role contourne tout le RLS : elle ne doit jamais
 * quitter votre machine ni entrer dans le dépôt.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const cle = process.env.SUPABASE_SERVICE_ROLE
const supprimer = process.argv.includes('--supprimer')

if (!url || !cle) {
  console.error('Variables requises : SUPABASE_URL et SUPABASE_SERVICE_ROLE.')
  process.exit(1)
}

const supabase = createClient(url, cle, { auth: { persistSession: false } })

/** Tous les chemins du bucket : un dossier par cheval, paginé par prudence. */
async function listerFichiers() {
  const chemins = []
  const { data: dossiers, error } = await supabase.storage
    .from('documents')
    .list('', { limit: 1000 })
  if (error) throw error

  for (const dossier of dossiers ?? []) {
    // À la racine, seuls les dossiers (id null) nous intéressent : un
    // fichier posé hors dossier serait de toute façon un orphelin illisible.
    if (dossier.id !== null) {
      chemins.push(dossier.name)
      continue
    }
    for (let page = 0; ; page++) {
      const { data, error: e } = await supabase.storage
        .from('documents')
        .list(dossier.name, { limit: 100, offset: page * 100 })
      if (e) throw e
      chemins.push(...(data ?? []).map((f) => `${dossier.name}/${f.name}`))
      if (!data || data.length < 100) break
    }
  }
  return chemins
}

const fichiers = await listerFichiers()
const { data: lignes, error } = await supabase.from('documents').select('id, chemin, nom')
if (error) throw error

const cheminsEnBase = new Set((lignes ?? []).map((l) => l.chemin))
const fichiersStockes = new Set(fichiers)

const orphelins = fichiers.filter((c) => !cheminsEnBase.has(c))
const fantomes = (lignes ?? []).filter((l) => !fichiersStockes.has(l.chemin))

console.log(`${fichiers.length} fichier(s) dans le bucket, ${lignes?.length ?? 0} ligne(s) en base.`)
console.log(`Orphelins (fichier sans ligne) : ${orphelins.length}`)
for (const c of orphelins) console.log(`  ${c}`)
console.log(`Fantômes (ligne sans fichier)  : ${fantomes.length}`)
for (const f of fantomes) console.log(`  ${f.chemin}  « ${f.nom} »`)

if (!supprimer) {
  if (orphelins.length || fantomes.length) {
    console.log('\nRien n’a été touché. Relancez avec --supprimer pour nettoyer.')
  } else {
    console.log('\nRien à nettoyer.')
  }
  process.exit(0)
}

if (orphelins.length) {
  const { error: e } = await supabase.storage.from('documents').remove(orphelins)
  if (e) throw e
  console.log(`\n${orphelins.length} fichier(s) orphelin(s) supprimé(s).`)
}
if (fantomes.length) {
  const { error: e } = await supabase
    .from('documents')
    .delete()
    .in('id', fantomes.map((f) => f.id))
  if (e) throw e
  console.log(`${fantomes.length} ligne(s) fantôme(s) supprimée(s).`)
}
if (!orphelins.length && !fantomes.length) console.log('\nRien à nettoyer.')

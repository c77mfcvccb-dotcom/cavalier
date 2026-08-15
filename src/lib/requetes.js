// Requêtes Supabase partagées. Le RLS filtre déjà les lignes accessibles :
// ces fonctions ne refont donc pas de contrôle de droits côté client.
import { supabase } from './supabase'

/** Chevaux d'un cavalier, via la table de liaison (rôle + couleur inclus). */
export async function chargerMesChevaux(cavalierId) {
  const { data, error } = await supabase
    .from('cheval_cavaliers')
    .select('role, couleur, cheval:chevaux(*)')
    .eq('cavalier_id', cavalierId)
    .order('cree_le', { ascending: true })

  if (error) throw error
  return (data || [])
    .filter((ligne) => ligne.cheval)
    .map((ligne) => ({ ...ligne.cheval, role: ligne.role, couleur: ligne.couleur }))
}

/** Cavalerie d'un club. */
export async function chargerChevauxClub(clubId) {
  const { data, error } = await supabase
    .from('chevaux')
    .select('*, cheval_cavaliers(count)')
    .eq('club_id', clubId)
    .order('nom')

  if (error) throw error
  return (data || []).map((cheval) => ({
    ...cheval,
    nb_cavaliers: cheval.cheval_cavaliers?.[0]?.count ?? 0,
  }))
}

/** Tous les chevaux visibles, quel que soit le type de compte. */
export async function chargerChevauxVisibles(profil) {
  return profil.type_compte === 'club'
    ? chargerChevauxClub(profil.id)
    : chargerMesChevaux(profil.id)
}

/** Échéances de soins, triées par urgence (les retards d'abord). */
export async function chargerEcheances({ chevalId = null, limite = null } = {}) {
  let requete = supabase
    .from('v_echeances')
    .select('*')
    .order('prochaine_echeance', { ascending: true })

  if (chevalId) requete = requete.eq('cheval_id', chevalId)
  if (limite) requete = requete.limit(limite)

  const { data, error } = await requete
  if (error) throw error
  return data || []
}

/** Cavaliers liés à un cheval, avec leur profil et leur couleur de calendrier. */
export async function chargerCavaliersDuCheval(chevalId) {
  const { data, error } = await supabase
    .from('cheval_cavaliers')
    .select('id, role, couleur, cavalier_id, profil:profils(id, nom, photo_url, niveau_galop)')
    .eq('cheval_id', chevalId)
    .order('cree_le')

  if (error) throw error
  return data || []
}

/**
 * Créneaux d'un ou plusieurs chevaux, enrichis de la couleur du cavalier.
 * Les couleurs vivent dans cheval_cavaliers : on les rapatrie en une requête
 * puis on les associe côté client (moins coûteux qu'une jointure par ligne).
 */
export async function chargerCreneaux({ chevauxIds, debut, fin }) {
  if (!chevauxIds?.length) return []

  let requete = supabase
    .from('creneaux')
    .select('*, cheval:chevaux(id, nom), cavalier:profils(id, nom, photo_url)')
    .in('cheval_id', chevauxIds)
    .order('debut')

  if (debut) requete = requete.gte('debut', debut.toISOString())
  if (fin) requete = requete.lte('debut', fin.toISOString())

  const { data: creneaux, error } = await requete
  if (error) throw error

  const { data: liaisons, error: erreurLiaisons } = await supabase
    .from('cheval_cavaliers')
    .select('cheval_id, cavalier_id, couleur')
    .in('cheval_id', chevauxIds)
  if (erreurLiaisons) throw erreurLiaisons

  const couleurs = new Map(
    (liaisons || []).map((l) => [`${l.cheval_id}:${l.cavalier_id}`, l.couleur])
  )

  return (creneaux || []).map((creneau) => ({
    ...creneau,
    couleur: couleurs.get(`${creneau.cheval_id}:${creneau.cavalier_id}`) || '#94a3b8',
  }))
}

export async function chargerSeances(chevalId) {
  const { data, error } = await supabase
    .from('seances')
    .select('*, cavalier:profils(id, nom, photo_url)')
    .eq('cheval_id', chevalId)
    .order('date', { ascending: false })
    .limit(100)

  if (error) throw error
  return data || []
}

export async function chargerSoins(chevalId) {
  const { data, error } = await supabase
    .from('soins')
    .select('*')
    .eq('cheval_id', chevalId)
    .order('date_realisee', { ascending: false })

  if (error) throw error
  return data || []
}

// Requêtes Supabase partagées. Le RLS filtre déjà les lignes accessibles :
// ces fonctions ne refont donc pas de contrôle de droits côté client.
import { supabase } from './supabase'
import { COULEUR_SOIN, traitCavalier } from './couleurs'
import { cleJour, enDateLocale } from './format'

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

/**
 * Nombre de chevaux du compte, créés comme rejoints par code — c'est ce total
 * que borne le plan gratuit. Miroir de nb_chevaux_du_compte() en SQL ; la
 * limite qui fait foi reste côté base (migration 0006).
 */
export async function chargerNbChevauxDuCompte(profil) {
  if (profil.type_compte === 'club') {
    const { count, error } = await supabase
      .from('chevaux')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', profil.id)
    if (error) throw error
    return count ?? 0
  }

  const { count, error } = await supabase
    .from('cheval_cavaliers')
    .select('id', { count: 'exact', head: true })
    .eq('cavalier_id', profil.id)

  if (error) throw error
  return count ?? 0
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
 * La couleur se déduit de l'identifiant du cavalier : plus besoin de la
 * seconde requête sur cheval_cavaliers que faisait cette fonction.
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

  return (creneaux || []).map((creneau) => ({
    ...creneau,
    couleur: traitCavalier(creneau.cavalier_id),
  }))
}

/**
 * Flux unique du calendrier : créneaux de monte + échéances de soins.
 *
 * Chaque élément porte un `genre` (« creneau » ou « soin ») qui pilote son
 * rendu — pastille ronde à la couleur du cavalier, ou carré neutre avec
 * l'emoji du type de soin.
 *
 * Les échéances viennent de la vue v_echeances, qui ne retient que le soin le
 * plus récent de chaque type : c'est bien « la prochaine échéance » du cheval,
 * et non l'historique des échéances déjà remplacées.
 */
export async function chargerEvenements({ chevauxIds, debut, fin }) {
  if (!chevauxIds?.length) return []

  const [creneaux, echeances] = await Promise.all([
    chargerCreneaux({ chevauxIds, debut, fin }),
    chargerEcheances(),
  ])

  const dansLaFenetre = (jour) => {
    const date = enDateLocale(jour)
    if (debut && date < enDateLocale(cleJour(debut))) return false
    if (fin && date > enDateLocale(cleJour(fin))) return false
    return true
  }

  const soins = echeances
    .filter((e) => chevauxIds.includes(e.cheval_id) && dansLaFenetre(e.prochaine_echeance))
    .map((echeance) => ({
      id: `soin-${echeance.id}`,
      genre: 'soin',
      cheval_id: echeance.cheval_id,
      cheval: { id: echeance.cheval_id, nom: echeance.cheval_nom },
      debut: echeance.prochaine_echeance,
      couleur: COULEUR_SOIN.trait,
      type: echeance.type,
      statut: echeance.statut,
      jours_restants: echeance.jours_restants,
      praticien: echeance.praticien,
    }))

  return [...creneaux.map((c) => ({ ...c, genre: 'creneau' })), ...soins].sort(
    (a, b) => enDateLocale(a.debut) - enDateLocale(b.debut)
  )
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

// Requêtes Supabase partagées. Le RLS filtre déjà les lignes accessibles :
// ces fonctions ne refont donc pas de contrôle de droits côté client.
import { supabase } from './supabase'
import { COULEUR_SOIN, identiteCavalier, repertoireCavaliers } from './couleurs'
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
 * Répertoires des cavaliers, un par cheval : couleur et étiquette distinctes
 * au sein de chaque cheval.
 *
 * Le calcul demande la liste complète des participants — et non les seuls
 * cavaliers qui ont posé un créneau — sans quoi la couleur d'un cavalier
 * changerait selon les créneaux affichés à l'écran.
 */
export async function chargerRepertoires(chevauxIds) {
  if (!chevauxIds?.length) return new Map()

  const { data, error } = await supabase
    .from('cheval_cavaliers')
    .select('cheval_id, cavalier_id, profil:profils(id, nom)')
    .in('cheval_id', chevauxIds)

  if (error) throw error

  const parCheval = new Map()
  for (const liaison of data || []) {
    if (!parCheval.has(liaison.cheval_id)) parCheval.set(liaison.cheval_id, [])
    parCheval.get(liaison.cheval_id).push(liaison)
  }

  return new Map(
    [...parCheval].map(([chevalId, liaisons]) => [chevalId, repertoireCavaliers(liaisons)])
  )
}

/**
 * Créneaux d'un ou plusieurs chevaux, enrichis de l'identité d'affichage du
 * cavalier : couleur du liseré, et étiquette pour la grille du mois.
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

  const [{ data: creneaux, error }, repertoires] = await Promise.all([
    requete,
    chargerRepertoires(chevauxIds),
  ])
  if (error) throw error

  return (creneaux || []).map((creneau) => {
    const identite = identiteCavalier(
      repertoires.get(creneau.cheval_id),
      creneau.cavalier_id,
      creneau.cavalier?.nom
    )
    return { ...creneau, couleur: identite.trait, etiquette: identite }
  })
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

/**
 * Indisponibilités encore actives ou à venir des chevaux donnés.
 * `fin` nulle = jusqu'à nouvel ordre ; les indisponibilités déjà levées
 * n'intéressent personne à l'écran, elles restent en base comme historique.
 */
export async function chargerIndisponibilites(chevauxIds) {
  if (!chevauxIds?.length) return []

  const { data, error } = await supabase
    .from('indisponibilites')
    .select('*, profil:profils(id, nom)')
    .in('cheval_id', chevauxIds)
    .or(`fin.is.null,fin.gte.${cleJour(new Date())}`)
    .order('debut', { ascending: false })

  if (error) throw error
  return data || []
}

/** L'indisponibilité qui couvre le jour donné, ou null. */
export function indisponibiliteActive(indisponibilites, chevalId, jour = new Date()) {
  const date = enDateLocale(cleJour(jour))
  return (
    (indisponibilites || []).find(
      (i) =>
        i.cheval_id === chevalId &&
        enDateLocale(i.debut) <= date &&
        (i.fin === null || enDateLocale(i.fin) >= date)
    ) || null
  )
}

/**
 * Charge de travail par cheval — créneaux du calendrier et attributions de
 * cours confondus — telle que la calcule la vue v_charge_chevaux :
 * aujourd'hui, et les sept jours autour de maintenant.
 */
export async function chargerChargeChevaux(chevauxIds) {
  if (!chevauxIds?.length) return new Map()

  const { data, error } = await supabase
    .from('v_charge_chevaux')
    .select('*')
    .in('cheval_id', chevauxIds)

  if (error) throw error
  return new Map((data || []).map((ligne) => [ligne.cheval_id, ligne]))
}

/**
 * Cours d'un club sur une fenêtre, avec leurs inscriptions complètes.
 * Les inscriptions reviennent triées par ancienneté : c'est l'ordre de la
 * liste d'attente, et celui dans lequel la base promeut.
 */
export async function chargerCours({ clubId = null, debut = null, fin = null } = {}) {
  let requete = supabase
    .from('cours')
    .select(
      `*, club:profils(id, nom),
       inscriptions:inscriptions_cours(
         id, cavalier_id, cheval_id, statut, present, cree_le,
         cavalier:profils(id, nom, photo_url, niveau_galop),
         cheval:chevaux(id, nom)
       )`
    )
    .order('debut')

  if (clubId) requete = requete.eq('club_id', clubId)
  if (debut) requete = requete.gte('debut', debut.toISOString())
  if (fin) requete = requete.lte('debut', fin.toISOString())

  const { data, error } = await requete
  if (error) throw error
  return (data || []).map((cours) => ({
    ...cours,
    inscriptions: (cours.inscriptions || []).sort((a, b) =>
      (a.cree_le || '').localeCompare(b.cree_le || '')
    ),
  }))
}

/**
 * Clubs auxquels un cavalier est rattaché. Pas de table d'adhésion : on est
 * « du club » quand on est lié à au moins un de ses chevaux — le lien que
 * crée le code d'invitation (même définition que est_cavalier_du_club en
 * base, migration 0017).
 */
export async function chargerMesClubs(cavalierId) {
  const { data, error } = await supabase
    .from('cheval_cavaliers')
    .select('cheval:chevaux(club:club_id(id, nom))')
    .eq('cavalier_id', cavalierId)

  if (error) throw error

  const clubs = new Map()
  for (const ligne of data || []) {
    const club = ligne.cheval?.club
    if (club) clubs.set(club.id, club)
  }
  return [...clubs.values()]
}

/** Documents administratifs du cheval, les plus récents d'abord. */
export async function chargerDocuments(chevalId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*, profil:profils(id, nom)')
    .eq('cheval_id', chevalId)
    .order('cree_le', { ascending: false })

  if (error) throw error
  return data || []
}

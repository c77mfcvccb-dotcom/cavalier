// Requêtes Supabase partagées. Le RLS filtre déjà les lignes accessibles :
// ces fonctions ne refont donc pas de contrôle de droits côté client.
import { supabase } from './supabase'
import { COULEUR_SOIN, identiteCavalier, repertoireCavaliers } from './couleurs'
import { cleJour, enDateLocale } from './format'

/**
 * Chevaux d'un cavalier, via la table de liaison (rôle + couleur inclus).
 *
 * `cheval:cheval_id(...)` et non `cheval:chevaux(...)` : depuis la 0019 la
 * table de liaison porte DEUX clés vers `chevaux` (la monture, et le cheval
 * remplacé) — sans la colonne explicite, PostgREST refuse de choisir et
 * répond « more than one relationship was found ». Même règle pour toute
 * jointure qui part de `cheval_cavaliers` ou y revient.
 */
export async function chargerMesChevaux(cavalierId) {
  const { data, error } = await supabase
    .from('cheval_cavaliers')
    .select('role, couleur, cheval:cheval_id(*)')
    .eq('cavalier_id', cavalierId)

  if (error) throw error
  // Ordre alphabétique, en français — accents pliés (Éclair avec Eclair),
  // comme la cavalerie côté club. L'ordre d'ajout n'aidait personne à
  // retrouver un cheval dans une liste.
  return (data || [])
    .filter((ligne) => ligne.cheval)
    .map((ligne) => ({ ...ligne.cheval, role: ligne.role, couleur: ligne.couleur }))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }))
}

/**
 * Cavalerie d'un club. Jointure inverse désambiguïsée, même raison que
 * ci-dessus.
 *
 * `avecPensions` élargit aux chevaux de propriétaires en pension confirmée
 * à l'écurie : c'est le périmètre des SOINS (l'accueil doit rappeler le
 * vermifuge du cheval en pension comme celui du cheval de club), mais pas
 * celui des COURS — la base refuse d'attribuer à un cours un cheval qui
 * n'appartient pas au club (trigger 0017), donc les écrans d'attribution
 * restent sur le réglage par défaut.
 */
export async function chargerChevauxClub(clubId, { avecPensions = false } = {}) {
  let requete = supabase
    .from('chevaux')
    .select('*, cheval_cavaliers!cheval_id(count)')
  requete = avecPensions
    ? requete.or(`club_id.eq.${clubId},and(ecurie_id.eq.${clubId},pension_confirmee.eq.true)`)
    : requete.eq('club_id', clubId)

  const { data, error } = await requete.order('nom')

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
  // `remplacement` : le cheval indisponible que cette liaison remplace
  // (0019) — le nom ne revient que si le lecteur a accès à ce cheval-là,
  // le badge se dégrade alors sans casser la liste.
  const { data, error } = await supabase
    .from('cheval_cavaliers')
    .select(
      'id, role, couleur, cavalier_id, remplacement_de, profil:profils(id, nom, photo_url, niveau_galop), remplacement:remplacement_de(id, nom)'
    )
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
 * Passages en cours d'un ou plusieurs chevaux : les attributions posées par
 * le club, mises en forme d'événement de calendrier. Un cheval attribué à
 * un cours y travaille autant qu'en créneau — son calendrier doit le dire,
 * sinon la fiche ment sur sa journée.
 *
 * Le RLS fait le tri : sur un cheval de particulier la table est muette, et
 * seuls les membres du club voient ses cours.
 */
export async function chargerPassagesCours({ chevauxIds, debut, fin }) {
  if (!chevauxIds?.length) return []

  let requete = supabase
    .from('inscriptions_cours')
    .select(
      `id, cheval_id, cavalier_id, statut,
       cavalier:profils(id, nom, photo_url),
       cheval:cheval_id(id, nom),
       cours:cours_id!inner(id, debut, fin, discipline, niveau, moniteur)`
    )
    .in('cheval_id', chevauxIds)
    .eq('statut', 'inscrit')

  if (debut) requete = requete.gte('cours.debut', debut.toISOString())
  if (fin) requete = requete.lte('cours.debut', fin.toISOString())

  const { data, error } = await requete
  if (error) throw error

  return (data || []).map((inscription) => ({
    id: `cours-${inscription.id}`,
    genre: 'cours',
    cheval_id: inscription.cheval_id,
    cheval: inscription.cheval,
    cavalier_id: inscription.cavalier_id,
    cavalier: inscription.cavalier,
    debut: inscription.cours.debut,
    fin: inscription.cours.fin,
    discipline: inscription.cours.discipline,
    niveau: inscription.cours.niveau,
    moniteur: inscription.cours.moniteur,
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

  const [creneaux, echeances, passages] = await Promise.all([
    chargerCreneaux({ chevauxIds, debut, fin }),
    chargerEcheances(),
    chargerPassagesCours({ chevauxIds, debut, fin }),
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

  return [...creneaux.map((c) => ({ ...c, genre: 'creneau' })), ...soins, ...passages].sort(
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

/**
 * Le carnet de santé se lit par la vue v_soins (migration 0019), jamais par
 * la table : la colonne `cout` y est masquée pour qui n'est ni l'auteur du
 * soin ni le gestionnaire du cheval — et la table refuse de toute façon la
 * lecture directe de cette colonne.
 */
export async function chargerSoins(chevalId) {
  const { data, error } = await supabase
    .from('v_soins')
    .select('*')
    .eq('cheval_id', chevalId)
    .order('date_realisee', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Le journal de la cavalerie : les dernières séances de tous les chevaux
 * donnés, cavalier et cheval compris — ce que les demi-pensionnaires
 * notent, vu depuis le bureau du club.
 */
export async function chargerJournalSeances(chevauxIds, { limite = 100 } = {}) {
  if (!chevauxIds?.length) return []

  const { data, error } = await supabase
    .from('seances')
    .select('*, cavalier:profils(id, nom, photo_url), cheval:chevaux(id, nom)')
    .in('cheval_id', chevauxIds)
    .order('date', { ascending: false })
    .order('cree_le', { ascending: false })
    .limit(limite)

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
 * Clubs auxquels un cavalier est rattaché — par ADHÉSION depuis la
 * migration 0018 (table membres_club, rejointe avec le code d'écurie), et
 * non plus déduits des liens aux chevaux. `mes_adhesions()` dit aussi le
 * siège et l'état de l'abonnement du club, que le RLS d'abonnements ne
 * laisserait pas lire directement.
 */
export async function chargerMesClubs() {
  const { data, error } = await supabase.rpc('mes_adhesions')
  if (error) throw error
  return (data || []).map((a) => ({
    id: a.club_id,
    nom: a.club_nom,
    siege: a.siege,
    siege_depuis: a.siege_depuis,
    club_premium: a.club_premium,
    cree_le: a.cree_le,
  }))
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

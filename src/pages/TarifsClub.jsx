import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { euros } from '../lib/depenses'
import { PERIODICITES_TARIF } from '../lib/constantes'
import { Champ, Chargement, Erreur, EtatVide, Feuille } from '../composants/Ui'
import { Entete } from '../composants/Mise'

/**
 * La grille tarifaire du club — même route des deux côtés (comme
 * « Mon club ») : le gérant la construit, ses adhérents la consultent.
 */
export default function TarifsClub() {
  const { estClub } = useAuth()
  return estClub ? <TarifsGerant /> : <TarifsCavalier />
}

/* ============================================================
   Côté gérant : ajout, édition, masquage, réordre, suppression
   ============================================================ */
function TarifsGerant() {
  const { profil } = useAuth()
  const [tarifs, setTarifs] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [tarifOuvertId, setTarifOuvertId] = useState(null)

  const recharger = useCallback(async () => {
    const { data, error } = await supabase
      .from('tarifs_club')
      .select('*')
      .eq('club_id', profil.id)
      .order('ordre')
    if (error) throw error
    setTarifs(data || [])
  }, [profil.id])

  useEffect(() => {
    recharger()
      .catch((e) => setErreur(e.message || 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [recharger])

  // Aucune colonne unique sur `ordre` : un simple échange de valeur entre
  // deux lignes voisines suffit, pas besoin de renuméroter toute la liste.
  async function deplacer(tarif, sens) {
    const index = tarifs.findIndex((t) => t.id === tarif.id)
    const voisin = tarifs[index + sens]
    if (!voisin) return
    setErreur('')
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('tarifs_club').update({ ordre: voisin.ordre }).eq('id', tarif.id),
      supabase.from('tarifs_club').update({ ordre: tarif.ordre }).eq('id', voisin.id),
    ])
    if (e1 || e2) setErreur((e1 || e2).message)
    else recharger()
  }

  const tarifOuvert = tarifs.find((t) => t.id === tarifOuvertId) || null

  if (chargement) return <Chargement />

  return (
    <>
      <Entete titre="Tarifs" sousTitre="Votre grille, visible de vos adhérents" retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {tarifs.length === 0 ? (
          <EtatVide
            emoji="💶"
            titre="Aucun tarif publié"
            texte="Ajoutez vos formules — pension, demi-pension, cours à l'unité… — pour que vos adhérents les consultent depuis leur téléphone."
          />
        ) : (
          <div className="liste">
            {tarifs.map((tarif, index) => (
              <div key={tarif.id} className="element">
                <div className="pile" style={{ gap: 2 }}>
                  <button
                    type="button"
                    className="bouton fantome petit"
                    style={{ padding: '1px 6px', minHeight: 0 }}
                    onClick={() => deplacer(tarif, -1)}
                    disabled={index === 0}
                    aria-label={`Monter « ${tarif.nom} »`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="bouton fantome petit"
                    style={{ padding: '1px 6px', minHeight: 0 }}
                    onClick={() => deplacer(tarif, 1)}
                    disabled={index === tarifs.length - 1}
                    aria-label={`Descendre « ${tarif.nom} »`}
                  >
                    ▼
                  </button>
                </div>

                <button
                  className="corps document-lien"
                  onClick={() => setTarifOuvertId(tarif.id)}
                >
                  <div className="titre">{tarif.nom}</div>
                  <div className="meta">
                    {euros(tarif.prix, { centimes: true })}
                    {PERIODICITES_TARIF[tarif.periodicite]?.suffixe}
                  </div>
                  {tarif.description && <div className="meta">{tarif.description}</div>}
                </button>

                {!tarif.visible && <span className="badge contour">Masqué</span>}
                <span className="fleche">›</span>
              </div>
            ))}
          </div>
        )}
      </main>

      <button
        className="bouton-flottant"
        aria-label="Ajouter un tarif"
        onClick={() => setCreationOuverte(true)}
      >
        +
      </button>

      <FeuilleTarif
        clubId={profil.id}
        tarif={null}
        nouvelOrdre={tarifs.length ? Math.max(...tarifs.map((t) => t.ordre)) + 1 : 0}
        ouverte={creationOuverte}
        onFermer={() => setCreationOuverte(false)}
        onEnregistre={() => {
          setCreationOuverte(false)
          recharger()
        }}
      />

      <FeuilleTarif
        clubId={profil.id}
        tarif={tarifOuvert}
        ouverte={Boolean(tarifOuvert)}
        onFermer={() => setTarifOuvertId(null)}
        onEnregistre={() => {
          setTarifOuvertId(null)
          recharger()
        }}
      />
    </>
  )
}

function FeuilleTarif({ clubId, tarif, nouvelOrdre, ouverte, onFermer, onEnregistre }) {
  const vide = { nom: '', prix: '', periodicite: 'mois', description: '', visible: true }
  const [valeurs, setValeurs] = useState(tarif || vide)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Repart des valeurs enregistrées (ou d'une feuille vierge) à chaque
  // ouverture — même mécanique que la fiche du cheval.
  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setValeurs(tarif || vide)
      setErreur('')
    }
  }

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  /**
   * Comme la photo de la fiche cheval : le masquage s'enregistre à part,
   * dès le clic, pas au submit du reste du formulaire — sans quoi fermer
   * la feuille sans passer par « Enregistrer » l'annulait silencieusement.
   */
  async function basculerVisible() {
    const nouvelleValeur = !valeurs.visible
    setErreur('')
    setValeurs((v) => ({ ...v, visible: nouvelleValeur }))
    const { error } = await supabase
      .from('tarifs_club')
      .update({ visible: nouvelleValeur })
      .eq('id', tarif.id)
    if (error) setErreur(error.message)
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    const lignes = {
      nom: valeurs.nom.trim(),
      prix: Number(valeurs.prix),
      periodicite: valeurs.periodicite,
      description: valeurs.description?.trim() || null,
    }

    const { error } = tarif
      ? await supabase.from('tarifs_club').update(lignes).eq('id', tarif.id)
      : await supabase
          .from('tarifs_club')
          .insert({ ...lignes, club_id: clubId, ordre: nouvelOrdre })

    setEnvoi(false)
    if (error) setErreur(error.message)
    else onEnregistre()
  }

  async function supprimer() {
    if (!window.confirm(`Supprimer « ${tarif.nom} » ?`)) return
    setErreur('')
    const { error } = await supabase.from('tarifs_club').delete().eq('id', tarif.id)
    if (error) setErreur(error.message)
    else onEnregistre()
  }

  return (
    <Feuille titre={tarif ? 'Modifier le tarif' : 'Nouveau tarif'} ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Nom">
          <input
            value={valeurs.nom}
            onChange={modifier('nom')}
            placeholder="Demi-pension 3j/semaine"
            required
            autoFocus
          />
        </Champ>

        <div className="ligne-champs">
          <Champ label="Prix">
            <input
              type="number"
              min="0"
              step="0.01"
              value={valeurs.prix}
              onChange={modifier('prix')}
              required
            />
          </Champ>
          <Champ label="Périodicité">
            <select value={valeurs.periodicite} onChange={modifier('periodicite')}>
              {Object.entries(PERIODICITES_TARIF).map(([cle, p]) => (
                <option key={cle} value={cle}>{p.libelle}</option>
              ))}
            </select>
          </Champ>
        </div>

        <Champ label="Description" aide="Optionnelle — détails, conditions…">
          <textarea value={valeurs.description || ''} onChange={modifier('description')} />
        </Champ>

        {tarif && (
          <div className="champ">
            <label className="interrupteur">
              <input type="checkbox" checked={valeurs.visible} onChange={basculerVisible} />
              <span>Visible par les adhérents</span>
            </label>
          </div>
        )}

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>

        {tarif && (
          <button
            type="button"
            className="bouton danger pleine-largeur"
            style={{ marginTop: 10 }}
            onClick={supprimer}
          >
            Supprimer ce tarif
          </button>
        )}
      </form>
    </Feuille>
  )
}

/* ============================================================
   Côté cavalier : lecture seule
   ============================================================ */
function TarifsCavalier() {
  const { clubId } = useParams()
  const [club, setClub] = useState(null)
  const [tarifs, setTarifs] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false

    async function charger() {
      const [{ data: clubData }, { data: tarifsData, error }] = await Promise.all([
        supabase.from('profils').select('id, nom, photo_url, ville').eq('id', clubId).maybeSingle(),
        supabase.from('tarifs_club').select('*').eq('club_id', clubId).order('ordre'),
      ])
      if (error) throw error
      if (annule) return
      setClub(clubData)
      setTarifs(tarifsData || [])
    }

    charger()
      .catch((e) => !annule && setErreur(e.message || 'Chargement impossible'))
      .finally(() => !annule && setChargement(false))

    return () => {
      annule = true
    }
  }, [clubId])

  if (chargement) return <Chargement />

  return (
    <>
      <Entete titre="Tarifs" sousTitre={club?.nom} retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>

        {tarifs.length === 0 ? (
          <EtatVide
            emoji="💶"
            titre="Aucun tarif publié"
            texte="Cette écurie n'a pas encore mis ses tarifs en ligne."
          />
        ) : (
          <div className="liste">
            {tarifs.map((tarif) => (
              <div key={tarif.id} className="carte">
                <div className="rangee espace">
                  <span className="gras">{tarif.nom}</span>
                  <span className="gras" style={{ whiteSpace: 'nowrap', marginLeft: 10 }}>
                    {euros(tarif.prix, { centimes: true })}
                    <span className="doux" style={{ fontWeight: 400 }}>
                      {PERIODICITES_TARIF[tarif.periodicite]?.suffixe}
                    </span>
                  </span>
                </div>
                {tarif.description && (
                  <p className="doux" style={{ marginTop: 6, fontSize: '0.88rem' }}>
                    {tarif.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

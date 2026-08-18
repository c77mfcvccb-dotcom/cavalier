import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as Lien, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexte/AuthContexte'
import { chargerCreneaux } from '../../lib/requetes'
import { useAgendaVivant } from '../../lib/temps-reel'
import { Champ, Chargement, Erreur, Feuille } from '../../composants/Ui'
import Calendrier from '../../composants/Calendrier'
import { TYPES_CRENEAU } from '../../lib/constantes'
import { identiteCavalier, repertoireCavaliers } from '../../lib/couleurs'
import { premiumPourCheval } from '../../lib/club'
import { cleJour, enDateLocale, formatDate, formatHeure, valeurDatetimeLocal } from '../../lib/format'
import {
  creneauHorsPlanGratuit,
  dernierJourGratuit,
  finSemaineCourante,
} from '../../lib/abonnement'

export default function OngletCalendrier({ cheval, cavaliers, estGestionnaire }) {
  const { profil } = useAuth()
  const [parametres, setParametres] = useSearchParams()
  const [creneaux, setCreneaux] = useState([])
  const [jour, setJour] = useState(() => new Date())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)

  // Même répertoire que celui des créneaux : la légende ci-dessous doit
  // porter exactement les couleurs et les prénoms lus dans la grille.
  const repertoire = useMemo(() => repertoireCavaliers(cavaliers), [cavaliers])

  const recharger = useCallback(async () => {
    try {
      setCreneaux(await chargerCreneaux({ chevauxIds: [cheval.id] }))
    } catch (e) {
      setErreur(e.message || 'Chargement du calendrier impossible')
    } finally {
      setChargement(false)
    }
  }, [cheval.id])

  useEffect(() => {
    recharger()
  }, [recharger])

  // Le co-cavalier qui saisit depuis son propre téléphone met cet écran à
  // jour sans qu'on ait à le recharger.
  useAgendaVivant([cheval.id], recharger)

  /**
   * Arrivée depuis le calendrier global, qui a désigné un jour et demandé la
   * création. Les paramètres sont consommés une fois puis retirés de l'URL :
   * sans cela, un retour en arrière rouvrirait la feuille, et un partage du
   * lien ferait de même chez le destinataire.
   */
  useEffect(() => {
    const cible = parametres.get('jour')
    const creation = parametres.get('nouveau') === '1'
    if (!cible && !creation) return

    if (cible) setJour(enDateLocale(cible))
    if (creation) setFeuilleOuverte(true)

    const suite = new URLSearchParams(parametres)
    suite.delete('jour')
    suite.delete('nouveau')
    setParametres(suite, { replace: true })
    // Une seule fois, à l'ouverture : les dépendances rejoueraient l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleSelection = cleJour(jour)
  const creneauxDuJour = creneaux.filter((c) => cleJour(c.debut) === cleSelection)

  async function supprimer(creneau) {
    if (!window.confirm('Supprimer ce créneau ?')) return
    const { error } = await supabase.from('creneaux').delete().eq('id', creneau.id)
    if (error) setErreur(error.message)
    else recharger()
  }

  if (chargement) return <Chargement />

  return (
    <div className="pile" style={{ gap: 18 }}>
      <Erreur>{erreur}</Erreur>

      {/* Le jour sélectionné et son action d'ajout passent avant la grille :
          poser un créneau est le geste courant, il ne doit pas demander de
          faire défiler l'écran. */}
      <section>
        <div className="titre-section">
          <h2>{formatDate(jour, { avecJour: true })}</h2>
          <button className="lien" onClick={() => setFeuilleOuverte(true)}>+ Créneau</button>
        </div>

        {creneauxDuJour.length === 0 ? (
          <div className="carte centre doux">Personne ne monte ce jour-là</div>
        ) : (
          <div className="liste">
            {creneauxDuJour.map((creneau) => {
              const modifiable = creneau.cavalier_id === profil.id || estGestionnaire
              return (
                <div key={creneau.id} className="element">
                  <span className="bordure-couleur" style={{ background: creneau.couleur }} />
                  <div className="corps">
                    <div className="titre">
                      {creneau.titre || TYPES_CRENEAU[creneau.type] || 'Créneau'}
                    </div>
                    <div className="meta">
                      {formatHeure(creneau.debut)} – {formatHeure(creneau.fin)} ·{' '}
                      {creneau.cavalier?.nom}
                    </div>
                    {creneau.notes && <div className="meta">{creneau.notes}</div>}
                  </div>
                  {modifiable && (
                    <button className="bouton fantome petit" onClick={() => supprimer(creneau)}>
                      Supprimer
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Calendrier
        evenements={creneaux}
        jourSelectionne={jour}
        onSelectionJour={setJour}
        onAjout={(date) => {
          setJour(date)
          setFeuilleOuverte(true)
        }}
      />

      <div className="puces">
        {cavaliers.map((liaison) => {
          const identite = identiteCavalier(repertoire, liaison.cavalier_id, liaison.profil?.nom)
          return (
            <span
              key={liaison.id}
              className="badge"
              style={{ background: identite.fond, color: identite.texte }}
            >
              {identite.libelle}
            </span>
          )
        })}
      </div>

      <FeuilleCreneau
        cheval={cheval}
        cavaliers={cavaliers}
        estGestionnaire={estGestionnaire}
        jour={jour}
        ouverte={feuilleOuverte}
        onFermer={() => setFeuilleOuverte(false)}
        onAjoute={() => {
          setFeuilleOuverte(false)
          recharger()
        }}
      />
    </div>
  )
}

function FeuilleCreneau({
  cheval,
  cavaliers,
  estGestionnaire,
  jour,
  ouverte,
  onFermer,
  onAjoute,
}) {
  const { profil, estPremium, adhesions } = useAuth()
  // Premium contextuel (0018) : le siège offert par une écurie ouvre le
  // calendrier sans limite sur les chevaux de son périmètre.
  const premium = premiumPourCheval(cheval, { estPremium, adhesions })
  const navigate = useNavigate()

  const creneauParDefaut = useCallback(() => {
    const debut = new Date(jour)
    debut.setHours(10, 0, 0, 0)
    const fin = new Date(debut)
    fin.setHours(11, 0, 0, 0)

    // Un club n'est pas lui-même cavalier : on présélectionne alors le premier
    // cavalier lié au cheval plutôt que le compte connecté.
    const suisCavalier = cavaliers.some((liaison) => liaison.cavalier_id === profil.id)
    const cavalierParDefaut = suisCavalier
      ? profil.id
      : cavaliers[0]?.cavalier_id ?? profil.id

    return {
      debut: valeurDatetimeLocal(debut),
      fin: valeurDatetimeLocal(fin),
      type: 'monte',
      titre: '',
      notes: '',
      cavalier_id: cavalierParDefaut,
    }
  }, [jour, profil.id, cavaliers])

  const [valeurs, setValeurs] = useState(creneauParDefaut)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setValeurs(creneauParDefaut())
      setErreur('')
    }
  }

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')

    if (new Date(valeurs.fin) <= new Date(valeurs.debut)) {
      setErreur("L'heure de fin doit suivre l'heure de début")
      return
    }

    // Le serveur refusera de toute façon (politique RLS) : on préfère
    // conduire vers l'offre plutôt que d'afficher une erreur technique.
    if (!premium && creneauHorsPlanGratuit(valeurs.debut)) {
      navigate('/premium?motif=calendrier')
      return
    }

    setEnvoi(true)
    const { error } = await supabase.from('creneaux').insert({
      cheval_id: cheval.id,
      cavalier_id: valeurs.cavalier_id,
      debut: new Date(valeurs.debut).toISOString(),
      fin: new Date(valeurs.fin).toISOString(),
      type: valeurs.type,
      titre: valeurs.titre || null,
      notes: valeurs.notes || null,
    })

    setEnvoi(false)
    if (error) {
      // Filet : décalage d'horloge ou de fuseau entre le navigateur et le serveur
      if (error.message?.includes('row-level security')) {
        navigate('/premium?motif=calendrier')
        return
      }
      setErreur(error.message)
    } else onAjoute()
  }

  const borneGratuite = premium ? null : valeurDatetimeLocal(finSemaineCourante())

  return (
    <Feuille titre="Nouveau créneau" ouverte={ouverte} onFermer={onFermer}>
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        {estGestionnaire && cavaliers.length > 0 && (
          <Champ label="Cavalier">
            <select value={valeurs.cavalier_id} onChange={modifier('cavalier_id')}>
              {cavaliers.map((liaison) => (
                <option key={liaison.id} value={liaison.cavalier_id}>
                  {liaison.profil?.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}

        <Champ label="Type">
          <select value={valeurs.type} onChange={modifier('type')}>
            {Object.entries(TYPES_CRENEAU).map(([cle, libelle]) => (
              <option key={cle} value={cle}>{libelle}</option>
            ))}
          </select>
        </Champ>

        <div className="ligne-champs">
          <Champ label="Début">
            <input
              type="datetime-local"
              value={valeurs.debut}
              onChange={modifier('debut')}
              max={borneGratuite ?? undefined}
              required
            />
          </Champ>
          <Champ label="Fin">
            <input type="datetime-local" value={valeurs.fin} onChange={modifier('fin')} required />
          </Champ>
        </div>

        {!premium && (
          <p className="aide" style={{ marginTop: -6, marginBottom: 14 }}>
            Plan gratuit : jusqu'au {formatDate(dernierJourGratuit(), { avecJour: true })}.{' '}
            <Lien to="/premium?motif=calendrier">Passer en Premium</Lien> pour planifier
            au-delà.
          </p>
        )}

        <Champ label="Titre" aide="Facultatif">
          <input
            value={valeurs.titre}
            onChange={modifier('titre')}
            placeholder="Cours avec le moniteur…"
          />
        </Champ>

        <Champ label="Notes">
          <textarea value={valeurs.notes} onChange={modifier('notes')} />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Ajout…' : 'Ajouter au calendrier'}
        </button>
      </form>
    </Feuille>
  )
}

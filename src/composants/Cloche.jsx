import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { Feuille } from './Ui'
import { STATUTS_ECHEANCE, TYPES_SOIN } from '../lib/constantes'
import { accesOffert } from '../lib/club'
import { formatDate, joursRelatifs } from '../lib/format'

/**
 * Cloche de rappels, dans l'en-tête de chaque écran.
 *
 * Elle ne recalcule rien : la vue `v_rappels` (migration 0012) est bâtie
 * sur `v_echeances`, où vivent déjà le seuil des 14 jours, le
 * dédoublonnage par type de soin et le respect des rappels coupés. Deux
 * définitions de « ce qui est urgent » auraient divergé au premier
 * ajustement.
 *
 * Le badge compte les rappels NON LUS ; le panneau, lui, les montre tous.
 * Un rappel lu reste une échéance à traiter — marquer comme lu dit « j'ai
 * vu », pas « c'est fait ». Ce qui le fait disparaître, c'est
 * l'enregistrement du soin.
 */
export default function Cloche() {
  const { profil, utilisateur, estPremium, adhesions } = useAuth()
  const [rappels, setRappels] = useState([])
  const [ouvert, setOuvert] = useState(false)

  // L'abonnement perso, ou l'accès offert par une écurie (0018) : la vue
  // v_rappels ne renverra de toute façon que les chevaux réellement couverts.
  const premium = estPremium || accesOffert(adhesions)

  const charger = useCallback(async () => {
    if (!premium) {
      setRappels([])
      return
    }
    const { data, error } = await supabase
      .from('v_rappels')
      .select('*')
      .order('prochaine_echeance', { ascending: true })

    // Un rappel n'est jamais bloquant : en cas d'échec, la cloche
    // s'efface plutôt que d'afficher une erreur en tête de chaque écran.
    if (error) return
    setRappels(data || [])
  }, [premium])

  useEffect(() => {
    charger()
  }, [charger])

  // La cloche n'existe pas hors session, ni en plan gratuit sans accès
  // offert : le module de santé y est fermé, et une cloche vide
  // n'inviterait à rien.
  if (!profil || !premium) return null

  const nonLus = rappels.filter((r) => !r.lu)

  /** Les retards d'abord, puis par date : l'ordre de ce qui presse. */
  const tries = [...rappels].sort((a, b) => {
    if ((a.statut === 'retard') !== (b.statut === 'retard')) {
      return a.statut === 'retard' ? -1 : 1
    }
    return a.jours_restants - b.jours_restants
  })

  async function marquerLu(rappel) {
    setRappels((liste) =>
      liste.map((r) => (r.id === rappel.id ? { ...r, lu: true } : r))
    )
    const { error } = await supabase.from('rappels_lus').insert({
      profil_id: utilisateur.id,
      soin_id: rappel.id,
      echeance: rappel.prochaine_echeance,
    })
    if (error) charger()
  }

  async function toutMarquerLu() {
    const aMarquer = nonLus
    if (!aMarquer.length) return

    setRappels((liste) => liste.map((r) => ({ ...r, lu: true })))
    const { error } = await supabase.from('rappels_lus').insert(
      aMarquer.map((r) => ({
        profil_id: utilisateur.id,
        soin_id: r.id,
        echeance: r.prochaine_echeance,
      }))
    )
    if (error) charger()
  }

  return (
    <>
      <button
        type="button"
        className="cloche"
        onClick={() => setOuvert(true)}
        aria-label={
          nonLus.length
            ? `Rappels de soins, ${nonLus.length} non lu${nonLus.length > 1 ? 's' : ''}`
            : 'Rappels de soins'
        }
      >
        <span aria-hidden="true">🔔</span>
        {nonLus.length > 0 && (
          <span className="pastille" aria-hidden="true">
            {nonLus.length > 9 ? '9+' : nonLus.length}
          </span>
        )}
      </button>

      <Feuille titre="Rappels de soins" ouverte={ouvert} onFermer={() => setOuvert(false)}>
        {tries.length === 0 ? (
          <p className="doux centre" style={{ padding: '18px 0' }}>
            Rien à prévoir dans les quinze jours 👌
          </p>
        ) : (
          <>
            {nonLus.length > 0 && (
              <button
                className="bouton fantome petit"
                style={{ marginBottom: 10 }}
                onClick={toutMarquerLu}
              >
                Tout marquer comme lu
              </button>
            )}

            <div className="liste-rappels">
              {tries.map((rappel) => {
                const type = TYPES_SOIN[rappel.type] || TYPES_SOIN.autre
                const statut = STATUTS_ECHEANCE[rappel.statut] || STATUTS_ECHEANCE.ok

                return (
                  <div className={rappel.lu ? 'rappel lu' : 'rappel'} key={rappel.id}>
                    <Link
                      to={`/chevaux/${rappel.cheval_id}?onglet=soins`}
                      className="corps"
                      onClick={() => setOuvert(false)}
                    >
                      <span className="emoji" aria-hidden="true">{type.emoji}</span>
                      <span className="texte">
                        <span className="titre">
                          {rappel.cheval_nom} — {type.libelle.toLowerCase()} le{' '}
                          {formatDate(rappel.prochaine_echeance, { court: true })}
                        </span>
                        <span className="meta">{joursRelatifs(rappel.jours_restants)}</span>
                      </span>
                      <span className={`badge ${statut.classe}`}>{statut.libelle}</span>
                    </Link>

                    {!rappel.lu && (
                      <button
                        type="button"
                        className="marquer"
                        onClick={() => marquerLu(rappel)}
                      >
                        Marquer comme lu
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="aide" style={{ marginTop: 14 }}>
              Marquer comme lu retire le rappel du compteur, pas de la liste&nbsp;:
              l’échéance reste à traiter tant que le soin n’est pas enregistré.
              Les périodicités se règlent cheval par cheval, depuis l’onglet
              Soins.
            </p>
          </>
        )}
      </Feuille>
    </>
  )
}

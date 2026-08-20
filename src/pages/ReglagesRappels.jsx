import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { Chargement, Erreur, Succes } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import BloquePremium from '../composants/BloquePremium'
import { TYPES_SOIN } from '../lib/constantes'
import { premiumPourCheval } from '../lib/club'

/**
 * Périodicités de rappel, cheval par cheval.
 *
 * Le réglage porte sur le cheval et non sur le compte : il décrit le rythme
 * de soins d'un animal, que tous ses cavaliers partagent. Un changement est
 * donc visible par le co-cavalier — c'est voulu, et l'écran le dit.
 *
 * Ne sont proposés que les types qui ont une périodicité : une visite
 * vétérinaire n'appelle pas mécaniquement la suivante, et lui inventer un
 * rythme produirait des rappels sans objet.
 */
const TYPES_RAPPELABLES = Object.entries(TYPES_SOIN).filter(
  ([, type]) => type.intervalleJours
)

/** Traduit un nombre de jours en durée lisible, sans fausse précision. */
function dureeLisible(jours) {
  if (!jours) return ''
  if (jours % 365 === 0) {
    const ans = jours / 365
    return ans === 1 ? 'soit 1 an' : `soit ${ans} ans`
  }
  if (jours % 30 === 0) return `soit ${jours / 30} mois`
  if (jours % 7 === 0) return `soit ${jours / 7} semaines`
  return `soit environ ${Math.round(jours / 30.4)} mois`
}

export default function ReglagesRappels() {
  const { id } = useParams()
  const { estPremium, adhesions } = useAuth()

  const [cheval, setCheval] = useState(null)
  const [reglages, setReglages] = useState({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')

  // Le droit dépend du cheval (0018) : la fiche se charge donc AVANT de
  // trancher — club_id et ecurie_id disent si une écurie couvre. En
  // gratuit, la liste des réglages revient simplement vide sous RLS.
  const charger = useCallback(async () => {
    try {
      const [fiche, lignes] = await Promise.all([
        supabase.from('chevaux').select('id, nom, club_id, ecurie_id').eq('id', id).maybeSingle(),
        supabase
          .from('rappels_soins')
          .select('type, intervalle_jours, actif')
          .eq('cheval_id', id),
      ])
      if (fiche.error) throw fiche.error
      if (lignes.error) throw lignes.error

      setCheval(fiche.data)
      setReglages(Object.fromEntries((lignes.data || []).map((l) => [l.type, l])))
      setErreur('')
    } catch (e) {
      setErreur(e.message || 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [id])

  useEffect(() => {
    charger()
  }, [charger])

  const premium = premiumPourCheval(cheval, { estPremium, adhesions })

  /** Valeur affichée : le réglage du cheval, sinon la périodicité par défaut. */
  const valeur = (cle) =>
    reglages[cle]?.intervalle_jours ?? TYPES_SOIN[cle].intervalleJours
  const estActif = (cle) => reglages[cle]?.actif !== false
  const estPersonnalise = (cle) =>
    reglages[cle]?.intervalle_jours != null &&
    reglages[cle].intervalle_jours !== TYPES_SOIN[cle].intervalleJours

  /**
   * Un `upsert` plutôt qu'un insert conditionnel : une ligne absente vaut
   * « valeurs par défaut », et n'apparaît qu'au premier écart.
   */
  async function enregistrer(cle, champs) {
    const ligne = {
      cheval_id: id,
      type: cle,
      intervalle_jours: champs.intervalle_jours ?? valeur(cle),
      actif: champs.actif ?? estActif(cle),
      maj_le: new Date().toISOString(),
    }

    setReglages((precedent) => ({ ...precedent, [cle]: ligne }))
    setMessage('')

    const { error } = await supabase
      .from('rappels_soins')
      .upsert(ligne, { onConflict: 'cheval_id,type' })

    if (error) {
      setErreur(error.message)
      charger()
      return
    }
    setErreur('')
    setMessage('Réglage enregistré.')
  }

  /** Retour au défaut : on supprime la ligne plutôt que d'y réécrire la norme. */
  async function reinitialiser(cle) {
    setReglages((precedent) => {
      const suivant = { ...precedent }
      delete suivant[cle]
      return suivant
    })
    const { error } = await supabase
      .from('rappels_soins')
      .delete()
      .eq('cheval_id', id)
      .eq('type', cle)
    if (error) {
      setErreur(error.message)
      charger()
      return
    }
    setMessage('Périodicité par défaut rétablie.')
  }

  if (!chargement && !premium) {
    return (
      <>
        <Entete titre="Rappels" retour />
        <main className="contenu">
          <BloquePremium
            titre="Rappels de soins"
            texte="Vermifuge, ferrure, vaccin — Licol calcule la prochaine échéance et vous prévient par email."
            motif="soins"
          />
        </main>
      </>
    )
  }

  if (chargement) {
    return (
      <>
        <Entete titre="Rappels" retour />
        <main className="contenu">
          <Chargement />
        </main>
      </>
    )
  }

  return (
    <>
      <Entete titre="Rappels" sousTitre={cheval?.nom} retour />

      <main className="contenu">
        <Erreur>{erreur}</Erreur>
        <Succes>{message}</Succes>

        <p className="aide" style={{ marginBottom: 16 }}>
          Ces périodicités servent à proposer la prochaine échéance quand vous
          enregistrez un soin, et déclenchent les rappels par email à 14 jours,
          7 jours, puis le jour même. Elles décrivent le rythme du cheval&nbsp;:
          vos co-cavaliers voient les mêmes.
        </p>

        <div className="reglages-rappels">
          {TYPES_RAPPELABLES.map(([cle, type]) => {
            const actif = estActif(cle)
            return (
              <div className={actif ? 'reglage' : 'reglage inactif'} key={cle}>
                <div className="entete">
                  <span className="nom">
                    {type.libelle}
                    {estPersonnalise(cle) && (
                      <span className="badge contour" style={{ marginLeft: 8 }}>
                        personnalisé
                      </span>
                    )}
                  </span>
                  <label className="interrupteur">
                    <input
                      type="checkbox"
                      checked={actif}
                      onChange={(e) => enregistrer(cle, { actif: e.target.checked })}
                    />
                    <span>{actif ? 'Activé' : 'Coupé'}</span>
                  </label>
                </div>

                {actif && (
                  <>
                    <div className="saisie">
                      <input
                        type="number"
                        min="7"
                        max="1825"
                        value={valeur(cle)}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setReglages((p) => ({
                            ...p,
                            [cle]: { ...(p[cle] || {}), type: cle, intervalle_jours: n, actif: true },
                          }))
                        }}
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (n >= 7 && n <= 1825) enregistrer(cle, { intervalle_jours: n })
                        }}
                        aria-label={`Périodicité ${type.libelle} en jours`}
                      />
                      <span className="doux">jours — {dureeLisible(valeur(cle))}</span>
                    </div>

                    {estPersonnalise(cle) && (
                      <button
                        className="bouton fantome petit"
                        onClick={() => reinitialiser(cle)}
                      >
                        Revenir à {TYPES_SOIN[cle].intervalleJours} jours
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <p className="aide" style={{ marginTop: 18 }}>
          Un rappel coupé retire aussi l’échéance de l’écran d’accueil&nbsp;: le
          soin reste lisible dans le carnet, mais Licol cesse de le signaler.
          Les emails se désactivent globalement depuis votre profil.
        </p>
      </main>
    </>
  )
}

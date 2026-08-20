import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Champ, Erreur, Feuille } from './Ui'
import { CATEGORIES_DEPENSE } from '../lib/constantes'
import { cleJour } from '../lib/format'

/**
 * Saisie et modification d'une dépense.
 *
 * La même feuille sert aux deux : les champs sont identiques, et un
 * formulaire de modification distinct aurait dérivé du formulaire de
 * création à la première évolution.
 *
 * `profil_id` est toujours celui du compte connecté et n'est pas
 * modifiable — la politique RLS le refuserait de toute façon, mais autant
 * que l'interface n'ait jamais l'occasion de le proposer.
 */
export default function FeuilleDepense({
  ouverte,
  depense,
  chevaux,
  profilId,
  moisAffiche,
  onFermer,
  onEnregistre,
  // « Tous les chevaux » (dépense sans cheval) demande l'abonnement
  // personnel : l'accès offert par une écurie ne couvre que ses chevaux.
  sansCheval = true,
}) {
  const [montant, setMontant] = useState('')
  const [categorie, setCategorie] = useState('pension')
  const [chevalId, setChevalId] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  /**
   * Réinitialisation à chaque ouverture. La date proposée est celle du jour
   * si l'on saisit dans le mois courant, sinon le 1er du mois consulté :
   * en revenant sur un mois passé, on veut y ajouter une ligne, pas une
   * ligne datée d'aujourd'hui qui disparaîtrait de la vue.
   */
  useEffect(() => {
    if (!ouverte) return
    setErreur('')

    if (depense) {
      setMontant(String(depense.montant))
      setCategorie(depense.categorie)
      setChevalId(depense.cheval_id || '')
      setDate(depense.date)
      setNote(depense.note || '')
      return
    }

    const aujourdhui = new Date()
    const memeMois =
      moisAffiche.getFullYear() === aujourdhui.getFullYear() &&
      moisAffiche.getMonth() === aujourdhui.getMonth()

    setMontant('')
    setCategorie('pension')
    setChevalId('')
    setDate(cleJour(memeMois ? aujourdhui : moisAffiche))
    setNote('')
  }, [ouverte, depense, moisAffiche])

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')

    // La virgule est ce qu'on tape sur un clavier français ; l'input number
    // la refuse selon les navigateurs, d'où la normalisation.
    const valeur = Number(String(montant).replace(',', '.'))
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être supérieur à zéro')
      return
    }

    setEnvoi(true)
    const ligne = {
      profil_id: profilId,
      cheval_id: chevalId || null,
      montant: valeur,
      categorie,
      date,
      note: note.trim() || null,
    }

    const { error } = depense
      ? await supabase.from('depenses').update(ligne).eq('id', depense.id)
      : await supabase.from('depenses').insert(ligne)

    setEnvoi(false)
    if (error) {
      setErreur(error.message || 'Enregistrement impossible')
      return
    }
    onEnregistre()
  }

  return (
    <Feuille
      titre={depense ? 'Modifier la dépense' : 'Nouvelle dépense'}
      ouverte={ouverte}
      onFermer={onFermer}
    >
      <form onSubmit={enregistrer}>
        <Erreur>{erreur}</Erreur>

        <Champ label="Montant (€)">
          <input
            type="text"
            inputMode="decimal"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="320"
            autoFocus
            required
          />
        </Champ>

        <Champ label="Catégorie">
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {Object.entries(CATEGORIES_DEPENSE).map(([cle, item]) => (
              <option key={cle} value={cle}>
                {item.libelle}
              </option>
            ))}
          </select>
        </Champ>

        <Champ label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Champ>

        <Champ
          label="Cheval"
          aide={
            sansCheval
              ? '« Tous » pour une dépense qui ne se rattache à aucun cheval en particulier.'
              : "L'accès offert par votre écurie couvre les dépenses sur ses chevaux."
          }
        >
          <select value={chevalId} onChange={(e) => setChevalId(e.target.value)} required={!sansCheval}>
            {sansCheval ? (
              <option value="">Tous les chevaux</option>
            ) : (
              <option value="">— Choisir un cheval —</option>
            )}
            {chevaux.map((cheval) => (
              <option key={cheval.id} value={cheval.id}>
                {cheval.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ label="Note (facultative)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ferrure 4 pieds"
            maxLength={200}
          />
        </Champ>

        <button className="bouton pleine-largeur" disabled={envoi}>
          {envoi ? 'Enregistrement…' : depense ? 'Enregistrer' : 'Ajouter'}
        </button>
      </form>
    </Feuille>
  )
}

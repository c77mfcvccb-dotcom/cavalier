import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexte/AuthContexte'
import { supabase } from '../lib/supabase'
import { Champ, Erreur } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import ChargeurPhoto from '../composants/ChargeurPhoto'
import { SEXES } from '../lib/constantes'
import { LIMITE_CHEVAUX_GRATUIT } from '../lib/abonnement'
import { chargerNbChevauxDuCompte } from '../lib/requetes'

export default function NouveauCheval() {
  const { profil, estClub, estPremium } = useAuth()
  const navigate = useNavigate()
  const [quotaAtteint, setQuotaAtteint] = useState(false)

  // Le serveur refusera de toute façon ; on évite de faire remplir un
  // formulaire pour rien.
  useEffect(() => {
    if (estPremium) return
    chargerNbChevauxDuCompte(profil).then((nb) => setQuotaAtteint(nb >= LIMITE_CHEVAUX_GRATUIT))
  }, [estPremium, profil])

  const [valeurs, setValeurs] = useState({
    nom: '',
    photo_url: null,
    date_naissance: '',
    race: '',
    robe: '',
    sexe: '',
    proprietaire_nom: '',
    notes: '',
  })
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const modifier = (champ) => (e) =>
    setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  async function surSoumission(evenement) {
    evenement.preventDefault()
    setErreur('')
    setEnvoi(true)

    try {
      const { data, error } = await supabase
        .from('chevaux')
        .insert({
          ...valeurs,
          date_naissance: valeurs.date_naissance || null,
          sexe: valeurs.sexe || null,
          cree_par: profil.id,
          // Un club crée directement un cheval de club ; le trigger se charge
          // de la liaison quand c'est un cavalier qui crée.
          club_id: estClub ? profil.id : null,
        })
        .select()
        .single()

      if (error) throw error
      navigate(`/chevaux/${data.id}`, { replace: true })
    } catch (e) {
      // Le refus du RLS remonte ici si le quota a été atteint entre-temps
      if (e.message?.includes('row-level security')) {
        navigate('/premium?motif=chevaux', { replace: true })
        return
      }
      setErreur(e.message || "Création impossible")
      setEnvoi(false)
    }
  }

  if (quotaAtteint) return <Navigate to="/premium?motif=chevaux" replace />

  return (
    <>
      <Entete titre="Ajouter un cheval" retour />

      <main className="contenu">
        <form onSubmit={surSoumission}>
          <Erreur>{erreur}</Erreur>

          <ChargeurPhoto
            valeur={valeurs.photo_url}
            onChange={(url) => setValeurs((v) => ({ ...v, photo_url: url }))}
            label="Photo du cheval"
          />

          <Champ label="Nom">
            <input value={valeurs.nom} onChange={modifier('nom')} required autoFocus />
          </Champ>

          <div className="ligne-champs">
            <Champ label="Date de naissance">
              <input
                type="date"
                value={valeurs.date_naissance}
                onChange={modifier('date_naissance')}
              />
            </Champ>

            <Champ label="Sexe">
              <select value={valeurs.sexe} onChange={modifier('sexe')}>
                <option value="">—</option>
                {Object.entries(SEXES).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>{libelle}</option>
                ))}
              </select>
            </Champ>
          </div>

          <div className="ligne-champs">
            <Champ label="Race">
              <input value={valeurs.race} onChange={modifier('race')} placeholder="Selle français…" />
            </Champ>

            <Champ label="Robe">
              <input value={valeurs.robe} onChange={modifier('robe')} placeholder="Bai, alezan…" />
            </Champ>
          </div>

          {!estClub && (
            <Champ
              label="Propriétaire"
              aide="Laissez vide si le cheval vous appartient"
            >
              <input value={valeurs.proprietaire_nom} onChange={modifier('proprietaire_nom')} />
            </Champ>
          )}

          <Champ label="Notes">
            <textarea
              value={valeurs.notes}
              onChange={modifier('notes')}
              placeholder="Caractère, particularités, matériel…"
            />
          </Champ>

          <button className="bouton pleine-largeur" disabled={envoi}>
            {envoi ? 'Création…' : 'Créer la fiche'}
          </button>
        </form>
      </main>
    </>
  )
}

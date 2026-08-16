import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexte/AuthContexte'
import { Avatar, Champ, Erreur, Succes } from '../composants/Ui'
import { Entete } from '../composants/Mise'
import BlocAbonnement from '../composants/BlocAbonnement'
import ChargeurPhoto from '../composants/ChargeurPhoto'

export default function Profil() {
  const { profil, utilisateur, estClub, estPremium, rafraichirProfil, deconnexion } = useAuth()

  const [valeurs, setValeurs] = useState({
    nom: profil.nom || '',
    photo_url: profil.photo_url || null,
    niveau_galop: profil.niveau_galop || '',
    telephone: profil.telephone || '',
    ville: profil.ville || '',
    bio: profil.bio || '',
    seuil_inactivite_jours: profil.seuil_inactivite_jours ?? 7,
  })
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const modifier = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur('')
    setMessage('')
    setEnvoi(true)

    const { error } = await supabase
      .from('profils')
      .update({
        nom: valeurs.nom,
        photo_url: valeurs.photo_url,
        niveau_galop: valeurs.niveau_galop ? Number(valeurs.niveau_galop) : null,
        telephone: valeurs.telephone || null,
        ville: valeurs.ville || null,
        bio: valeurs.bio || null,
        seuil_inactivite_jours: Number(valeurs.seuil_inactivite_jours) || 7,
      })
      .eq('id', profil.id)

    setEnvoi(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setMessage('Profil enregistré')
    rafraichirProfil()
  }

  return (
    <>
      <Entete titre="Profil" />

      <main className="contenu">
        <div className="carte rangee" style={{ marginBottom: 18 }}>
          <Avatar profil={{ ...profil, photo_url: valeurs.photo_url }} taille="grand" />
          <div>
            <div className="gras">{profil.nom}</div>
            <div className="doux">{utilisateur.email}</div>
            <div className="puces" style={{ marginTop: 6 }}>
              <span className="badge">{estClub ? 'Compte club' : 'Compte cavalier'}</span>
              <span className={`badge ${estPremium ? 'ok' : 'contour'}`}>
                {estPremium ? 'Premium' : 'Plan gratuit'}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={enregistrer}>
          <Erreur>{erreur}</Erreur>
          <Succes>{message}</Succes>

          <ChargeurPhoto
            valeur={valeurs.photo_url}
            onChange={(url) => setValeurs((v) => ({ ...v, photo_url: url }))}
            forme="rond"
            label={estClub ? 'Logo du club' : 'Photo de profil'}
          />

          <Champ label={estClub ? 'Nom du club' : 'Nom'}>
            <input value={valeurs.nom} onChange={modifier('nom')} required />
          </Champ>

          {!estClub && (
            <Champ label="Niveau">
              <select value={valeurs.niveau_galop} onChange={modifier('niveau_galop')}>
                <option value="">Non renseigné</option>
                {[1, 2, 3, 4, 5, 6, 7].map((galop) => (
                  <option key={galop} value={galop}>Galop {galop}</option>
                ))}
              </select>
            </Champ>
          )}

          <div className="ligne-champs">
            <Champ label="Ville">
              <input value={valeurs.ville} onChange={modifier('ville')} />
            </Champ>
            <Champ label="Téléphone">
              <input type="tel" value={valeurs.telephone} onChange={modifier('telephone')} />
            </Champ>
          </div>

          <Champ label={estClub ? 'Présentation du club' : 'À propos'}>
            <textarea value={valeurs.bio} onChange={modifier('bio')} />
          </Champ>

          <Champ
            label="Alerte d'inactivité"
            aide="Signale un cheval qui n'a pas travaillé depuis ce nombre de jours."
          >
            <select
              value={valeurs.seuil_inactivite_jours}
              onChange={modifier('seuil_inactivite_jours')}
            >
              {[3, 5, 7, 10, 14, 21, 30].map((jours) => (
                <option key={jours} value={jours}>{jours} jours</option>
              ))}
            </select>
          </Champ>

          <button className="bouton pleine-largeur" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>

        <BlocAbonnement />

        <button
          className="bouton secondaire pleine-largeur"
          style={{ marginTop: 12 }}
          onClick={deconnexion}
        >
          Se déconnecter
        </button>
      </main>
    </>
  )
}

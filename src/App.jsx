import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexte/AuthContexte'
import { configurationManquante } from './lib/supabase'
import { Chargement } from './composants/Ui'
import { NavBas } from './composants/Mise'

import Rappels from './composants/Rappels'
import Connexion from './pages/Connexion'
import Inscription from './pages/Inscription'
import TableauBord from './pages/TableauBord'
import MesChevaux from './pages/MesChevaux'
import NouveauCheval from './pages/NouveauCheval'
import FicheCheval from './pages/FicheCheval'
import RejoindreCheval from './pages/RejoindreCheval'
import CalendrierGlobal from './pages/CalendrierGlobal'
import Profil from './pages/Profil'
import CarnetSante from './pages/CarnetSante'
import FichePublique from './pages/FichePublique'
import ClubCavalerie from './pages/ClubCavalerie'
import ClubSante from './pages/ClubSante'
import ClubPlanning from './pages/ClubPlanning'
import ClubDepenses from './pages/ClubDepenses'

function ConfigurationRequise() {
  return (
    <div className="ecran-auth">
      <div className="carte">
        <h2>Configuration à terminer</h2>
        <p className="doux" style={{ marginTop: 10 }}>
          Créez un fichier <code>.env</code> à la racine du projet à partir de{' '}
          <code>.env.example</code>, puis renseignez l'URL et la clé anonyme de votre projet
          Supabase. Le schéma SQL se trouve dans{' '}
          <code>supabase/migrations/0001_schema.sql</code>.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { session, profil, chargement, estClub } = useAuth()

  if (configurationManquante) return <ConfigurationRequise />
  if (chargement) return <Chargement />

  if (!session) {
    return (
      <Routes>
        {/* La fiche partagée s'ouvre sans compte : elle précède la redirection. */}
        <Route path="/public/:token" element={<FichePublique />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="*" element={<Navigate to="/connexion" replace />} />
      </Routes>
    )
  }

  // Session ouverte mais profil pas encore créé par le trigger d'inscription
  if (!profil) return <Chargement texte="Préparation de votre espace…" />

  return (
    <div className="app">
      <Rappels />

      <Routes>
        {estClub ? (
          <>
            <Route path="/" element={<ClubCavalerie />} />
            <Route path="/sante" element={<ClubSante />} />
            <Route path="/planning" element={<ClubPlanning />} />
            <Route path="/depenses" element={<ClubDepenses />} />
          </>
        ) : (
          <>
            <Route path="/" element={<TableauBord />} />
            <Route path="/chevaux" element={<MesChevaux />} />
            <Route path="/calendrier" element={<CalendrierGlobal />} />
            <Route path="/rejoindre" element={<RejoindreCheval />} />
          </>
        )}

        <Route path="/public/:token" element={<FichePublique />} />
        <Route path="/chevaux/nouveau" element={<NouveauCheval />} />
        <Route path="/chevaux/:id" element={<FicheCheval />} />
        <Route path="/chevaux/:id/carnet" element={<CarnetSante />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <NavBas />
    </div>
  )
}

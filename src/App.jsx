import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './contexte/AuthContexte'
import { configurationManquante } from './lib/supabase'
import { Chargement } from './composants/Ui'
import LimiteErreur from './composants/LimiteErreur'
import { ecranDiffere } from './lib/ecrans'
import { NavBas } from './composants/Mise'

import Rappels from './composants/Rappels'
import Connexion from './pages/Connexion'
import TableauBord from './pages/TableauBord'
import MesChevaux from './pages/MesChevaux'
import FicheCheval from './pages/FicheCheval'
import Profil from './pages/Profil'

/**
 * Écrans chargés à la demande.
 *
 * Le premier écran d'un cavalier n'a besoin ni des pages légales, ni de
 * l'abonnement, ni des trois écrans de club — soit un tiers du code de
 * l'application. Les charger d'avance retarde l'affichage de l'accueil sur
 * un téléphone en 4G, pour des écrans que beaucoup n'ouvriront jamais.
 *
 * Restent chargés d'emblée : l'accueil, la liste des chevaux, la fiche du
 * cheval et ses quatre onglets. C'est la boucle quotidienne, et y faire
 * clignoter un indicateur de chargement coûterait plus que ce qu'il
 * rapporte.
 *
 * Un chunk qui ne se télécharge pas — réseau coupé, déploiement en cours —
 * lève une erreur attrapée par LimiteErreur : écran lisible et bouton de
 * rechargement, pas page blanche.
 */
const Inscription = ecranDiffere(() => import('./pages/Inscription'))
const MotDePasseOublie = ecranDiffere(() => import('./pages/MotDePasseOublie'))
const Reinitialisation = ecranDiffere(() => import('./pages/Reinitialisation'))
const Premium = ecranDiffere(() => import('./pages/Premium'))
const CarnetSante = ecranDiffere(() => import('./pages/CarnetSante'))
const ReglagesRappels = ecranDiffere(() => import('./pages/ReglagesRappels'))
const FichePublique = ecranDiffere(() => import('./pages/FichePublique'))
const Cgv = ecranDiffere(() => import('./pages/legales/Cgv'))
const MentionsLegales = ecranDiffere(() => import('./pages/legales/MentionsLegales'))
const Confidentialite = ecranDiffere(() => import('./pages/legales/Confidentialite'))
const ClubAccueil = ecranDiffere(() => import('./pages/ClubAccueil'))
const ClubCavalerie = ecranDiffere(() => import('./pages/ClubCavalerie'))
const ClubPlanning = ecranDiffere(() => import('./pages/ClubPlanning'))
const ClubJournal = ecranDiffere(() => import('./pages/ClubJournal'))
const ClubCours = ecranDiffere(() => import('./pages/ClubCours'))
const Depenses = ecranDiffere(() => import('./pages/Depenses'))
const NouveauCheval = ecranDiffere(() => import('./pages/NouveauCheval'))
const RejoindreCheval = ecranDiffere(() => import('./pages/RejoindreCheval'))
const CalendrierGlobal = ecranDiffere(() => import('./pages/CalendrierGlobal'))
const MesCours = ecranDiffere(() => import('./pages/MesCours'))
const MonClub = ecranDiffere(() => import('./pages/MonClub'))
const Bienvenue = ecranDiffere(() => import('./pages/Bienvenue'))

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
  const { session, profil, chargement, estClub, recuperation } = useAuth()
  const { pathname } = useLocation()

  if (configurationManquante) return <ConfigurationRequise />
  if (chargement) return <Chargement />

  // Hors des deux arbres de routes, à dessein : le lien reçu par mail ouvre
  // une session, l'application basculerait donc en mode connecté et
  // renverrait vers l'accueil — avec sa barre de navigation — avant même que
  // le nouveau mot de passe ait pu être saisi.
  if (pathname === '/reinitialisation') {
    return (
      <Suspense fallback={<Chargement />}>
        <Reinitialisation />
      </Suspense>
    )
  }

  // Le lien de récupération n'atterrit pas toujours sur /reinitialisation :
  // si l'URL de retour n'est pas dans la liste blanche du projet Supabase,
  // le serveur d'authentification renvoie sur la Site URL, jeton compris. La
  // session s'ouvre alors sur l'accueil et la saisie du nouveau mot de passe
  // n'a jamais lieu. Tant qu'elle n'a pas eu lieu, tout chemin y ramène.
  if (recuperation) return <Navigate to="/reinitialisation" replace />

  if (!session) {
    return (
      <Suspense fallback={<Chargement />}>
        <Routes>
        {/* La fiche partagée s'ouvre sans compte : elle précède la redirection. */}
        <Route path="/public/:token" element={<FichePublique />} />
        {/* Les pages légales aussi : elles doivent être lisibles AVANT de
            créer un compte, sans quoi la case d'acceptation ne vaut rien. */}
        <Route path="/cgv" element={<Cgv />} />
        <Route path="/mentions-legales" element={<MentionsLegales />} />
        <Route path="/confidentialite" element={<Confidentialite />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
          <Route path="*" element={<Navigate to="/connexion" replace />} />
        </Routes>
      </Suspense>
    )
  }

  // Session ouverte mais profil pas encore créé par le trigger d'inscription
  if (!profil) return <Chargement texte="Préparation de votre espace…" />

  return (
    <div className="app">
      <Rappels />

      {/* Remonté à chaque changement d'écran : sans cette clé, une erreur
          survenue sur un onglet condamnerait tous les suivants. */}
      <LimiteErreur key={pathname}>
        <Suspense fallback={<Chargement />}>
          <Routes>
            {estClub ? (
              <>
                <Route path="/" element={<ClubAccueil />} />
                <Route path="/chevaux" element={<ClubCavalerie />} />
                {/* L'écran Santé a fusionné dans l'Accueil : ses données,
                    elles, n'ont pas bougé — mêmes tables, mêmes fiches. */}
                <Route path="/sante" element={<Navigate to="/" replace />} />
                <Route path="/planning" element={<ClubPlanning />} />
                <Route path="/journal" element={<ClubJournal />} />
                <Route path="/cours" element={<ClubCours />} />
              </>
            ) : (
              <>
                {/* Compte tout neuf : l'inscription pose un drapeau, le
                    premier passage sur l'accueil propose le code d'écurie.
                    L'écran retire le drapeau dès son affichage. */}
                <Route
                  path="/"
                  element={
                    sessionStorage.getItem('licol.bienvenue') === '1'
                      ? <Navigate to="/bienvenue" replace />
                      : <TableauBord />
                  }
                />
                <Route path="/bienvenue" element={<Bienvenue />} />
                <Route path="/chevaux" element={<MesChevaux />} />
                <Route path="/calendrier" element={<CalendrierGlobal />} />
                <Route path="/cours" element={<MesCours />} />
                {/* Cavalier seulement : la fonction dépenses n'existe plus
                    côté écurie — un club qui tape l'URL retombe à l'accueil. */}
                <Route path="/depenses" element={<Depenses />} />
                <Route path="/rejoindre" element={<RejoindreCheval />} />
              </>
            )}

            <Route path="/public/:token" element={<FichePublique />} />
            {/* La même route pour les deux visages : adhérent ou gérant. */}
            <Route path="/club" element={<MonClub />} />
            <Route path="/chevaux/nouveau" element={<NouveauCheval />} />
            <Route path="/chevaux/:id" element={<FicheCheval />} />
            <Route path="/chevaux/:id/carnet" element={<CarnetSante />} />
            <Route path="/chevaux/:id/rappels" element={<ReglagesRappels />} />
            <Route path="/profil" element={<Profil />} />
            <Route path="/premium" element={<Premium />} />
            {/* Accessible connecté : le lien « demander un nouveau lien » de
                l'écran de réinitialisation peut être suivi alors qu'une session
                est déjà ouverte. */}
            <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
            <Route path="/cgv" element={<Cgv />} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </LimiteErreur>

      <NavBas />
    </div>
  )
}

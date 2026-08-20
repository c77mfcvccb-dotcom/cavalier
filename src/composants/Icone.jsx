/**
 * Les icônes de l'application : un trait fin, monochromes, dessinées ici
 * plutôt qu'importées — pas de librairie pour huit pictogrammes, et la
 * couleur suit le texte (currentColor), donc l'état actif de la barre du
 * bas comme le thème des boutons s'appliquent tout seuls.
 *
 * Les emojis qui tenaient ce rôle donnaient un ton gadget à l'ensemble ;
 * un trait neutre laisse les couleurs porter le sens (cavaliers, urgences).
 */
const TRACES = {
  accueil: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
    </>
  ),
  // Le fer à cheval, étampures comprises : la marque de la maison.
  chevaux: (
    <>
      <path d="M6.2 20.5c-2.6-4.4-2.8-10 .6-13.6a7.3 7.3 0 0 1 10.4 0c3.4 3.6 3.2 9.2.6 13.6" />
      <path d="M6.2 20.5l2.6-1.4M17.8 20.5l-2.6-1.4" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  cours: (
    <>
      <path d="M12 4.5 21.5 9 12 13.5 2.5 9Z" />
      <path d="M6.5 11.2v4.3c0 2.3 11 2.3 11 0v-4.3" />
      <path d="M21.5 9v4.5" />
    </>
  ),
  club: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c0-3.3 2.7-5.3 6-5.3s6 2 6 5.3" />
      <path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.4M17.5 14.6c2.1.7 3.5 2.4 3.5 4.9" />
    </>
  ),
  profil: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c.8-4 3.9-6 7.5-6s6.7 2 7.5 6" />
    </>
  ),
  cloche: (
    <>
      <path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.8 2.5H4.2Z" />
      <path d="M10 21a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  photo: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  alerte: (
    <>
      <path d="M12 4 21.5 20h-19Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2v.4" />
    </>
  ),
}

export default function Icone({ nom, taille = 22 }) {
  const trace = TRACES[nom]
  if (!trace) return null
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {trace}
    </svg>
  )
}

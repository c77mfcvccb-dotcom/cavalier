/**
 * Rappels de soins par email — fonction planifiée.
 *
 * Appelée une fois par jour par pg_cron. Elle ne décide de rien : toute
 * l'éligibilité — jalons J-14 / J-7 / jour J, premium, consentement,
 * doublons déjà envoyés — vit dans `rappels_du_jour()` (migration 0011).
 * Ici, on groupe par destinataire, on poste, on journalise.
 *
 * Ce partage n'est pas cosmétique : la règle métier est ainsi testable en
 * SQL, et un correctif de périmètre ne demande pas de redéployer la
 * fonction.
 *
 * Déploiement :
 *   supabase functions deploy rappels-soins --no-verify-jwt
 *   supabase secrets set RESEND_API_KEY=<clé Resend>
 *   supabase secrets set RAPPELS_EXPEDITEUR="Licol <rappels@votre-domaine.fr>"
 *   supabase secrets set RAPPELS_SECRET=<valeur longue et aléatoire>
 *   supabase secrets set LICOL_URL=https://votre-domaine.fr
 *
 * Puis planifier l'appel (voir docs/rappels.md).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLE_RESEND = Deno.env.get('RESEND_API_KEY')
const EXPEDITEUR = Deno.env.get('RAPPELS_EXPEDITEUR') ?? 'Licol <onboarding@resend.dev>'
const SECRET = Deno.env.get('RAPPELS_SECRET')
const LICOL_URL = Deno.env.get('LICOL_URL') ?? ''

/** Libellés des types de soins — les mêmes que dans l'interface. */
const TYPES: Record<string, string> = {
  ferrure: 'ferrure',
  veterinaire: 'visite vétérinaire',
  vaccin: 'vaccin',
  vermifuge: 'vermifuge',
  osteopathe: 'séance d’ostéopathie',
  dentiste: 'visite du dentiste',
  autre: 'soin',
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** « 24 août 2026 » — la colonne est une DATE, jamais un instant. */
function dateLisible(iso: string): string {
  const [annee, mois, jour] = iso.split('-').map(Number)
  return `${jour} ${MOIS[mois - 1]} ${annee}`
}

function echeanceLisible(jalon: number): string {
  if (jalon === 0) return "c'est aujourd'hui"
  if (jalon === 7) return 'dans une semaine'
  return 'dans deux semaines'
}

type Rappel = {
  destinataire_id: string
  email: string
  nom: string | null
  soin_id: string
  cheval_nom: string
  type: string
  echeance: string
  jalon: number
}

/**
 * Un seul email par destinataire, quel que soit le nombre d'échéances.
 *
 * Trois emails le même matin pour trois chevaux d'une même écurie, ce sont
 * trois occasions de se désabonner. Le sujet reprend la ligne unique quand
 * il n'y en a qu'une, et compte sinon.
 */
function composer(rappels: Rappel[]): { sujet: string; html: string; texte: string } {
  const lignes = rappels.map((r) => ({
    titre: `${r.cheval_nom} — ${TYPES[r.type] ?? r.type} à prévoir le ${dateLisible(r.echeance)}`,
    quand: echeanceLisible(r.jalon),
    urgent: r.jalon === 0,
  }))

  const sujet =
    lignes.length === 1
      ? lignes[0].titre
      : `${lignes.length} échéances de soins à prévoir`

  const texte = lignes.map((l) => `• ${l.titre} (${l.quand})`).join('\n')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            max-width:520px;margin:0 auto;padding:24px;color:#1b1a17">
  <h1 style="font-size:18px;margin:0 0 4px">Échéances de soins</h1>
  <p style="color:#6f6a61;font-size:14px;margin:0 0 20px">
    ${lignes.length === 1 ? 'Un soin est à prévoir.' : `${lignes.length} soins sont à prévoir.`}
  </p>
  <table style="width:100%;border-collapse:collapse">
    ${lignes
      .map(
        (l) => `
    <tr>
      <td style="padding:12px 14px;border:1px solid #e7e1d8;border-radius:10px;
                 background:${l.urgent ? '#fbe4e1' : '#ffffff'};font-size:14px">
        <strong>${l.titre}</strong><br>
        <span style="color:#6f6a61;font-size:13px">${l.quand}</span>
      </td>
    </tr>
    <tr><td style="height:8px"></td></tr>`
      )
      .join('')}
  </table>
  ${
    LICOL_URL
      ? `<p style="margin:20px 0 0">
           <a href="${LICOL_URL}" style="background:#1f3a2e;color:#fff;text-decoration:none;
              padding:11px 18px;border-radius:10px;font-size:14px;display:inline-block">
             Ouvrir Licol
           </a>
         </p>`
      : ''
  }
  <p style="color:#6f6a61;font-size:12px;margin-top:24px;line-height:1.5">
    Vous recevez cet email parce que les rappels de soins sont activés sur
    votre compte Licol. Vous pouvez les couper à tout moment depuis
    <em>Profil → Rappels par email</em>.
  </p>
</div>`

  return { sujet, html, texte }
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return new Response('Méthode non autorisée', { status: 405 })
  }

  // Déclenchée par pg_cron, pas par un navigateur : un secret partagé
  // suffit, et évite qu'un tiers puisse provoquer des envois en masse.
  if (!SECRET || requete.headers.get('Authorization') !== SECRET) {
    return new Response('Non autorisé', { status: 401 })
  }

  if (!CLE_RESEND) {
    console.error('RESEND_API_KEY absente : aucun email ne peut partir')
    return new Response('Service d’email non configuré', { status: 500 })
  }

  const supabase = createClient(URL_SUPABASE, CLE_SERVICE, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.rpc('rappels_du_jour')
  if (error) {
    console.error('Lecture des rappels impossible', error)
    return new Response('Erreur base', { status: 500 })
  }

  const rappels = (data ?? []) as Rappel[]
  if (rappels.length === 0) {
    return Response.json({ destinataires: 0, envoyes: 0, echecs: 0 })
  }

  const parDestinataire = new Map<string, Rappel[]>()
  for (const rappel of rappels) {
    const liste = parDestinataire.get(rappel.destinataire_id) ?? []
    liste.push(rappel)
    parDestinataire.set(rappel.destinataire_id, liste)
  }

  let envoyes = 0
  let echecs = 0

  for (const [destinataire, liste] of parDestinataire) {
    const { sujet, html, texte } = composer(liste)

    try {
      const reponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLE_RESEND}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EXPEDITEUR,
          to: [liste[0].email],
          subject: sujet,
          html,
          text: texte,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!reponse.ok) {
        console.error('Envoi refusé', destinataire, reponse.status, await reponse.text())
        echecs++
        continue
      }

      // Journalisé APRÈS l'envoi, et seulement en cas de succès : un
      // rappel non parti doit repartir demain. L'inverse — journaliser
      // d'abord — perdrait silencieusement les emails en échec.
      const { error: erreurJournal } = await supabase.from('rappels_envoyes').insert(
        liste.map((r) => ({
          soin_id: r.soin_id,
          destinataire_id: r.destinataire_id,
          jalon: r.jalon,
          echeance: r.echeance,
        }))
      )
      if (erreurJournal) {
        // L'email est parti : le signaler sans faire échouer le lot. Le
        // risque résiduel est un doublon demain, pas un rappel manquant.
        console.error('Journal non écrit', destinataire, erreurJournal)
      }

      envoyes++
    } catch (erreur) {
      console.error('Envoi impossible', destinataire, erreur)
      echecs++
    }
  }

  return Response.json({ destinataires: parDestinataire.size, envoyes, echecs })
})

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurationManquante = !url || !cle

if (configurationManquante) {
  console.warn(
    "Configuration Supabase absente : copiez .env.example vers .env et renseignez " +
      'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.'
  )
}

// Un client factice évite un écran blanc tant que le .env n'est pas rempli.
export const supabase = configurationManquante
  ? null
  : createClient(url, cle, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

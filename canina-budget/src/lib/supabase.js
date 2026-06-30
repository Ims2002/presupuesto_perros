import { createClient } from '@supabase/supabase-js'

/**
 * Cliente singleton de Supabase compartido por toda la app.
 *
 * Se inicializa con:
 *   - La URL del proyecto (único por proyecto Supabase)
 *   - La "publishable key" (anon key): clave pública segura para el navegador.
 *     Solo puede operar dentro de los límites que fijen las políticas RLS
 *     definidas en Supabase; nunca expone datos protegidos por sí sola.
 *
 * Importar desde cualquier componente:
 *   import { supabase } from '../lib/supabase'
 */
export const supabase = createClient(
  'https://hyafzdpzdspnzckatmyq.supabase.co',
  'sb_publishable_yV-kM8RdSkOe2rzlL4RA3g_-akw9lmY'
)

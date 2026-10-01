import { createClient } from '@supabase/supabase-js'
import { fetchConLog } from './httpLog'

/**
 * Cliente singleton de Supabase compartido por toda la app.
 *
 * Se inicializa con:
 *   - La URL del proyecto (único por proyecto Supabase)
 *   - La "publishable key" (anon key): clave pública segura para el navegador.
 *     Solo puede operar dentro de los límites que fijen las políticas RLS
 *     definidas en Supabase; nunca expone datos protegidos por sí sola.
 *
 * No se importa directamente desde los componentes: todo el acceso a datos
 * pasa por lib/presupuestosRepo.js.
 */
export const supabase = createClient(
  'https://hyafzdpzdspnzckatmyq.supabase.co',
  'sb_publishable_yV-kM8RdSkOe2rzlL4RA3g_-akw9lmY',
  { global: { fetch: fetchConLog } }
)

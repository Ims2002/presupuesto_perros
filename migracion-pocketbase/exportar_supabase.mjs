/**
 * PASO 1 — Copia de seguridad de Supabase a un JSON local.
 *
 * Descarga TODOS los registros de la tabla "presupuestos" usando la misma
 * clave pública que usa la app, y los guarda en:
 *   migracion-pocketbase/backup/presupuestos_supabase_<fecha>.json
 *
 * Uso (desde la carpeta "presupuestos"):
 *   node migracion-pocketbase/exportar_supabase.mjs
 *
 * Requisitos: Node 18+ (usa fetch nativo). No necesita instalar nada.
 * Ejecútalo mientras el proyecto de Supabase esté activo: si se vuelve a
 * pausar, la exportación fallará con "fetch failed".
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hyafzdpzdspnzckatmyq.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_yV-kM8RdSkOe2rzlL4RA3g_-akw9lmY'
const TABLA = 'presupuestos'
const PAGINA = 1000 // máximo de filas que Supabase devuelve por petición

const aqui = dirname(fileURLToPath(import.meta.url))

async function main() {
  const filas = []
  for (let offset = 0; ; offset += PAGINA) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLA}?select=*&order=created_at.asc&limit=${PAGINA}&offset=${offset}`
    let res
    try {
      res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Accept: 'application/json' } })
    } catch (err) {
      throw new Error(
        `No se pudo conectar con Supabase (${err.cause?.code || err.message}). ` +
        '¿Está el proyecto pausado o sin conexión?'
      )
    }
    if (!res.ok) {
      throw new Error(`Supabase respondió ${res.status}: ${await res.text()}`)
    }
    const lote = await res.json()
    filas.push(...lote)
    console.log(`  · ${filas.length} registros descargados...`)
    if (lote.length < PAGINA) break
  }

  const fecha = new Date().toISOString().slice(0, 10)
  const destino = join(aqui, 'backup', `presupuestos_supabase_${fecha}.json`)
  await mkdir(dirname(destino), { recursive: true })
  await writeFile(destino, JSON.stringify(filas, null, 2), 'utf8')

  console.log(`\nOK: ${filas.length} presupuestos guardados en:\n  ${destino}`)
  if (filas.length === 0) {
    console.warn('AVISO: la tabla está vacía o las políticas RLS no permiten leerla con la clave pública.')
  }
}

main().catch(err => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})

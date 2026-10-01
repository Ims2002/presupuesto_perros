/**
 * PASO 3 — Importa en PocketBase el JSON exportado de Supabase.
 *
 * - Se autentica como superusuario (las credenciales se leen de variables
 *   de entorno; nunca se guardan en ningún archivo).
 * - Es idempotente: cada registro guarda su id original en "supabase_id",
 *   así que si lo ejecutas dos veces no duplica nada.
 * - Conserva la fecha original de creación en "created_at".
 *
 * Uso (desde la carpeta "presupuestos"), en PowerShell:
 *   $env:PB_URL="https://pb.tudominio.com"
 *   $env:PB_EMAIL="tu-email-de-superusuario"
 *   $env:PB_PASSWORD="tu-contraseña"
 *   node migracion-pocketbase/importar_pocketbase.mjs migracion-pocketbase/backup/presupuestos_supabase_AAAA-MM-DD.json
 *
 * Añade --dry-run al final para ver qué haría sin escribir nada.
 * Requisitos: Node 18+. No necesita instalar nada.
 */
import { readFile } from 'node:fs/promises'

const PB_URL = (process.env.PB_URL || '').replace(/\/+$/, '')
const PB_EMAIL = process.env.PB_EMAIL
const PB_PASSWORD = process.env.PB_PASSWORD
const COLECCION = 'presupuestos'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const archivo = args.find(a => !a.startsWith('--'))

function fail(msg) {
  console.error(`\nERROR: ${msg}`)
  process.exit(1)
}

// Convierte cualquier fecha que devuelva Supabase (timestamptz con
// microsegundos y zona) a ISO en UTC, que PocketBase acepta sin problema.
function toIso(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

// Deja las fechas de estancia como "YYYY-MM-DD" (formato que usa la app).
function toDay(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const detalle = data?.data ? ` ${JSON.stringify(data.data)}` : ''
    throw new Error(`${method} ${path} → ${res.status} ${data?.message || text}${detalle}`)
  }
  return data
}

function mapear(r) {
  const lineas = Array.isArray(r.lineas) ? r.lineas : []
  const total = r.total ?? lineas.reduce((s, l) => s + (l?.subtotal ?? 0), 0)
  return {
    supabase_id: String(r.id),
    numero: String(r.numero ?? '').trim(),
    cliente: r.cliente ?? {},
    mascota: r.mascota ?? '',
    fecha_inicio: toDay(r.fecha_inicio),
    fecha_fin: toDay(r.fecha_fin),
    lineas,
    notas: r.notas ?? '',
    total,
    dispositivo: r.dispositivo ?? '',
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  }
}

async function main() {
  if (!archivo) fail('Indica el JSON a importar. Ej: node importar_pocketbase.mjs backup/presupuestos_supabase_2026-09-25.json')
  if (!PB_URL) fail('Falta la variable de entorno PB_URL.')
  if (!PB_EMAIL || !PB_PASSWORD) fail('Faltan PB_EMAIL y/o PB_PASSWORD (superusuario de PocketBase).')

  const filas = JSON.parse(await readFile(archivo, 'utf8'))
  if (!Array.isArray(filas)) fail('El JSON no contiene una lista de presupuestos.')
  console.log(`Leídos ${filas.length} presupuestos de ${archivo}`)

  // Autenticación como superusuario (PocketBase v0.23+)
  let token
  try {
    const auth = await api('/api/collections/_superusers/auth-with-password', {
      method: 'POST',
      body: { identity: PB_EMAIL, password: PB_PASSWORD },
    })
    token = auth.token
  } catch (err) {
    fail(`No se pudo iniciar sesión en PocketBase: ${err.message}`)
  }

  // Ids de Supabase ya importados (para no duplicar si se relanza)
  const yaImportados = new Set()
  for (let page = 1; ; page++) {
    const res = await api(
      `/api/collections/${COLECCION}/records?page=${page}&perPage=500&fields=supabase_id&skipTotal=1`,
      { token }
    )
    res.items.forEach(i => i.supabase_id && yaImportados.add(i.supabase_id))
    if (res.items.length < 500) break
  }

  let creados = 0, saltados = 0, errores = 0
  for (const fila of filas) {
    const rec = mapear(fila)
    if (yaImportados.has(rec.supabase_id)) {
      saltados++
      continue
    }
    if (dryRun) {
      console.log(`  [dry-run] crearía #${rec.numero} (${rec.cliente?.nombre || 'sin nombre'})`)
      creados++
      continue
    }
    try {
      await api(`/api/collections/${COLECCION}/records`, { method: 'POST', token, body: rec })
      creados++
    } catch (err) {
      errores++
      console.error(`  ✗ #${rec.numero}: ${err.message}`)
    }
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}Creados: ${creados} · Ya existían: ${saltados} · Errores: ${errores}`)
  if (errores > 0) process.exit(1)
}

main().catch(err => fail(err.message))

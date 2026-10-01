/**
 * Sistema de logs de la aplicación.
 *
 * Objetivo: poder reconstruir qué pasó en un dispositivo concreto (p. ej. por
 * qué un presupuesto aparece repetido en el historial) sin tener que
 * reproducirlo delante de la consola del navegador.
 *
 * Cada entrada se escribe en:
 *   1. La consola del navegador (con color por nivel y el "scope" del módulo).
 *   2. Un buffer circular persistido en localStorage ('app_logs'), que
 *      sobrevive a recargas. Se puede ver, filtrar, copiar y descargar desde
 *      el visor "Registro de actividad" (pie de página o Ctrl+Shift+L).
 *   3. Los "transports" opcionales registrados con addLogTransport()
 *      (punto de extensión para mandar logs a un servidor en el futuro).
 *
 * Niveles: debug < info < warn < error.
 *   - En desarrollo (npm run dev) el nivel por defecto es 'debug'.
 *   - En producción es 'info'.
 *   - Se puede forzar con ?debug=1 en la URL, desde el visor o con
 *     localStorage.setItem('log_level', 'debug').
 *
 * Privacidad: los logs se quedan en el propio dispositivo. Aun así, no se
 * registran nombres de clientes ni notas; solo ids, números, totales, etc.
 *
 * Uso:
 *   import { createLogger } from '../lib/logger'
 *   const log = createLogger('historial')
 *   log.info('Presupuestos cargados', { total: 12 })
 *   log.error('Fallo al borrar', err)
 *
 * Desde la consola del navegador: window.appLogs.get(), .export(), .clear(),
 * .setLevel('debug').
 */

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

const STORAGE_KEY = 'app_logs'
const LEVEL_KEY = 'log_level'
const MAX_ENTRIES = 1000          // tamaño del buffer circular
const MAX_STRING = 2000           // recorte de cadenas largas (stacks, respuestas...)
const MAX_DEPTH = 5               // profundidad máxima al serializar objetos
const PERSIST_DELAY_MS = 400      // agrupa escrituras en localStorage

const CONSOLE_STYLE = {
  debug: 'color:#6b7280',
  info: 'color:#2563eb',
  warn: 'color:#d97706;font-weight:bold',
  error: 'color:#dc2626;font-weight:bold',
}

// --- Acceso seguro a localStorage (modo privado, cuota llena, etc.) ---
function lsGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); return true } catch { return false }
}
function lsRemove(key) {
  try { localStorage.removeItem(key) } catch { /* sin almacenamiento */ }
}

function randomId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const bytes = new Uint8Array(len)
  try { crypto.getRandomValues(bytes) } catch { bytes.forEach((_, i) => { bytes[i] = Math.random() * 256 }) }
  bytes.forEach(b => { out += chars[b % chars.length] })
  return out
}

// Identificador de esta pestaña/sesión: permite separar en el registro lo que
// pasó en cada apertura de la app.
export const SESSION_ID = randomId(6)

function loadBuffer() {
  try {
    const raw = lsGet(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

let buffer = loadBuffer()
let seq = buffer.length ? (buffer[buffer.length - 1].seq || 0) + 1 : 1
let persistTimer = null
const listeners = new Set()
const transports = new Set()
let context = {}

function defaultLevel() {
  try {
    if (new URLSearchParams(window.location.search).has('debug')) return 'debug'
  } catch { /* sin window */ }
  const stored = lsGet(LEVEL_KEY)
  if (stored && LEVELS[stored]) return stored
  return import.meta.env?.DEV ? 'debug' : 'info'
}

let minLevel = defaultLevel()

export function getLogLevel() { return minLevel }

export function setLogLevel(level) {
  if (!LEVELS[level]) return
  minLevel = level
  lsSet(LEVEL_KEY, level)
}

/** Añade datos de contexto que se adjuntan a todas las entradas (vista, dispositivo...). */
export function setLogContext(partial) {
  context = { ...context, ...partial }
}

/**
 * Convierte cualquier valor en algo serializable a JSON: errores con su stack
 * y código, objetos con referencias circulares, cadenas muy largas, etc.
 */
export function serialize(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…[recortado]' : value
  if (t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return value.toString()
  if (t === 'function') return `[función ${value.name || 'anónima'}]`
  if (t === 'symbol') return value.toString()

  if (value instanceof Error || (value && typeof value.message === 'string' && typeof value.stack === 'string')) {
    const out = { name: value.name, message: value.message }
    // Campos habituales en errores de Supabase / PostgREST / PocketBase
    for (const k of ['code', 'details', 'hint', 'status', 'url', 'op', 'causa', 'response']) {
      if (value[k] !== undefined) out[k] = serialize(value[k], depth + 1, seen)
    }
    if (value.cause) out.cause = serialize(value.cause, depth + 1, seen)
    if (value.stack) out.stack = serialize(String(value.stack), depth + 1, seen)
    return out
  }

  if (depth >= MAX_DEPTH) return '[…]'
  if (t === 'object') {
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) {
      const arr = value.slice(0, 50).map(v => serialize(v, depth + 1, seen))
      if (value.length > 50) arr.push(`…(+${value.length - 50})`)
      return arr
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v, depth + 1, seen)
    return out
  }
  return String(value)
}

function schedulePersist(immediate = false) {
  if (persistTimer) clearTimeout(persistTimer)
  if (immediate) { persistTimer = null; persist(); return }
  persistTimer = setTimeout(() => { persistTimer = null; persist() }, PERSIST_DELAY_MS)
}

function persist() {
  let data = buffer
  // Si la cuota de localStorage se llena, se descarta la mitad más antigua.
  for (let i = 0; i < 4; i++) {
    if (lsSet(STORAGE_KEY, JSON.stringify(data))) {
      if (data !== buffer) buffer = data
      return
    }
    data = data.slice(Math.floor(data.length / 2))
  }
}

/** Fuerza el guardado pendiente (se llama al ocultar o cerrar la página). */
export function flushLogs() {
  if (persistTimer) schedulePersist(true)
}

function emit(level, scope, msg, data) {
  if (LEVELS[level] < LEVELS[minLevel]) return null

  const entry = {
    seq: seq++,
    ts: new Date().toISOString(),
    level,
    scope,
    msg: String(msg),
    session: SESSION_ID,
    ...(Object.keys(context).length ? { ctx: { ...context } } : {}),
    ...(data !== undefined ? { data: serialize(data) } : {}),
  }

  // 1) Consola
  const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  try {
    if (data !== undefined) fn(`%c[${scope}]`, CONSOLE_STYLE[level], entry.msg, data)
    else fn(`%c[${scope}]`, CONSOLE_STYLE[level], entry.msg)
  } catch { /* consola no disponible */ }

  // 2) Buffer persistente
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(buffer.length - MAX_ENTRIES)
  schedulePersist(level === 'error') // los errores se guardan al momento

  // 3) Suscriptores (visor) y transports
  listeners.forEach(l => { try { l(entry) } catch { /* ignorar */ } })
  transports.forEach(t => { try { t(entry) } catch { /* un transport roto no debe romper la app */ } })
  return entry
}

/**
 * Crea un logger con un "scope" (módulo) fijo.
 * Devuelve { debug, info, warn, error, child, time }.
 */
export function createLogger(scope) {
  const log = {
    debug: (msg, data) => emit('debug', scope, msg, data),
    info: (msg, data) => emit('info', scope, msg, data),
    warn: (msg, data) => emit('warn', scope, msg, data),
    error: (msg, data) => emit('error', scope, msg, data),
    child: sub => createLogger(`${scope}:${sub}`),
    /**
     * Mide la duración de una operación.
     *   const t = log.time('Generar PDF'); ...; t.end({ paginas: 1 })
     */
    time: (msg, data) => {
      const start = performance.now()
      log.debug(`${msg} — inicio`, data)
      return {
        end: (extra) => log.info(`${msg} — OK`, { ...data, ...extra, ms: Math.round(performance.now() - start) }),
        fail: (err, extra) => log.error(`${msg} — ERROR`, { ...data, ...extra, ms: Math.round(performance.now() - start), error: err }),
      }
    },
  }
  return log
}

// --- API para el visor y la consola ---
export function getLogs() { return buffer.slice() }

export function clearLogs() {
  buffer = []
  lsRemove(STORAGE_KEY)
  listeners.forEach(l => { try { l(null) } catch { /* ignorar */ } })
}

/** Suscribe una función a cada nueva entrada (null = registro borrado). Devuelve la función para desuscribirse. */
export function subscribeLogs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Punto de extensión: fn(entry) se llama con cada entrada (p. ej. para enviarlas a un servidor). */
export function addLogTransport(fn) {
  transports.add(fn)
  return () => transports.delete(fn)
}

/** Texto JSON con información del entorno + todas las entradas. */
export function logsAsJson() {
  return JSON.stringify({
    exportado: new Date().toISOString(),
    sesionActual: SESSION_ID,
    nivel: minLevel,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    url: typeof location !== 'undefined' ? location.href : '',
    contexto: context,
    entradas: buffer,
  }, null, 2)
}

/** Descarga el registro como archivo .json (para enviarlo o adjuntarlo a un bug). */
export function downloadLogs() {
  const blob = new Blob([logsAsJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const disp = (context.dispositivo || 'dispositivo').replace(/[^\w-]+/g, '_')
  a.href = url
  a.download = `registro-${disp}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

let globalHandlersInstalled = false

/**
 * Captura errores que no pasan por ningún try/catch:
 *   - excepciones JS no controladas (window 'error')
 *   - promesas rechazadas sin catch ('unhandledrejection')
 *   - errores de carga de recursos (scripts/imágenes)
 * y guarda el registro al ocultar/cerrar la página.
 */
export function installGlobalHandlers() {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  globalHandlersInstalled = true
  const log = createLogger('global')

  window.addEventListener('error', (ev) => {
    if (ev.error || ev.message) {
      log.error('Error no controlado', {
        mensaje: ev.message,
        archivo: ev.filename,
        linea: ev.lineno,
        columna: ev.colno,
        error: ev.error,
      })
    } else if (ev.target && ev.target !== window) {
      log.warn('Fallo al cargar un recurso', { tag: ev.target.tagName, src: ev.target.src || ev.target.href })
    }
  }, true)

  window.addEventListener('unhandledrejection', (ev) => {
    log.error('Promesa rechazada sin capturar', { motivo: ev.reason })
  })

  window.addEventListener('online', () => log.info('Conexión recuperada (online)'))
  window.addEventListener('offline', () => log.warn('Sin conexión (offline)'))
  window.addEventListener('pagehide', flushLogs)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLogs()
  })

  // Acceso rápido desde la consola del navegador
  window.appLogs = {
    get: getLogs,
    clear: clearLogs,
    export: downloadLogs,
    json: logsAsJson,
    setLevel: setLogLevel,
    getLevel: getLogLevel,
  }

  log.info('App iniciada', {
    nivel: minLevel,
    modo: import.meta.env?.MODE,
    online: navigator.onLine,
    pantalla: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
  })
}

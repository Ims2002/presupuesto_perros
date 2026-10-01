import { supabase } from './supabase'
import { createLogger } from './logger'

/**
 * Capa de acceso a datos de la tabla "presupuestos".
 *
 * Es el ÚNICO sitio de la app que habla con la base de datos. Los componentes
 * llaman a estas funciones y reciben datos o una excepción ErrorDatos, sin
 * conocer Supabase. Ventajas:
 *   - Todas las operaciones quedan registradas en el log con su duración.
 *   - Los errores ya no pasan en silencio (antes se ignoraba { error }).
 *   - La migración a PocketBase solo tiene que reescribir este archivo.
 *
 * Protecciones contra presupuestos duplicados:
 *   - crearPresupuesto() recibe un id generado en el cliente (uno por
 *     borrador). Si el mismo borrador se envía dos veces (doble toque,
 *     reintento tras un corte de red...) la base de datos rechaza el segundo
 *     INSERT por clave primaria repetida y se reutiliza el registro existente
 *     en lugar de crear otro.
 *   - El número se calcula justo antes de insertar consultando el máximo en
 *     remoto (no el que había al abrir la app) y, si existe una restricción
 *     UNIQUE en "numero", se reintenta con el siguiente.
 *   - Tras crear se comprueba que el número no esté repetido y, si lo está,
 *     se deja un aviso en el log.
 */

const log = createLogger('db')
const TABLA = 'presupuestos'

/** Error normalizado de la capa de datos. code: código de Postgres/PostgREST o uno propio. */
export class ErrorDatos extends Error {
  constructor(op, message, { code, details, hint, causa } = {}) {
    super(message)
    this.name = 'ErrorDatos'
    this.op = op
    this.code = code
    this.details = details
    this.hint = hint
    this.causa = causa
  }
}

function esFalloDeRed(error) {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error?.message || '')
}

function envolver(op, error) {
  if (esFalloDeRed(error)) {
    return new ErrorDatos(op, 'Sin conexión con la base de datos (sin internet o el proyecto de Supabase está en pausa).', { code: 'RED', causa: error })
  }
  if (error?.code === '42501') {
    return new ErrorDatos(op, 'La base de datos ha denegado la operación (permisos / políticas RLS).', { code: error.code, details: error.details, hint: error.hint, causa: error })
  }
  return new ErrorDatos(op, error?.message || 'Error desconocido de la base de datos', {
    code: error?.code, details: error?.details, hint: error?.hint, causa: error,
  })
}

/** Texto apto para mostrar al usuario a partir de cualquier error. */
export function mensajeError(err) {
  return err?.message || String(err)
}

/**
 * Genera un id para un borrador de presupuesto nuevo (UUID v4).
 * crypto.randomUUID solo existe en contextos seguros (https/localhost); al
 * abrir la app desde el móvil por la IP local (http://192.168...) no está,
 * así que hay alternativa con getRandomValues.
 */
export function nuevoIdBorrador() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Convierte los datos del formulario (camelCase) a columnas de la tabla. */
export function camposDesdeFormulario(datos) {
  return {
    cliente: datos.cliente,
    mascota: datos.mascota,
    fecha_inicio: datos.fechaInicio || null,
    fecha_fin: datos.fechaFin || null,
    lineas: datos.lineas,
    notas: datos.notas,
    total: datos.lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0),
  }
}

/** Resumen sin datos personales, para los logs. */
export function resumenParaLog(campos) {
  return {
    numero: campos.numero,
    lineas: campos.lineas?.length ?? 0,
    total: campos.total,
    conFechas: !!(campos.fecha_inicio && campos.fecha_fin),
  }
}

// Si la columna id no admite ids generados en el cliente (no es uuid), se
// desactiva esa protección y se registra un aviso. Ver crearPresupuesto().
let idsDesdeCliente = true

/** Número más alto guardado en remoto (0 si no hay ninguno). */
export async function obtenerMaxNumero() {
  const { data, error } = await supabase
    .from(TABLA)
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)
  if (error) throw envolver('maxNumero', error)
  return data?.length ? Number(data[0].numero) || 0 : 0
}

/** Todos los presupuestos, del más reciente al más antiguo. */
export async function listarPresupuestos() {
  const t = log.time('Listar presupuestos')
  const { data, error } = await supabase
    .from(TABLA)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    const e = envolver('listar', error)
    t.fail(e)
    throw e
  }
  t.end({ filas: data.length })
  return data
}

async function obtenerPorId(id) {
  const { data, error } = await supabase.from(TABLA).select('id, numero').eq('id', id).maybeSingle()
  if (error) throw envolver('obtener', error)
  return data
}

/** Avisa en el log si hay más de un presupuesto con el mismo número. */
async function comprobarNumeroUnico(numero) {
  try {
    const { count, error } = await supabase
      .from(TABLA)
      .select('id', { count: 'exact', head: true })
      .eq('numero', numero)
    if (error) throw error
    if (count > 1) {
      log.warn('Número de presupuesto repetido en la base de datos', { numero, veces: count })
    }
  } catch (err) {
    log.debug('No se pudo comprobar si el número está repetido', { numero, error: err })
  }
}

function esConflictoDeId(error) {
  const texto = `${error?.message || ''} ${error?.details || ''}`
  return /_pkey|\(id\)/i.test(texto)
}

/**
 * Inserta un presupuesto nuevo.
 *
 * @param {object} p
 * @param {string} p.id            Id del borrador (nuevoIdBorrador()). Hace el INSERT idempotente.
 * @param {object} p.campos        Columnas (camposDesdeFormulario + dispositivo).
 * @param {number} p.numeroMinimo  Último número conocido en este dispositivo.
 * @returns {Promise<{ row: {id, numero}, yaExistia: boolean }>}
 *   yaExistia = true si ese borrador ya estaba guardado (no se ha creado otro).
 */
export async function crearPresupuesto({ id, campos, numeroMinimo = 0 }) {
  const t = log.time('Crear presupuesto', { id })
  let minimo = Number(numeroMinimo) || 0
  try {
    for (let intento = 1; intento <= 3; intento++) {
      let maxRemoto = 0
      try {
        maxRemoto = await obtenerMaxNumero()
      } catch (err) {
        log.warn('No se pudo consultar el número máximo en remoto; se usa el contador local', { error: err })
      }
      const numero = String(Math.max(maxRemoto, minimo) + 1).padStart(4, '0')
      const fila = { ...campos, numero, ...(idsDesdeCliente && id ? { id } : {}) }
      log.debug('INSERT', { intento, maxRemoto, minimoLocal: minimo, ...resumenParaLog(fila), idCliente: !!fila.id })

      const { data, error } = await supabase.from(TABLA).insert(fila).select('id, numero').single()

      if (!error) {
        t.end({ id: data.id, numero: data.numero, intento })
        comprobarNumeroUnico(data.numero) // en segundo plano, solo para el log
        return { row: data, yaExistia: false }
      }

      if (error.code === '23505' && esConflictoDeId(error)) {
        // Este mismo borrador ya se guardó (el primer intento llegó a la BD
        // aunque la respuesta se perdiera, o hubo un doble envío).
        const existente = await obtenerPorId(id)
        if (existente) {
          log.warn('El borrador ya estaba guardado: se reutiliza en lugar de duplicarlo', { id, numero: existente.numero })
          t.end({ id, numero: existente.numero, yaExistia: true })
          return { row: existente, yaExistia: true }
        }
      }

      if (error.code === '23505') {
        log.warn('Número ya usado (otro dispositivo guardó a la vez); se reintenta con el siguiente', { numero, intento })
        minimo = Number(numero)
        continue
      }

      if ((error.code === '22P02' || error.code === '428C9') && fila.id) {
        idsDesdeCliente = false
        log.warn('La columna id no acepta ids generados en la app; se inserta sin id (sin protección por id)', { error })
        continue
      }

      throw envolver('crear', error)
    }
    throw new ErrorDatos('crear', 'No se pudo asignar un número libre tras 3 intentos.', { code: 'NUMERO_DUPLICADO' })
  } catch (err) {
    const e = err instanceof ErrorDatos ? err : envolver('crear', err)
    t.fail(e)
    throw e
  }
}

/**
 * Actualiza un presupuesto existente. Lanza ErrorDatos('SIN_FILAS') si no se
 * ha modificado ninguna fila: con RLS, un UPDATE sin permiso o sobre un id
 * borrado "funciona" sin error pero no cambia nada, y antes pasaba en silencio.
 */
export async function actualizarPresupuesto(id, campos) {
  const t = log.time('Actualizar presupuesto', { id, ...resumenParaLog(campos) })
  try {
    const { data, error } = await supabase
      .from(TABLA)
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, numero')
    if (error) throw envolver('actualizar', error)
    if (!data?.length) {
      throw new ErrorDatos('actualizar', 'No se ha actualizado nada: el presupuesto ya no existe o no hay permiso para editarlo.', { code: 'SIN_FILAS' })
    }
    t.end({ numero: data[0].numero })
    return data[0]
  } catch (err) {
    const e = err instanceof ErrorDatos ? err : envolver('actualizar', err)
    t.fail(e)
    throw e
  }
}

/** Elimina un presupuesto. Lanza ErrorDatos('SIN_FILAS') si no se borró nada. */
export async function eliminarPresupuesto(id, numero) {
  const t = log.time('Eliminar presupuesto', { id, numero })
  try {
    const { data, error } = await supabase.from(TABLA).delete().eq('id', id).select('id')
    if (error) throw envolver('eliminar', error)
    if (!data?.length) {
      throw new ErrorDatos('eliminar', 'No se ha borrado nada: ya estaba eliminado o no hay permiso para borrarlo.', { code: 'SIN_FILAS' })
    }
    t.end()
  } catch (err) {
    const e = err instanceof ErrorDatos ? err : envolver('eliminar', err)
    t.fail(e)
    throw e
  }
}

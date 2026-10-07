import { actualizarPresupuesto, ErrorDatos, nuevoIdBorrador } from './presupuestosRepo'
import { createLogger } from './logger'
import { r2, resumenCobros } from './cobros'

/**
 * Guardado de cobros. Solo usa actualizarPresupuesto() del repositorio, así que
 * funciona igual con Supabase y con PocketBase (parche de migración) sin tocar
 * la capa de datos.
 */

const log = createLogger('pagos')

/** Resumen sin datos personales de una lista de cobros, para el registro. */
export function resumenPagosLog(pagos) {
  const importe = r2(pagos.reduce((s, x) => s + (Number(x.importe) || 0), 0))
  const porMetodo = {}
  pagos.forEach(x => { porMetodo[x.metodo] = r2((porMetodo[x.metodo] || 0) + (Number(x.importe) || 0)) })
  return { cobros: pagos.length, importe, porMetodo }
}

/**
 * Registra el estado de cobro de una lista de presupuestos recién cargada
 * (cuántos pagados, parciales y pendientes) y avisa de cobros con datos
 * anómalos (ver diagnosticarCobros en cobros.js).
 *
 * @param {string} origen  'historial' | 'extracto'
 */
export function registrarResumenCobros(origen, presupuestos) {
  try {
    const r = resumenCobros(presupuestos)
    log.info('Estado de cobro de los presupuestos', { origen, presupuestos: r.presupuestos, pagados: r.pagado, parciales: r.parcial, pendientes: r.pendiente })
    if (r.conProblemas) {
      log.warn('Hay cobros con datos anómalos', { origen, presupuestos: r.conProblemas, porCodigo: r.porCodigo, casos: r.casos })
    }
  } catch (err) {
    log.warn('No se pudo revisar el estado de los cobros', { origen, error: err })
  }
}

/** Crea un cobro nuevo listo para añadir a la lista. */
export function nuevoPago({ fecha, importe, metodo, nota = '' }) {
  return {
    id: nuevoIdBorrador(),
    fecha,
    importe: r2(importe),
    metodo,
    nota: nota.trim(),
    registrado: new Date().toISOString(),
  }
}

/**
 * Guarda la lista completa de cobros de un presupuesto.
 * Si la columna "pagos" aún no existe en la base de datos, lanza un error con
 * las instrucciones para crearla.
 */
export async function guardarPagos(id, numero, pagos) {
  const t = log.time('Guardar cobros', { id, numero, ...resumenPagosLog(pagos) })
  try {
    await actualizarPresupuesto(id, { pagos })
    t.end()
  } catch (err) {
    const texto = `${err?.message || ''} ${err?.details || ''} ${err?.causa?.message || ''}`
    if (err?.code === 'PGRST204' || /'pagos' column|column.*pagos|pagos.*column/i.test(texto)) {
      const e = new ErrorDatos('pagos', 'Falta la columna "pagos" en la base de datos. Ejecuta una vez el SQL de cobros/supabase_pagos.sql en Supabase (SQL Editor) y vuelve a intentarlo.', { code: 'FALTA_COLUMNA_PAGOS', causa: err })
      t.fail(e, { solucion: 'Ejecutar cobros/supabase_pagos.sql en Supabase' })
      throw e
    }
    t.fail(err)
    throw err
  }
}

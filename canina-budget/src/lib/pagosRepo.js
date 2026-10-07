import { actualizarPresupuesto, ErrorDatos, nuevoIdBorrador } from './presupuestosRepo'
import { createLogger } from './logger'
import { r2 } from './cobros'

/**
 * Guardado de cobros. Solo usa actualizarPresupuesto() del repositorio, así que
 * funciona igual con Supabase y con PocketBase (parche de migración) sin tocar
 * la capa de datos.
 */

const log = createLogger('pagos')

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
  log.info('Guardar cobros', { id, numero, cobros: pagos.length, importe: r2(pagos.reduce((s, x) => s + x.importe, 0)) })
  try {
    await actualizarPresupuesto(id, { pagos })
  } catch (err) {
    const texto = `${err?.message || ''} ${err?.details || ''} ${err?.causa?.message || ''}`
    if (err?.code === 'PGRST204' || /'pagos' column|column.*pagos|pagos.*column/i.test(texto)) {
      throw new ErrorDatos('pagos', 'Falta la columna "pagos" en la base de datos. Ejecuta una vez el SQL de cobros/supabase_pagos.sql en Supabase (SQL Editor) y vuelve a intentarlo.', { code: 'FALTA_COLUMNA_PAGOS', causa: err })
    }
    throw err
  }
}

/**
 * Cobros de los presupuestos.
 *
 * Cada presupuesto guarda en la columna "pagos" (JSON) la lista de cobros
 * recibidos. Así se cubre tanto el caso normal (un solo cobro por el total)
 * como el de la política de reserva (50 % de señal por Bizum/transferencia y
 * el resto en efectivo al recoger a la mascota).
 *
 *   pagos: [
 *     { id, fecha: 'YYYY-MM-DD', importe: 120, metodo: 'banco' | 'efectivo', nota: '', registrado: ISO }
 *   ]
 *
 * El estado (pendiente / parcial / pagado) NO se guarda: se calcula comparando
 * lo cobrado con el total. Si se edita el presupuesto y cambia el total, el
 * estado se actualiza solo.
 *
 * Este archivo solo tiene funciones puras (sin base de datos). El guardado
 * está en pagosRepo.js.
 */

export const METODOS = [
  { key: 'banco', label: 'Banco', ayuda: 'Transferencia, Bizum o tarjeta' },
  { key: 'efectivo', label: 'Efectivo', ayuda: 'Pago en mano' },
]

export function etiquetaMetodo(key) {
  return METODOS.find(m => m.key === key)?.label || key || '—'
}

/** Redondeo a céntimos sin errores de coma flotante acumulados. */
export function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Fecha local de hoy en formato YYYY-MM-DD (no UTC: a las 00:30 seguiría siendo "ayer"). */
export function hoyISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" */
export function fmtFecha(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** 1234.5 → "1.234,50 €" */
export function fmtEuros(n) {
  return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/** Total del presupuesto (columna total o, en registros antiguos, suma de subtotales). */
export function totalPresupuesto(p) {
  const t = p?.total ?? (p?.lineas || []).reduce((s, l) => s + (l?.subtotal ?? 0), 0)
  return r2(t)
}

/** Lista de cobros válida, ordenada por fecha. Tolera null o JSON en texto. */
export function pagosDe(p) {
  let lista = p?.pagos
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista) } catch { lista = [] }
  }
  if (!Array.isArray(lista)) return []
  return lista
    .filter(x => x && x.fecha && Number(x.importe) > 0)
    .map(x => ({ ...x, importe: r2(x.importe), metodo: x.metodo || 'banco' }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Estado de cobro de un presupuesto.
 * @returns {{ total, cobrado, pendiente, estado: 'pendiente'|'parcial'|'pagado', metodos: string[], ultimaFecha: string|null, pagos: object[] }}
 */
export function estadoCobro(p) {
  const pagos = pagosDe(p)
  const total = totalPresupuesto(p)
  const cobrado = r2(pagos.reduce((s, x) => s + x.importe, 0))
  const pendiente = r2(Math.max(total - cobrado, 0))
  let estado = 'pendiente'
  if (pagos.length) estado = cobrado + 0.005 >= total ? 'pagado' : 'parcial'
  return {
    total,
    cobrado,
    pendiente,
    estado,
    metodos: [...new Set(pagos.map(x => x.metodo))],
    ultimaFecha: pagos.length ? pagos[pagos.length - 1].fecha : null,
    pagos,
  }
}


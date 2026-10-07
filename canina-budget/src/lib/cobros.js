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

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const METODOS_VALIDOS = new Set(METODOS.map(m => m.key))

/** Lista de cobros tal como viene de la base de datos (null, JSON en texto o array). */
function pagosCrudos(p) {
  let lista = p?.pagos
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista) } catch { return { lista: [], legible: false } }
  }
  if (lista == null) return { lista: [], legible: true }
  return Array.isArray(lista) ? { lista, legible: true } : { lista: [], legible: false }
}

function cobroValido(x) {
  return !!x && RE_FECHA.test(String(x.fecha || '')) && Number(x.importe) > 0
}

/**
 * Lista de cobros válida, ordenada por fecha. Tolera null o JSON en texto.
 * Una forma de pago desconocida se trata como "banco" en todos los cálculos
 * (diagnosticarCobros() lo señala para que salga en el registro).
 */
export function pagosDe(p) {
  return pagosCrudos(p).lista
    .filter(cobroValido)
    .map(x => ({ ...x, importe: r2(x.importe), metodo: METODOS_VALIDOS.has(x.metodo) ? x.metodo : 'banco' }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Revisa los cobros guardados de un presupuesto y devuelve los problemas
 * encontrados (lista vacía si todo está bien). Solo datos técnicos: nunca
 * nombres ni notas, porque el resultado va al registro de actividad.
 *
 * Códigos:
 *   no_legible         la columna "pagos" no es una lista (o JSON roto)
 *   descartados        cobros sin fecha válida o con importe <= 0 (no cuentan)
 *   metodo_desconocido forma de pago que no es banco/efectivo (se cuenta como banco)
 *   sobrepago          lo cobrado supera el total del presupuesto
 *   fecha_futura       cobro con fecha posterior a hoy
 *   id_repetido        dos cobros con el mismo id (quitar uno quitaría ambos)
 */
export function diagnosticarCobros(p, hoy = hoyISO()) {
  const problemas = []
  const { lista, legible } = pagosCrudos(p)
  if (!legible) problemas.push({ codigo: 'no_legible', tipo: typeof p?.pagos })
  const descartados = lista.filter(x => !cobroValido(x)).length
  if (descartados) problemas.push({ codigo: 'descartados', cobros: descartados })
  const validos = lista.filter(cobroValido)
  const desconocidos = [...new Set(validos.map(x => x.metodo).filter(m => !METODOS_VALIDOS.has(m)))]
  if (desconocidos.length) problemas.push({ codigo: 'metodo_desconocido', metodos: desconocidos.map(String) })
  const futuras = validos.map(x => x.fecha).filter(f => f > hoy)
  if (futuras.length) problemas.push({ codigo: 'fecha_futura', fechas: futuras })
  const ids = validos.map(x => x.id).filter(Boolean)
  if (new Set(ids).size !== ids.length) problemas.push({ codigo: 'id_repetido' })
  if (validos.length) {
    const total = totalPresupuesto(p)
    const cobrado = r2(validos.reduce((s, x) => s + r2(x.importe), 0))
    if (cobrado > total + 0.005) problemas.push({ codigo: 'sobrepago', total, cobrado, exceso: r2(cobrado - total) })
  }
  return problemas
}

/**
 * Resumen para el registro: cuántos presupuestos hay en cada estado y cuáles
 * tienen cobros anómalos (máximo 20 casos detallados).
 */
export function resumenCobros(presupuestos, hoy = hoyISO()) {
  const estados = { pendiente: 0, parcial: 0, pagado: 0 }
  const porCodigo = {}
  const casos = []
  let conProblemas = 0
  for (const p of presupuestos) {
    estados[estadoCobro(p).estado]++
    const problemas = diagnosticarCobros(p, hoy)
    if (!problemas.length) continue
    conProblemas++
    problemas.forEach(x => { porCodigo[x.codigo] = (porCodigo[x.codigo] || 0) + 1 })
    if (casos.length < 20) casos.push({ id: p.id, numero: p.numero, problemas })
  }
  return { presupuestos: presupuestos.length, ...estados, conProblemas, porCodigo, casos }
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


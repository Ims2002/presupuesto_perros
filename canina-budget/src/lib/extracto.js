import { estadoCobro, etiquetaMetodo, fmtFecha, r2 } from './cobros'
import { nombreMes } from './periodos'

/**
 * Extracto de cobros para el gestor.
 *
 * Toma los presupuestos (tal como vienen de la base de datos), se queda con
 * los COBROS cuya fecha cae dentro del periodo y genera las tablas que usan
 * todos los formatos de exportación (pantalla, Excel, CSV y PDF):
 *
 *   - tablaCobros:       una fila por cobro (libro de cobros / ingresos)
 *   - tablaPresupuestos: una fila por presupuesto con cobros en el periodo
 *   - tablaMeses:        resumen por mes y forma de pago
 *
 * Se filtra por la FECHA DEL COBRO (no por la de creación ni por la de la
 * estancia): es la que cuenta para el gestor.
 *
 * IVA opcional: si se activa, se entiende que los importes cobrados llevan el
 * IVA incluido y se desglosan en base imponible + cuota.
 */

export const NEGOCIO = {
  nombre: 'Pet Hotel – Guardería Canina',
  lugar: 'Benitachell',
}

const ESTADOS = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' }

function desglose(importe, iva) {
  if (!iva?.activo) return {}
  const pct = Number(iva.porcentaje) || 0
  const base = r2(importe / (1 + pct / 100))
  return { base, ivaPct: pct / 100, cuota: r2(importe - base) }
}

function estancia(p) {
  if (p.fecha_inicio && p.fecha_fin) {
    return p.fecha_inicio === p.fecha_fin ? fmtFecha(p.fecha_inicio) : `${fmtFecha(p.fecha_inicio)} – ${fmtFecha(p.fecha_fin)}`
  }
  return fmtFecha(p.fecha_inicio || p.fecha_fin || '')
}

/** Descripción corta de los servicios: "Dia + Noche entre semana x3, Baño". */
function concepto(p) {
  const partes = (p.lineas || [])
    .filter(l => l?.descripcion)
    .map(l => (Number(l.cantidad) > 1 ? `${l.descripcion} x${l.cantidad}` : l.descripcion))
  const texto = partes.join(', ') || 'Servicio de guardería canina'
  return texto.length > 140 ? texto.slice(0, 137) + '…' : texto
}

/**
 * @param {object[]} presupuestos  Registros de la base de datos.
 * @param {object}   opciones
 * @param {string}   opciones.desde, opciones.hasta   "YYYY-MM-DD" (incluidos)
 * @param {'todos'|'banco'|'efectivo'} [opciones.metodo]
 * @param {{activo: boolean, porcentaje: number}} [opciones.iva]
 */
export function construirExtracto(presupuestos, { desde, hasta, metodo = 'todos', iva = { activo: true, porcentaje: 21 } }) {
  const cobros = []
  const porPresupuesto = []

  for (const p of presupuestos) {
    const est = estadoCobro(p)
    const enPeriodo = est.pagos.filter(x =>
      x.fecha >= desde && x.fecha <= hasta && (metodo === 'todos' || x.metodo === metodo))
    if (!enPeriodo.length) continue

    const base = {
      numero: p.numero,
      cliente: p.cliente?.nombre || '',
      mascota: p.mascota || '',
      estancia: estancia(p),
      concepto: concepto(p),
    }
    for (const x of enPeriodo) {
      cobros.push({
        ...base,
        fecha: x.fecha,
        metodo: x.metodo,
        formaPago: etiquetaMetodo(x.metodo),
        importe: x.importe,
        ...desglose(x.importe, iva),
        nota: x.nota || '',
      })
    }
    const banco = r2(enPeriodo.filter(x => x.metodo === 'banco').reduce((s, x) => s + x.importe, 0))
    const efectivo = r2(enPeriodo.filter(x => x.metodo === 'efectivo').reduce((s, x) => s + x.importe, 0))
    porPresupuesto.push({
      ...base,
      totalPresupuesto: est.total,
      banco,
      efectivo,
      cobrado: r2(banco + efectivo),
      ...desglose(r2(banco + efectivo), iva),
      pendiente: est.pendiente,
      estado: ESTADOS[est.estado],
      fechasCobro: enPeriodo.map(x => fmtFecha(x.fecha)).join(', '),
      primeraFecha: enPeriodo[0].fecha,
    })
  }

  cobros.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.numero).localeCompare(String(b.numero)))
  porPresupuesto.sort((a, b) => String(a.numero).localeCompare(String(b.numero)))

  // Resumen por mes
  const meses = new Map()
  for (const c of cobros) {
    const k = c.fecha.slice(0, 7)
    if (!meses.has(k)) meses.set(k, { mes: k, etiqueta: nombreMes(k), n: 0, banco: 0, efectivo: 0, total: 0, base: 0, cuota: 0 })
    const m = meses.get(k)
    m.n++
    m[c.metodo === 'efectivo' ? 'efectivo' : 'banco'] = r2(m[c.metodo === 'efectivo' ? 'efectivo' : 'banco'] + c.importe)
    m.total = r2(m.total + c.importe)
    if (iva?.activo) { m.base = r2(m.base + c.base); m.cuota = r2(m.cuota + c.cuota) }
  }
  const porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes))

  const suma = (arr, k) => r2(arr.reduce((s, x) => s + (x[k] || 0), 0))
  const totales = {
    n: cobros.length,
    nPresupuestos: porPresupuesto.length,
    banco: suma(porMes, 'banco'),
    efectivo: suma(porMes, 'efectivo'),
    total: suma(porMes, 'total'),
    base: suma(porMes, 'base'),
    cuota: suma(porMes, 'cuota'),
  }

  return { desde, hasta, metodo, iva: { ...iva }, cobros, porPresupuesto, porMes, totales }
}

// ---------------------------------------------------------------------------
// Definición de columnas, compartida por todos los formatos.
// tipo: 'fecha' | 'texto' | 'euros' | 'pct' | 'entero'
// corto / anchoPdf: título y ancho alternativos para el PDF (columnas estrechas)
// ---------------------------------------------------------------------------

const colsIva = [
  { key: 'base', titulo: 'Base imponible', tipo: 'euros', ancho: 14, total: true },
  { key: 'ivaPct', titulo: 'IVA %', corto: 'IVA', tipo: 'pct', ancho: 7 },
  { key: 'cuota', titulo: 'Cuota IVA', tipo: 'euros', ancho: 12, total: true },
]

/** Una fila por cobro: el formato típico de "libro de ingresos / cobros". */
export function tablaCobros(ext) {
  return {
    titulo: 'Cobros',
    columnas: [
      { key: 'fecha', titulo: 'Fecha cobro', tipo: 'fecha', ancho: 12 },
      { key: 'numero', titulo: 'Nº presupuesto', corto: 'Nº', tipo: 'texto', ancho: 13, anchoPdf: 8 },
      { key: 'cliente', titulo: 'Cliente', tipo: 'texto', ancho: 24 },
      { key: 'mascota', titulo: 'Mascota', tipo: 'texto', ancho: 14 },
      { key: 'concepto', titulo: 'Concepto', tipo: 'texto', ancho: 44 },
      { key: 'estancia', titulo: 'Estancia', tipo: 'texto', ancho: 24 },
      { key: 'formaPago', titulo: 'Forma de pago', tipo: 'texto', ancho: 13 },
      ...(ext.iva.activo ? colsIva : []),
      { key: 'importe', titulo: ext.iva.activo ? 'Total cobrado' : 'Importe', tipo: 'euros', ancho: 13, total: true },
      { key: 'nota', titulo: 'Nota', tipo: 'texto', ancho: 22 },
    ],
    filas: ext.cobros,
  }
}

/** Una fila por presupuesto, con lo cobrado en el periodo separado por forma de pago. */
export function tablaPresupuestos(ext) {
  return {
    titulo: 'Por presupuesto',
    columnas: [
      { key: 'numero', titulo: 'Nº presupuesto', corto: 'Nº', tipo: 'texto', ancho: 13, anchoPdf: 8 },
      { key: 'cliente', titulo: 'Cliente', tipo: 'texto', ancho: 24 },
      { key: 'mascota', titulo: 'Mascota', tipo: 'texto', ancho: 14 },
      { key: 'estancia', titulo: 'Estancia', tipo: 'texto', ancho: 24 },
      { key: 'fechasCobro', titulo: 'Fecha(s) cobro', tipo: 'texto', ancho: 16 },
      { key: 'totalPresupuesto', titulo: 'Total presupuesto', corto: 'Total presup.', tipo: 'euros', ancho: 15, total: true },
      { key: 'banco', titulo: 'Cobrado banco', tipo: 'euros', ancho: 14, total: true },
      { key: 'efectivo', titulo: 'Cobrado efectivo', tipo: 'euros', ancho: 15, total: true },
      ...(ext.iva.activo ? colsIva : []),
      { key: 'cobrado', titulo: 'Cobrado en periodo', tipo: 'euros', ancho: 16, total: true },
      { key: 'pendiente', titulo: 'Pendiente', tipo: 'euros', ancho: 12, total: true },
      { key: 'estado', titulo: 'Estado', tipo: 'texto', ancho: 10 },
    ],
    filas: ext.porPresupuesto,
  }
}

/** Resumen mensual por forma de pago. */
export function tablaMeses(ext) {
  return {
    titulo: 'Resumen mensual',
    columnas: [
      { key: 'etiqueta', titulo: 'Mes', tipo: 'texto', ancho: 18 },
      { key: 'n', titulo: 'Nº cobros', tipo: 'entero', ancho: 10, total: true },
      { key: 'banco', titulo: 'Banco', tipo: 'euros', ancho: 14, total: true },
      { key: 'efectivo', titulo: 'Efectivo', tipo: 'euros', ancho: 14, total: true },
      ...(ext.iva.activo ? [
        { key: 'base', titulo: 'Base imponible', tipo: 'euros', ancho: 14, total: true },
        { key: 'cuota', titulo: 'Cuota IVA', tipo: 'euros', ancho: 12, total: true },
      ] : []),
      { key: 'total', titulo: 'Total', tipo: 'euros', ancho: 14, total: true },
    ],
    filas: ext.porMes,
  }
}

export function totalesDeTabla(tabla) {
  const t = {}
  for (const c of tabla.columnas) {
    if (c.total) t[c.key] = c.tipo === 'entero'
      ? tabla.filas.reduce((s, f) => s + (Number(f[c.key]) || 0), 0)
      : r2(tabla.filas.reduce((s, f) => s + (Number(f[c.key]) || 0), 0))
  }
  return t
}

/** Texto del filtro de forma de pago, para cabeceras. */
export function etiquetaFiltroMetodo(metodo) {
  return metodo === 'todos' ? 'Todas las formas de pago' : `Solo ${etiquetaMetodo(metodo).toLowerCase()}`
}

import { crearXlsx, ESTILO, colLetra } from './xlsx'
import {
  NEGOCIO, tablaCobros, tablaPresupuestos, tablaMeses, totalesDeTabla, etiquetaFiltroMetodo,
} from '../extracto'
import { fmtFecha, fmtEuros } from '../cobros'

/**
 * Exportadores del extracto de cobros. Todos reciben el extracto ya calculado
 * (construirExtracto) y el rango (calcularRango) y devuelven
 * { nombre, mime, datos, meta } listo para descargar. "meta" son datos para el
 * registro de actividad (hojas, filas, páginas), sin datos personales.
 *
 *   excel(ext, rango)                 → .xlsx con hojas Resumen, Cobros y Por presupuesto
 *   pdf(ext, rango, detalle)          → .pdf imprimible con resumen + detalle
 *
 * detalle: 'cobros' (una fila por cobro) | 'presupuestos' (una fila por presupuesto)
 */

function ahora() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function nombreArchivo(rango, ext, sufijo = '') {
  return `extracto-cobros_${rango.corta}${sufijo}.${ext}`
}

function notaIva(ext) {
  return ext.iva.activo
    ? `IVA desglosado al ${ext.iva.porcentaje} % (los importes cobrados se consideran con IVA incluido).`
    : 'Importes cobrados, sin desglose de IVA.'
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

function celda(valor, tipo, total = false) {
  if (valor == null || valor === '') return null
  switch (tipo) {
    case 'fecha': return { v: valor, t: 'd', s: ESTILO.fecha }
    case 'euros': return { v: valor, t: 'n', s: total ? ESTILO.eurosTotal : ESTILO.euros }
    case 'entero': return { v: valor, t: 'n', s: total ? ESTILO.enteroTotal : ESTILO.entero }
    case 'pct': return { v: valor, t: 'n', s: ESTILO.pct }
    default: return { v: valor, t: 's' }
  }
}

/** Filas de una tabla (cabecera + datos + totales con SUMA) a partir de la fila "inicio" (1 = primera). */
function filasTabla(tabla, inicio = 1) {
  const cab = tabla.columnas.map(c => ({ v: c.titulo, t: 's', s: ESTILO.cabecera }))
  const datos = tabla.filas.map(f => tabla.columnas.map(c => celda(f[c.key], c.tipo)))
  const tot = totalesDeTabla(tabla)
  const primera = inicio + 1
  const ultima = inicio + tabla.filas.length
  const totales = tabla.columnas.map((c, j) => {
    if (j === 0) return { v: 'TOTAL', t: 's', s: ESTILO.totalTexto }
    if (!c.total) return { v: '', t: 's', s: ESTILO.totalTexto }
    const estilo = c.tipo === 'entero' ? ESTILO.enteroTotal : ESTILO.eurosTotal
    if (!tabla.filas.length) return { v: 0, t: 'n', s: estilo }
    const col = colLetra(j)
    return { t: 'f', f: `SUM(${col}${primera}:${col}${ultima})`, v: tot[c.key], s: estilo }
  })
  return { filas: [cab, ...datos, totales], ultimaDatos: ultima }
}

function hojaTabla(tabla) {
  const { filas, ultimaDatos } = filasTabla(tabla, 1)
  const ultimaCol = colLetra(tabla.columnas.length - 1)
  return {
    nombre: tabla.titulo,
    filas,
    anchos: tabla.columnas.map(c => c.ancho),
    altos: [30],
    fijarFilas: 1,
    autofiltro: `A1:${ultimaCol}${Math.max(ultimaDatos, 2)}`,
  }
}

function hojaResumen(ext, rango) {
  const t = ext.totales
  const meses = tablaMeses(ext)
  const filas = [
    [{ v: NEGOCIO.nombre, t: 's', s: ESTILO.titulo }],
    [{ v: 'Extracto de cobros', t: 's', s: ESTILO.negrita }],
    [{ v: 'Periodo:', t: 's', s: ESTILO.negrita }, { v: rango.etiqueta, t: 's' }],
    [{ v: 'Forma de pago:', t: 's', s: ESTILO.negrita }, { v: etiquetaFiltroMetodo(ext.metodo), t: 's' }],
    [{ v: `Generado el ${ahora()}. Fecha de referencia: fecha del cobro. ${notaIva(ext)}`, t: 's', s: ESTILO.gris }],
    [],
    [{ v: 'Totales del periodo', t: 's', s: ESTILO.negrita }],
    [{ v: 'Total cobrado', t: 's' }, { v: t.total, t: 'n', s: ESTILO.eurosTotal }],
    [{ v: '   Banco (transferencia / Bizum / tarjeta)', t: 's' }, { v: t.banco, t: 'n', s: ESTILO.euros }],
    [{ v: '   Efectivo', t: 's' }, { v: t.efectivo, t: 'n', s: ESTILO.euros }],
    ...(ext.iva.activo ? [
      [{ v: '   Base imponible', t: 's' }, { v: t.base, t: 'n', s: ESTILO.euros }],
      [{ v: `   Cuota IVA (${ext.iva.porcentaje} %)`, t: 's' }, { v: t.cuota, t: 'n', s: ESTILO.euros }],
    ] : []),
    [{ v: 'Nº de cobros', t: 's' }, { v: t.n, t: 'n', s: ESTILO.entero }],
    [{ v: 'Nº de presupuestos cobrados', t: 's' }, { v: t.nPresupuestos, t: 'n', s: ESTILO.entero }],
    [],
    [{ v: 'Por mes', t: 's', s: ESTILO.negrita }],
  ]
  const { filas: tablaFilas } = filasTabla(meses, filas.length + 1)
  return {
    nombre: 'Resumen',
    filas: [...filas, ...tablaFilas],
    anchos: [Math.max(36, meses.columnas[0].ancho), ...meses.columnas.slice(1).map(c => c.ancho)],
    combinar: ['A1:F1', 'A5:F5'],
    vertical: true,
  }
}

export function excel(ext, rango) {
  const datos = crearXlsx([
    hojaResumen(ext, rango),
    hojaTabla(tablaCobros(ext)),
    hojaTabla(tablaPresupuestos(ext)),
  ])
  return {
    nombre: nombreArchivo(rango, 'xlsx'),
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    datos,
    meta: { hojas: 3, filas: { cobros: ext.cobros.length, presupuestos: ext.porPresupuesto.length, meses: ext.porMes.length } },
  }
}

// ---------------------------------------------------------------------------
// PDF (texto real, no imagen: se puede copiar y buscar)
// ---------------------------------------------------------------------------

function textoPdf(v, tipo) {
  if (v == null || v === '') return ''
  if (tipo === 'fecha') return fmtFecha(v)
  if (tipo === 'euros') return fmtEuros(v)
  if (tipo === 'pct') return `${Math.round(Number(v) * 100)}%`
  return String(v)
}

export async function pdf(ext, rango, detalle = 'cobros') {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  const COLOR = { texto: [31, 41, 55], gris: [107, 114, 128], linea: [209, 213, 219], fondo: [243, 244, 246], acento: [217, 119, 6] }
  let y = M

  const set = (size, estilo = 'normal', color = COLOR.texto) => {
    doc.setFont('helvetica', estilo)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  // --- Cabecera ---
  set(16, 'bold')
  doc.text(NEGOCIO.nombre, M, y + 5)
  set(9, 'normal', COLOR.gris)
  doc.text(`Generado el ${ahora()}`, W - M, y + 5, { align: 'right' })
  y += 12
  set(12, 'bold', COLOR.acento)
  doc.text('EXTRACTO DE COBROS', M, y)
  y += 6
  set(10)
  doc.text(`Periodo: ${rango.etiqueta}`, M, y)
  y += 5
  set(9, 'normal', COLOR.gris)
  doc.text(`${etiquetaFiltroMetodo(ext.metodo)} · Fecha de referencia: fecha del cobro · ${notaIva(ext)}`, M, y)
  y += 7

  // --- Recuadros de totales ---
  const t = ext.totales
  const cajas = [
    ['Total cobrado', fmtEuros(t.total)],
    ['Banco', fmtEuros(t.banco)],
    ['Efectivo', fmtEuros(t.efectivo)],
    ...(ext.iva.activo ? [['Base imponible', fmtEuros(t.base)], [`IVA ${ext.iva.porcentaje} %`, fmtEuros(t.cuota)]] : []),
    ['Cobros / presupuestos', `${t.n} / ${t.nPresupuestos}`],
  ]
  const anchoCaja = (W - 2 * M - (cajas.length - 1) * 3) / cajas.length
  cajas.forEach(([etq, val], i) => {
    const x = M + i * (anchoCaja + 3)
    doc.setFillColor(...COLOR.fondo)
    doc.roundedRect(x, y, anchoCaja, 14, 1.5, 1.5, 'F')
    set(8, 'normal', COLOR.gris)
    doc.text(etq, x + 3, y + 5)
    set(11, 'bold')
    doc.text(val, x + 3, y + 11)
  })
  y += 20

  // --- Tablas ---
  function tablaPdf(tabla, { conTotales = true } = {}) {
    const anchoTotal = W - 2 * M
    const ancho = c => c.anchoPdf ?? c.ancho
    const sumaAnchos = tabla.columnas.reduce((s, c) => s + ancho(c), 0)
    const anchos = tabla.columnas.map(c => (ancho(c) / sumaAnchos) * anchoTotal)
    const titulos = tabla.columnas.map(c => c.corto || c.titulo)
    const derecha = c => ['euros', 'entero', 'pct'].includes(c.tipo)
    const PAD = 1.5
    const LH = 3.6 // alto de línea (mm) con letra 8

    const lineasCelda = (texto, j) => doc.splitTextToSize(texto, anchos[j] - 2 * PAD)

    function fila(valores, { cabecera = false, total = false } = {}) {
      set(cabecera ? 7.5 : 8, cabecera || total ? 'bold' : 'normal')
      const lineas = valores.map((v, j) => lineasCelda(v, j).slice(0, cabecera ? 2 : 3))
      const alto = Math.max(...lineas.map(l => l.length)) * LH + 2 * PAD
      if (y + alto > H - M - 6) {
        doc.addPage()
        y = M
        if (!cabecera) fila(titulos, { cabecera: true })
        set(cabecera ? 7.5 : 8, cabecera || total ? 'bold' : 'normal')
      }
      if (cabecera || total) {
        doc.setFillColor(...COLOR.fondo)
        doc.rect(M, y, anchoTotal, alto, 'F')
      }
      let x = M
      lineas.forEach((ls, j) => {
        const c = tabla.columnas[j]
        ls.forEach((l, k) => {
          const ty = y + PAD + LH * (k + 0.8)
          if (derecha(c) && !(cabecera && j === 0)) doc.text(l, x + anchos[j] - PAD, ty, { align: 'right' })
          else doc.text(l, x + PAD, ty)
        })
        x += anchos[j]
      })
      y += alto
      doc.setDrawColor(...COLOR.linea)
      doc.setLineWidth(cabecera ? 0.3 : 0.1)
      doc.line(M, y, M + anchoTotal, y)
    }

    fila(titulos, { cabecera: true })
    tabla.filas.forEach(f => fila(tabla.columnas.map(c => textoPdf(f[c.key], c.tipo))))
    if (!tabla.filas.length) {
      set(9, 'italic', COLOR.gris)
      doc.text('No hay cobros en este periodo.', M + PAD, y + 5)
      y += 8
    } else if (conTotales) {
      const tot = totalesDeTabla(tabla)
      fila(tabla.columnas.map((c, j) => (j === 0 ? 'TOTAL' : c.total ? textoPdf(tot[c.key], c.tipo) : '')), { total: true })
    }
  }

  function titulo(texto) {
    if (y + 20 > H - M) { doc.addPage(); y = M }
    set(10, 'bold')
    doc.text(texto, M, y + 4)
    y += 7
  }

  if (ext.porMes.length > 1) {
    titulo('Resumen por mes')
    tablaPdf(tablaMeses(ext))
    y += 6
  }

  const tabla = detalle === 'presupuestos' ? tablaPresupuestos(ext) : tablaCobros(ext)
  titulo(detalle === 'presupuestos' ? 'Detalle por presupuesto' : 'Detalle de cobros')
  tablaPdf(tabla)

  // --- Pie con número de página ---
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    set(8, 'normal', COLOR.gris)
    doc.text(`${NEGOCIO.nombre} · Extracto de cobros ${rango.corta}`, M, H - 6)
    doc.text(`Página ${i} de ${paginas}`, W - M, H - 6, { align: 'right' })
  }

  return {
    nombre: nombreArchivo(rango, 'pdf', detalle === 'presupuestos' ? '_por-presupuesto' : ''),
    mime: 'application/pdf',
    datos: doc.output('arraybuffer'),
    meta: { paginas, detalle, filas: tabla.filas.length },
  }
}

/** Descarga en el navegador el resultado de un exportador. */
export function descargar({ nombre, mime, datos }) {
  const blob = new Blob([datos], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

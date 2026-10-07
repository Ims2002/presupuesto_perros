import { hoyISO, fmtFecha } from './cobros'

/**
 * Cálculo de periodos para el extracto. Todas las fechas son "YYYY-MM-DD"
 * (hora local), que se comparan bien como texto.
 *
 * Tipos de periodo:
 *   { tipo: 'ultimos', n: 3, unidad: 'dias' | 'semanas' | 'meses' }  → móvil, termina hoy
 *   { tipo: 'mes', offset: 0 | -1 ... }                               → mes natural
 *   { tipo: 'trimestre', offset: 0 | -1 ... }                         → trimestre natural (IVA / IRPF)
 *   { tipo: 'anio', offset: 0 | -1 }                                  → año natural
 *   { tipo: 'rango', desde, hasta }                                   → personalizado
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function aFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function sumarDias(iso, n) {
  const d = aFecha(iso)
  d.setDate(d.getDate() + n)
  return hoyISO(d)
}

/** Suma meses respetando el fin de mes (31/03 - 1 mes = 28/02 o 29/02). */
export function sumarMeses(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const destino = new Date(y, m - 1 + n, 1)
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate()
  destino.setDate(Math.min(d, ultimoDia))
  return hoyISO(destino)
}

function inicioMes(y, m) { return hoyISO(new Date(y, m, 1)) }
function finMes(y, m) { return hoyISO(new Date(y, m + 1, 0)) }

export function nombreMes(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number)
  const nombre = MESES[m - 1]
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${y}`
}

/**
 * @returns {{ desde: string, hasta: string, etiqueta: string, corta: string }}
 *   etiqueta: texto para cabeceras ("3.er trimestre 2026 (01/07/2026 – 30/09/2026)")
 *   corta:    texto para nombres de archivo ("2026-T3")
 */
export function calcularRango(periodo, hoy = hoyISO()) {
  const [hy, hm] = hoy.split('-').map(Number)
  const rango = (desde, hasta) => `${fmtFecha(desde)} – ${fmtFecha(hasta)}`

  switch (periodo?.tipo) {
    case 'ultimos': {
      const n = Math.max(1, Math.floor(Number(periodo.n) || 1))
      let desde
      if (periodo.unidad === 'meses') desde = sumarDias(sumarMeses(hoy, -n), 1)
      else if (periodo.unidad === 'semanas') desde = sumarDias(hoy, -(7 * n - 1))
      else desde = sumarDias(hoy, -(n - 1))
      const u = periodo.unidad === 'meses' ? 'meses' : periodo.unidad === 'semanas' ? 'semanas' : 'dias'
      const texto = n === 1
        ? { dias: 'Hoy', semanas: 'Última semana', meses: 'Último mes' }[u]
        : { dias: `Últimos ${n} días`, semanas: `Últimas ${n} semanas`, meses: `Últimos ${n} meses` }[u]
      return { desde, hasta: hoy, etiqueta: `${texto} (${rango(desde, hoy)})`, corta: `${desde}_${hoy}` }
    }
    case 'mes': {
      const d = new Date(hy, hm - 1 + (Number(periodo.offset) || 0), 1)
      const desde = inicioMes(d.getFullYear(), d.getMonth())
      const hasta = finMes(d.getFullYear(), d.getMonth())
      return { desde, hasta, etiqueta: `${nombreMes(desde.slice(0, 7))} (${rango(desde, hasta)})`, corta: desde.slice(0, 7) }
    }
    case 'trimestre': {
      const qActual = Math.floor((hm - 1) / 3)
      const d = new Date(hy, qActual * 3 + 3 * (Number(periodo.offset) || 0), 1)
      const q = Math.floor(d.getMonth() / 3)
      const desde = inicioMes(d.getFullYear(), q * 3)
      const hasta = finMes(d.getFullYear(), q * 3 + 2)
      const ord = ['1.er', '2.º', '3.er', '4.º'][q]
      return { desde, hasta, etiqueta: `${ord} trimestre ${d.getFullYear()} (${rango(desde, hasta)})`, corta: `${d.getFullYear()}-T${q + 1}` }
    }
    case 'anio': {
      const y = hy + (Number(periodo.offset) || 0)
      const desde = `${y}-01-01`
      const hasta = `${y}-12-31`
      return { desde, hasta, etiqueta: `Año ${y} (${rango(desde, hasta)})`, corta: String(y) }
    }
    case 'rango':
    default: {
      let desde = periodo?.desde || hoy
      let hasta = periodo?.hasta || hoy
      if (desde > hasta) [desde, hasta] = [hasta, desde]
      return { desde, hasta, etiqueta: rango(desde, hasta), corta: `${desde}_${hasta}` }
    }
  }
}

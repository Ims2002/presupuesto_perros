import { useState, useEffect, useMemo, useRef } from 'react'
import { listarPresupuestos, mensajeError } from '../lib/presupuestosRepo'
import { calcularRango } from '../lib/periodos'
import { construirExtracto, tablaCobros, tablaPresupuestos, tablaMeses, totalesDeTabla } from '../lib/extracto'
import { excel, pdf, descargar } from '../lib/export/exportadores'
import { estadoCobro, fmtEuros, fmtFecha, hoyISO } from '../lib/cobros'
import { registrarResumenCobros } from '../lib/pagosRepo'
import { createLogger } from '../lib/logger'

/*
 * Registro de actividad (scope "extracto"): apertura, cambios de periodo y
 * filtros, resumen del extracto calculado (agrupado para no llenar el registro
 * mientras se escribe), avisos de fechas invertidas o IVA no válido y cada
 * exportación con su tamaño, filas y páginas. Sin nombres ni notas.
 */
const log = createLogger('extracto')

// Espera tras el último cambio antes de registrar el resumen del extracto
const ESPERA_RESUMEN_MS = 800

const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 bg-white'
const lbl = 'block text-xs text-gray-500 mb-1'
const card = 'bg-white rounded-2xl p-4 shadow-sm'

const PRESETS = [
  { id: 'mes0', texto: 'Este mes', periodo: { tipo: 'mes', offset: 0 } },
  { id: 'mes-1', texto: 'Mes pasado', periodo: { tipo: 'mes', offset: -1 } },
  { id: 'tri0', texto: 'Este trimestre', periodo: { tipo: 'trimestre', offset: 0 } },
  { id: 'anio0', texto: 'Este año', periodo: { tipo: 'anio', offset: 0 } },
]

// v2: el IVA pasa a estar activado por defecto (se ignoran preferencias antiguas)
const PREFS_KEY = 'extracto_prefs_v2'
const PREFS_DEFECTO = {
  modo: 'preset',            // 'preset' | 'ultimos' | 'rango'
  preset: 'mes-1',
  n: 3,
  unidad: 'meses',
  desde: '',
  hasta: '',
  metodo: 'todos',
  ivaActivo: true,          // por defecto se desglosa el IVA (21 %) en banco y en efectivo
  ivaPct: 21,
}

function leerPrefs() {
  try {
    const p = { ...PREFS_DEFECTO, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
    // Un periodo guardado que ya no existe (p. ej. "Trimestre pasado") vuelve al de por defecto
    if (!PRESETS.some(x => x.id === p.preset)) p.preset = PREFS_DEFECTO.preset
    return p
  } catch (err) {
    log.warn('Preferencias del extracto ilegibles; se usan las de por defecto', { error: err })
    return PREFS_DEFECTO
  }
}

/** Formatos de exportación que se ofrecen (las "versiones" a probar con el gestor). */
const FORMATOS = [
  { id: 'xlsx', titulo: 'Excel completo', ext: '.xlsx', desc: '3 hojas: resumen por mes, libro de cobros (una fila por cobro) y por presupuesto. Fechas e importes como datos reales, con totales y filtros.', filaCompleta: true },
  { id: 'pdf-cobros', titulo: 'PDF · detalle de cobros', ext: '.pdf', desc: 'Para imprimir o adjuntar: totales, resumen mensual y una línea por cobro.' },
  { id: 'pdf-presupuestos', titulo: 'PDF · por presupuesto', ext: '.pdf', desc: 'Una línea por presupuesto, separando lo cobrado por banco y en efectivo.' },
]

function valorCelda(v, tipo) {
  if (v == null || v === '') return ''
  if (tipo === 'fecha') return fmtFecha(v)
  if (tipo === 'euros') return fmtEuros(v)
  if (tipo === 'pct') return `${Math.round(v * 100)}%`
  return v
}

/** Tabla de vista previa en pantalla (desplazable en horizontal en el móvil). */
function TablaPrevia({ tabla, ocultar = [] }) {
  const columnas = tabla.columnas.filter(c => !ocultar.includes(c.key))
  const tot = totalesDeTabla(tabla)
  if (!tabla.filas.length) return <div className="text-center py-10 text-gray-400 text-sm">No hay cobros en este periodo.</div>
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 text-gray-600">
            {columnas.map(c => (
              <th key={c.key} className={`px-2 py-2 font-semibold whitespace-nowrap border-b border-gray-200 ${['euros', 'entero', 'pct'].includes(c.tipo) ? 'text-right' : 'text-left'}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, i) => (
            <tr key={i} className="border-b border-gray-100">
              {columnas.map(c => (
                <td key={c.key} className={`px-2 py-1.5 align-top ${['euros', 'entero', 'pct'].includes(c.tipo) ? 'text-right tabular-nums whitespace-nowrap' : ''} ${c.tipo === 'fecha' || c.key === 'numero' ? 'whitespace-nowrap tabular-nums' : ''} ${c.key === 'concepto' ? 'min-w-[200px]' : ''} ${['cliente', 'mascota', 'estancia', 'formaPago', 'estado'].includes(c.key) ? 'whitespace-nowrap' : ''}`}>
                  {valorCelda(f[c.key], c.tipo)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            {columnas.map((c, j) => (
              <td key={c.key} className={`px-2 py-2 whitespace-nowrap ${['euros', 'entero', 'pct'].includes(c.tipo) ? 'text-right tabular-nums' : ''}`}>
                {j === 0 ? 'TOTAL' : c.total ? (c.tipo === 'entero' ? tot[c.key] : fmtEuros(tot[c.key])) : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * Vista "Extracto": cobros de un periodo, listos para enviar al gestor.
 * Se filtra por la fecha del cobro.
 */
export default function Extracto() {
  const [presupuestos, setPresupuestos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [prefs, setPrefs] = useState(leerPrefs)
  const [vistaPrevia, setVistaPrevia] = useState('cobros') // 'cobros' | 'presupuestos' | 'meses'
  const [exportando, setExportando] = useState(null)
  const [errorExport, setErrorExport] = useState(null)

  const set = cambios => {
    log.debug('Opción del extracto cambiada', cambios)
    setPrefs(p => ({ ...p, ...cambios }))
  }

  useEffect(() => {
    log.info('Vista de extracto abierta', {
      modo: prefs.modo, preset: prefs.preset, metodo: prefs.metodo, iva: prefs.ivaActivo ? `${prefs.ivaPct} %` : 'sin desglose',
    })
    // Solo al abrir la vista
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch (err) {
      log.debug('No se pudieron guardar las preferencias del extracto (almacenamiento no disponible)', { error: err })
    }
  }, [prefs])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setLoading(true)
      setError(null)
      try {
        const data = await listarPresupuestos()
        if (!cancelado) {
          setPresupuestos(data)
          registrarResumenCobros('extracto', data)
        }
      } catch (err) {
        log.error('No se pudieron cargar los presupuestos para el extracto', { error: err })
        if (!cancelado) setError(mensajeError(err))
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [recarga])

  const periodo = useMemo(() => {
    if (prefs.modo === 'ultimos') return { tipo: 'ultimos', n: prefs.n, unidad: prefs.unidad }
    if (prefs.modo === 'rango') return { tipo: 'rango', desde: prefs.desde || hoyISO(), hasta: prefs.hasta || hoyISO() }
    return (PRESETS.find(p => p.id === prefs.preset) || PRESETS[1]).periodo
  }, [prefs.modo, prefs.n, prefs.unidad, prefs.desde, prefs.hasta, prefs.preset])

  const rango = useMemo(() => calcularRango(periodo), [periodo])

  const ext = useMemo(() => construirExtracto(presupuestos, {
    desde: rango.desde,
    hasta: rango.hasta,
    metodo: prefs.metodo,
    iva: { activo: prefs.ivaActivo, porcentaje: Number(prefs.ivaPct) || 0 },
  }), [presupuestos, rango, prefs.metodo, prefs.ivaActivo, prefs.ivaPct])

  // Resumen del extracto en el registro: se espera a que el usuario deje de
  // cambiar opciones (p. ej. mientras escribe "Últimos N") para dejar una
  // sola entrada por combinación, con los avisos que correspondan.
  const ultimoResumen = useRef('')
  useEffect(() => {
    if (loading || error) return
    const timer = setTimeout(() => {
      const pct = Number(prefs.ivaPct)
      const clave = JSON.stringify([rango.desde, rango.hasta, prefs.metodo, prefs.ivaActivo, prefs.ivaPct, ext.totales.n, ext.totales.total])
      if (clave === ultimoResumen.current) return
      ultimoResumen.current = clave
      if (prefs.modo === 'rango' && prefs.desde && prefs.hasta && prefs.desde > prefs.hasta) {
        log.warn('Fechas exactas invertidas: se usan en orden', { desde: prefs.desde, hasta: prefs.hasta })
      }
      if (prefs.ivaActivo && (!Number.isFinite(pct) || pct <= 0 || pct > 100)) {
        log.warn('Tipo de IVA no válido: el desglose sale con IVA 0', { valor: String(prefs.ivaPct).slice(0, 10) })
      }
      log.info('Extracto calculado', {
        periodo: rango.etiqueta,
        desde: rango.desde,
        hasta: rango.hasta,
        metodo: prefs.metodo,
        iva: prefs.ivaActivo ? Number(prefs.ivaPct) || 0 : null,
        ...ext.totales,
      })
    }, ESPERA_RESUMEN_MS)
    return () => clearTimeout(timer)
  }, [loading, error, rango, ext, prefs.modo, prefs.desde, prefs.hasta, prefs.metodo, prefs.ivaActivo, prefs.ivaPct])

  function cambiarVistaPrevia(k) {
    if (k !== vistaPrevia) log.debug('Vista previa del extracto', { vista: k })
    setVistaPrevia(k)
  }

  // Presupuestos sin ningún cobro registrado: aviso para no olvidar marcarlos
  const sinCobro = useMemo(() => presupuestos.filter(p => estadoCobro(p).pagos.length === 0).length, [presupuestos])

  async function exportar(id) {
    if (exportando) {
      log.warn('Exportación ignorada: ya hay otra en curso', { formato: id, enCurso: exportando })
      return
    }
    setExportando(id)
    setErrorExport(null)
    const datos = {
      formato: id, desde: rango.desde, hasta: rango.hasta, metodo: prefs.metodo,
      iva: ext.iva.activo ? ext.iva.porcentaje : null, cobros: ext.totales.n, total: ext.totales.total,
    }
    if (ext.totales.n === 0) log.warn('Se exporta un extracto sin cobros', datos)
    const t = log.time('Exportar extracto', datos)
    try {
      let archivo
      if (id === 'xlsx') archivo = excel(ext, rango)
      else if (id === 'pdf-cobros') archivo = await pdf(ext, rango, 'cobros')
      else archivo = await pdf(ext, rango, 'presupuestos')
      descargar(archivo)
      const bytes = archivo.datos.byteLength ?? archivo.datos.length
      t.end({ archivo: archivo.nombre, kb: Math.round(bytes / 102.4) / 10, ...archivo.meta })
    } catch (err) {
      t.fail(err)
      setErrorExport(mensajeError(err))
    } finally {
      setExportando(null)
    }
  }

  const chip = activo => `text-xs px-3 py-1.5 rounded-full border transition-colors ${activo ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`
  const tablaVista = vistaPrevia === 'presupuestos' ? tablaPresupuestos(ext) : vistaPrevia === 'meses' ? tablaMeses(ext) : tablaCobros(ext)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Extracto de cobros</h2>
        <p className="text-xs text-gray-500">Presupuestos cobrados en un periodo, para enviar al gestor. Se cuenta la fecha en que se cobró.</p>
      </div>

      {/* --- Periodo y opciones --- */}
      <div className={`${card} space-y-4`}>
        <div>
          <div className={lbl}>Periodo</div>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.id} className={chip(prefs.modo === 'preset' && prefs.preset === p.id)} onClick={() => set({ modo: 'preset', preset: p.id })}>{p.texto}</button>
            ))}
            <button className={chip(prefs.modo === 'ultimos')} onClick={() => set({ modo: 'ultimos' })}>Últimos…</button>
            <button className={chip(prefs.modo === 'rango')} onClick={() => set({ modo: 'rango', desde: prefs.desde || rango.desde, hasta: prefs.hasta || rango.hasta })}>Fechas exactas</button>
          </div>

          {prefs.modo === 'ultimos' && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-gray-600">Últimos</span>
              <input
                aria-label="Cantidad"
                type="number" min="1" max="999" inputMode="numeric"
                className={`${inp} w-20`}
                value={prefs.n}
                onChange={e => set({ n: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
              />
              <select aria-label="Unidad" className={inp} value={prefs.unidad} onChange={e => set({ unidad: e.target.value })}>
                <option value="dias">días</option>
                <option value="semanas">semanas</option>
                <option value="meses">meses</option>
              </select>
            </div>
          )}
          {prefs.modo === 'rango' && (
            <div className="grid grid-cols-2 gap-2 mt-3 max-w-sm">
              <div>
                <label className={lbl} htmlFor="ext-desde">Desde</label>
                <input id="ext-desde" type="date" className={`${inp} w-full`} value={prefs.desde} onChange={e => set({ desde: e.target.value })} />
              </div>
              <div>
                <label className={lbl} htmlFor="ext-hasta">Hasta</label>
                <input id="ext-hasta" type="date" className={`${inp} w-full`} value={prefs.hasta} onChange={e => set({ hasta: e.target.value })} />
              </div>
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500">{rango.etiqueta}</div>
        </div>

        <div className="flex gap-6 flex-wrap">
          <div>
            <div className={lbl}>Forma de pago</div>
            <div className="flex gap-2">
              {[['todos', 'Todas'], ['banco', 'Banco'], ['efectivo', 'Efectivo']].map(([k, t]) => (
                <button key={k} className={chip(prefs.metodo === k)} onClick={() => set({ metodo: k })}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className={lbl}>IVA</div>
            <label className="flex items-center gap-2 text-sm text-gray-700 py-1">
              <input type="checkbox" checked={prefs.ivaActivo} onChange={e => set({ ivaActivo: e.target.checked })} className="accent-amber-500" />
              Desglosar IVA incluido al
              <input
                aria-label="Porcentaje de IVA"
                type="number" min="0" max="100" inputMode="decimal"
                className={`${inp} w-16 py-1`}
                value={prefs.ivaPct}
                disabled={!prefs.ivaActivo}
                onChange={e => set({ ivaPct: e.target.value })}
              />
              %
            </label>
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>}
      {error && (
        <div className="text-center py-12 text-red-400 text-sm">
          <div>Error: {error}</div>
          <button onClick={() => { log.info('Reintentar carga del extracto'); setRecarga(r => r + 1) }} className="mt-3 text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50">Reintentar</button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* --- Totales --- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Total cobrado', fmtEuros(ext.totales.total), 'text-gray-900'],
              ['Banco', fmtEuros(ext.totales.banco), 'text-sky-700'],
              ['Efectivo', fmtEuros(ext.totales.efectivo), 'text-emerald-700'],
              ['Cobros · presupuestos', `${ext.totales.n} · ${ext.totales.nPresupuestos}`, 'text-gray-900'],
              ...(prefs.ivaActivo ? [
                ['Base imponible', fmtEuros(ext.totales.base), 'text-gray-900'],
                [`Cuota IVA ${prefs.ivaPct} %`, fmtEuros(ext.totales.cuota), 'text-gray-900'],
              ] : []),
            ].map(([k, v, c]) => (
              <div key={k} className="bg-white rounded-xl shadow-sm px-3 py-2.5">
                <div className="text-[11px] text-gray-500">{k}</div>
                <div className={`text-base font-bold tabular-nums ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {sinCobro > 0 && (
            <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              Hay {sinCobro} presupuesto{sinCobro === 1 ? '' : 's'} sin ningún cobro registrado. Si ya se cobraron, márcalos en el Historial para que salgan aquí.
            </div>
          )}

          {/* --- Descargas --- */}
          <div className={card}>
            <div className="text-sm font-semibold text-gray-700 mb-1">Descargar para el gestor</div>
            <p className="text-xs text-gray-500 mb-3">Mismos datos en varios formatos. Prueba cuál le encaja mejor.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {FORMATOS.map(f => (
                <button
                  key={f.id}
                  onClick={() => exportar(f.id)}
                  disabled={!!exportando}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-60 border-gray-200 hover:bg-gray-50 ${f.filaCompleta ? 'sm:col-span-2' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{f.titulo}</span>
                    <span className="text-[10px] font-mono text-gray-400">{f.ext}</span>
                    <span className="ml-auto text-xs text-amber-700">{exportando === f.id ? 'Generando…' : 'Descargar'}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{f.desc}</div>
                </button>
              ))}
            </div>
            {errorExport && <p role="alert" className="text-xs text-red-600 mt-3">No se pudo generar el archivo: {errorExport}</p>}
          </div>

          {/* --- Vista previa --- */}
          <div className={card}>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div className="text-sm font-semibold text-gray-700">Vista previa</div>
              <div className="flex gap-2">
                {[['cobros', 'Por cobro'], ['presupuestos', 'Por presupuesto'], ['meses', 'Por mes']].map(([k, t]) => (
                  <button key={k} className={chip(vistaPrevia === k)} onClick={() => cambiarVistaPrevia(k)}>{t}</button>
                ))}
              </div>
            </div>
            <TablaPrevia tabla={tablaVista} ocultar={['ivaPct']} />
          </div>
        </>
      )}
    </div>
  )
}

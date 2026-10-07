import { useState, useEffect, useMemo } from 'react'
import {
  LEVELS, SESSION_ID, getLogs, clearLogs, subscribeLogs, downloadLogs, logsAsJson,
  getLogLevel, setLogLevel, createLogger,
} from '../lib/logger'

const log = createLogger('registro')

// Colores por nivel (badge)
const BADGE = {
  debug: 'bg-gray-100 text-gray-500',
  info: 'bg-blue-50 text-blue-600',
  warn: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-600',
}

function hora(ts) {
  const d = new Date(ts)
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Visor del registro de actividad (logs guardados en este dispositivo).
 * Permite filtrar por nivel, módulo (cobros, pagos, extracto, db...), texto y sesión, ver el detalle de cada entrada,
 * copiar/descargar el registro para enviarlo y cambiar el nivel de detalle.
 * Se abre desde el pie de página o con Ctrl+Shift+L.
 */
export default function LogViewer({ onClose }) {
  const [entries, setEntries] = useState(getLogs)
  const [nivelMin, setNivelMin] = useState('info')     // filtro de visualización
  const [texto, setTexto] = useState('')
  const [modulo, setModulo] = useState('')               // '' = todos; si no, scope ("cobros", "extracto"...)
  const [soloSesion, setSoloSesion] = useState(false)
  const [nivelRegistro, setNivelRegistro] = useState(getLogLevel) // qué se guarda
  const [copiado, setCopiado] = useState(false)

  // Actualización en vivo mientras el visor está abierto
  useEffect(() => subscribeLogs(e => {
    setEntries(e === null ? [] : getLogs())
  }), [])

  const visibles = useMemo(() => {
    const s = texto.trim().toLowerCase()
    return entries
      .filter(e => LEVELS[e.level] >= LEVELS[nivelMin])
      .filter(e => !soloSesion || e.session === SESSION_ID)
      .filter(e => !modulo || e.scope === modulo || e.scope.startsWith(`${modulo}:`))
      .filter(e => !s || `${e.scope} ${e.msg} ${JSON.stringify(e.data ?? '')}`.toLowerCase().includes(s))
      .slice()
      .reverse() // más recientes primero
  }, [entries, nivelMin, texto, soloSesion, modulo])

  // Módulos presentes en el registro (scope sin el sufijo ":sub")
  const modulos = useMemo(() => [...new Set(entries.map(e => String(e.scope).split(':')[0]))].sort(), [entries])

  const errores = entries.filter(e => e.level === 'error').length
  const avisos = entries.filter(e => e.level === 'warn').length

  function cambiarNivelRegistro(n) {
    setLogLevel(n)
    setNivelRegistro(n)
    log.info('Nivel de registro cambiado', { nivel: n })
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(logsAsJson())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      downloadLogs() // sin permiso de portapapeles (http en el móvil): se descarga
    }
  }

  function borrar() {
    if (confirm('¿Borrar todo el registro de este dispositivo?')) clearLogs()
  }

  const sel = 'border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400 bg-white'
  const btn = 'text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50'

  return (
    <div className="no-print fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Cabecera */}
        <div className="border-b border-gray-100 px-5 py-4 flex justify-between items-start gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Registro de actividad</h2>
            <div className="text-xs text-gray-400 mt-0.5">
              {entries.length} entradas · <span className="text-red-500">{errores} errores</span> · <span className="text-amber-600">{avisos} avisos</span> · sesión {SESSION_ID}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Cerrar">×</button>
        </div>

        {/* Filtros y acciones */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2 items-center">
          <select className={sel} value={nivelMin} onChange={e => setNivelMin(e.target.value)} title="Mostrar desde este nivel">
            <option value="debug">Todo (debug)</option>
            <option value="info">Info y superior</option>
            <option value="warn">Avisos y errores</option>
            <option value="error">Solo errores</option>
          </select>
          <select className={sel} value={modulo} onChange={e => setModulo(e.target.value)} title="Mostrar solo un módulo" aria-label="Módulo">
            <option value="">Todos los módulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className={`${sel} flex-1 min-w-[120px]`} placeholder="Buscar..." value={texto} onChange={e => setTexto(e.target.value)} />
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={soloSesion} onChange={e => setSoloSesion(e.target.checked)} />
            Solo esta sesión
          </label>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-auto px-5 py-3 space-y-1.5">
          {visibles.length === 0 && <div className="text-center text-xs text-gray-400 py-10">Sin entradas</div>}
          {visibles.map(e => (
            <details key={`${e.session}-${e.seq}`} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
              <summary className="cursor-pointer list-none flex gap-2 items-baseline flex-wrap">
                <span className="text-gray-400 font-mono">{hora(e.ts)}</span>
                <span className={`px-1.5 rounded font-semibold uppercase text-[10px] ${BADGE[e.level]}`}>{e.level}</span>
                <span className="text-gray-500 font-mono">{e.scope}</span>
                <span className="text-gray-800">{e.msg}</span>
                {e.session !== SESSION_ID && <span className="text-gray-300 font-mono">({e.session})</span>}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-gray-600 font-mono">
                {JSON.stringify({ data: e.data, ctx: e.ctx }, null, 2)}
              </pre>
            </details>
          ))}
        </div>

        {/* Pie */}
        <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap gap-2 justify-between items-center">
          <label className="text-xs text-gray-500 flex items-center gap-2">
            Guardar desde:
            <select className={sel} value={nivelRegistro} onChange={e => cambiarNivelRegistro(e.target.value)}>
              <option value="debug">debug (máximo detalle)</option>
              <option value="info">info (normal)</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className={btn} onClick={borrar}>Borrar</button>
            <button className={btn} onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
            <button className="text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium" onClick={downloadLogs}>
              Descargar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

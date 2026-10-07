import { useState, useRef } from 'react'
import { METODOS, estadoCobro, fmtEuros, fmtFecha, hoyISO, r2, etiquetaMetodo } from '../lib/cobros'
import { guardarPagos, nuevoPago } from '../lib/pagosRepo'
import { mensajeError } from '../lib/presupuestosRepo'
import { createLogger } from '../lib/logger'

const log = createLogger('cobros')

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400'
const lbl = 'block text-xs text-gray-500 mb-1'

/**
 * Ventana para registrar el cobro de un presupuesto.
 *
 * Lo normal es un solo toque: elige Banco o Efectivo y "Marcar como pagado"
 * (fecha de hoy e importe pendiente ya rellenados). Si se cobra en varias
 * veces (señal del 50 % + resto), se puede cambiar el importe y registrar
 * cada cobro por separado. Los cobros registrados se pueden quitar: si hay
 * más de uno, se pregunta si quitar solo ese o todos los del presupuesto.
 *
 * Props:
 *   presupuesto  - registro de la base de datos (con id, numero, total, pagos)
 *   onClose()
 *   onGuardado(pagos) - lista de cobros ya guardada en la base de datos
 */
export default function CobroModal({ presupuesto, onClose, onGuardado }) {
  const est = estadoCobro(presupuesto)
  const [metodo, setMetodo] = useState('banco')
  const [fecha, setFecha] = useState(hoyISO())
  const [importe, setImporte] = useState(est.pendiente > 0 ? String(est.pendiente) : '')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [quitar, setQuitar] = useState(null) // id del cobro pendiente de confirmar para quitar (si solo hay uno)
  const [preguntaQuitar, setPreguntaQuitar] = useState(null) // cobro pulsado cuando hay varios: abre la pregunta
  const ocupado = useRef(false)

  const importeNum = r2(String(importe).replace(',', '.'))
  const importeValido = importeNum > 0 && !!fecha
  const exceso = importeValido && importeNum > est.pendiente + 0.005
  const esTotal = importeValido && Math.abs(importeNum - est.pendiente) < 0.005

  async function guardar(lista) {
    if (ocupado.current) return
    ocupado.current = true
    setGuardando(true)
    setError(null)
    try {
      await guardarPagos(presupuesto.id, presupuesto.numero, lista)
      onGuardado(lista)
    } catch (err) {
      log.error('No se pudo guardar el cobro', { id: presupuesto.id, numero: presupuesto.numero, error: err })
      setError(mensajeError(err))
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  function registrar() {
    if (!importeValido) return
    const pago = nuevoPago({ fecha, importe: importeNum, metodo, nota })
    guardar([...est.pagos, pago])
  }

  function quitarPago(id) {
    // Con varios cobros se pregunta si quitar solo este o todos
    if (est.pagos.length > 1) {
      setPreguntaQuitar(est.pagos.find(x => x.id === id) || null)
      return
    }
    if (quitar !== id) { setQuitar(id); return }
    guardar(est.pagos.filter(x => x.id !== id))
  }

  function quitarSoloEste() {
    const id = preguntaQuitar.id
    log.info('Quitar un cobro', { numero: presupuesto.numero, cobros: est.pagos.length })
    setPreguntaQuitar(null)
    guardar(est.pagos.filter(x => x.id !== id))
  }

  function quitarTodos() {
    log.info('Quitar todos los cobros', { numero: presupuesto.numero, cobros: est.pagos.length })
    setPreguntaQuitar(null)
    guardar([])
  }

  const titulo = est.pagos.length ? 'Cobros del presupuesto' : 'Marcar como pagado'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={titulo}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[92svh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800">{titulo}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono font-semibold text-amber-600">#{presupuesto.numero}</span>
              {presupuesto.cliente?.nombre ? ` · ${presupuesto.cliente.nombre}` : ''}
              {presupuesto.mascota ? ` — ${presupuesto.mascota}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {/* Situación actual */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          {[['Total', est.total, 'text-gray-800'], ['Cobrado', est.cobrado, 'text-green-700'], ['Pendiente', est.pendiente, est.pendiente > 0 ? 'text-amber-600' : 'text-gray-400']].map(([k, v, c]) => (
            <div key={k} className="bg-gray-50 rounded-xl py-2">
              <div className="text-[11px] text-gray-500">{k}</div>
              <div className={`text-sm font-semibold ${c}`}>{fmtEuros(v)}</div>
            </div>
          ))}
        </div>

        {/* Cobros ya registrados */}
        {est.pagos.length > 0 && (
          <div className="mb-4">
            <div className={lbl}>Cobros registrados</div>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {est.pagos.map(x => (
                <li key={x.id || `${x.fecha}-${x.importe}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-gray-500 tabular-nums">{fmtFecha(x.fecha)}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${x.metodo === 'efectivo' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
                    {etiquetaMetodo(x.metodo)}
                  </span>
                  {x.nota && <span className="text-xs text-gray-400 truncate">{x.nota}</span>}
                  <span className="ml-auto font-medium text-gray-800 tabular-nums">{fmtEuros(x.importe)}</span>
                  <button
                    onClick={() => quitarPago(x.id)}
                    disabled={guardando}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${quitar === x.id ? 'bg-red-500 border-red-500 text-white' : 'border-red-200 text-red-500 hover:bg-red-50'}`}
                  >
                    {quitar === x.id ? '¿Quitar?' : 'Quitar'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Nuevo cobro */}
        {(est.pendiente > 0 || est.pagos.length === 0) ? (
          <div className="space-y-3">
            {est.pagos.length > 0 && <div className="text-xs font-semibold text-gray-600">Registrar otro cobro</div>}
            <div>
              <div className={lbl}>Forma de pago</div>
              <div className="grid grid-cols-2 gap-2">
                {METODOS.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetodo(m.key)}
                    aria-pressed={metodo === m.key}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${metodo === m.key ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="text-sm font-semibold text-gray-800">{m.label}</div>
                    <div className="text-[11px] text-gray-500">{m.ayuda}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl} htmlFor="cobro-fecha">Fecha del cobro</label>
                <input id="cobro-fecha" type="date" className={inp} value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={lbl} htmlFor="cobro-importe">Importe (€)</label>
                <input id="cobro-importe" inputMode="decimal" className={inp} value={importe} onChange={e => setImporte(e.target.value)} />
              </div>
            </div>
            {est.pendiente > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => setImporte(String(est.pendiente))} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Todo lo pendiente
                </button>
                {est.cobrado === 0 && (
                  <button type="button" onClick={() => { setImporte(String(r2(est.total / 2))); setNota(n => n || 'Señal 50 %') }} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50">
                    Señal 50 %
                  </button>
                )}
              </div>
            )}
            <div>
              <label className={lbl} htmlFor="cobro-nota">Nota (opcional)</label>
              <input id="cobro-nota" className={inp} value={nota} placeholder="Ej: Señal 50 %, Bizum de su pareja..." onChange={e => setNota(e.target.value)} />
            </div>
            {exceso && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                El importe supera lo pendiente ({fmtEuros(est.pendiente)}). Se guardará igualmente.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2.5">✓ Este presupuesto está pagado del todo.</p>
        )}

        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</p>}

        {/* Pregunta al quitar un cobro cuando hay varios */}
        {preguntaQuitar && (
          <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setPreguntaQuitar(null)}>
            <div role="alertdialog" aria-label="Quitar cobros" className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <h4 className="text-base font-semibold text-gray-800 mb-2">¿Eliminar todos los cobros?</h4>
              <p className="text-sm text-gray-500 mb-4">
                Este presupuesto tiene <span className="font-semibold text-gray-700">{est.pagos.length} cobros</span> por
                un total de <span className="font-semibold text-gray-700">{fmtEuros(est.cobrado)}</span>.
                ¿Quieres eliminar todos o solo el del {fmtFecha(preguntaQuitar.fecha)} ({etiquetaMetodo(preguntaQuitar.metodo)}, {fmtEuros(preguntaQuitar.importe)})?
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={quitarTodos} disabled={guardando} className="text-sm px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50">
                  Eliminar todos los cobros ({est.pagos.length})
                </button>
                <button onClick={quitarSoloEste} disabled={guardando} className="text-sm px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                  Solo este cobro ({fmtEuros(preguntaQuitar.importe)})
                </button>
                <button onClick={() => setPreguntaQuitar(null)} disabled={guardando} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} disabled={guardando} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {est.pendiente > 0 || est.pagos.length === 0 ? 'Cancelar' : 'Cerrar'}
          </button>
          {(est.pendiente > 0 || est.pagos.length === 0) && (
            <button
              onClick={registrar}
              disabled={!importeValido || guardando}
              className="text-sm px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : esTotal ? 'Marcar como pagado' : 'Registrar cobro'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

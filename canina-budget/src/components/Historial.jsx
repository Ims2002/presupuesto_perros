import { useState, useEffect, useMemo } from 'react'
import { listarPresupuestos, eliminarPresupuesto, mensajeError } from '../lib/presupuestosRepo'
import { createLogger } from '../lib/logger'
import { estadoCobro, etiquetaMetodo, fmtEuros, fmtFecha as fmtFechaCobro } from '../lib/cobros'
import CobroModal from './CobroModal'
import { registrarResumenCobros } from '../lib/pagosRepo'

const log = createLogger('historial')

// Convierte "YYYY-MM-DD" a "DD/MM/YYYY" para mostrar en pantalla
function fmt(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// Clases Tailwind reutilizables para el input de búsqueda
const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400'

// Recibe callbacks desde App.jsx:
//   onEditar(p)    → carga el presupuesto en el formulario para editarlo
//   onVer(p)       → abre la vista de preview/PDF
//   onEliminado(p) → avisa de que se ha borrado (por si estaba abierto en el formulario)
export default function Historial({ onEditar, onVer, onEliminado }) {
  const [presupuestos, setPresupuestos] = useState([]) // todos los registros de la base de datos
  const [loading, setLoading] = useState(true)         // estado de carga inicial
  const [error, setError] = useState(null)             // mensaje de error si falla la consulta
  const [busqueda, setBusqueda] = useState('')         // texto del buscador
  const [filtroCobro, setFiltroCobro] = useState('todos') // 'todos' | 'pendientes' | 'pagados'
  const [cobrando, setCobrando] = useState(null)         // presupuesto con la ventana de cobro abierta

  // --- Eliminación con doble confirmación ---
  const [pendingDelete, setPendingDelete] = useState(null) // presupuesto seleccionado para borrar (o null)
  const [confirmStep, setConfirmStep] = useState(1)        // 1 = primer aviso, 2 = aviso definitivo
  const [deleting, setDeleting] = useState(false)          // true mientras se ejecuta el DELETE
  const [deleteError, setDeleteError] = useState(null)     // mensaje de error si falla el borrado

  const [recarga, setRecarga] = useState(0)                // al incrementarlo se vuelve a cargar la lista

  // Al montar el componente (y al pulsar "Reintentar"), trae todos los
  // presupuestos ordenados del más reciente al más antiguo.
  // "cancelado" evita actualizar el estado si el componente ya se desmontó
  // (cambio rápido de vista o doble montaje de React StrictMode en desarrollo).
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setLoading(true)
      setError(null)
      try {
        const data = await listarPresupuestos()
        if (!cancelado) {
          setPresupuestos(data)
          registrarResumenCobros('historial', data) // pagados / parciales / pendientes y cobros anómalos
        }
      } catch (err) {
        log.error('No se pudo cargar el historial', { error: err })
        if (!cancelado) setError(mensajeError(err))
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [recarga])

  // Números que aparecen más de una vez. Ayuda a localizar duplicados
  // antiguos (creados antes de la corrección) o colisiones entre dispositivos.
  const numerosRepetidos = useMemo(() => {
    const cuenta = {}
    presupuestos.forEach(p => { cuenta[p.numero] = (cuenta[p.numero] || 0) + 1 })
    return new Set(Object.keys(cuenta).filter(n => cuenta[n] > 1))
  }, [presupuestos])

  useEffect(() => {
    if (numerosRepetidos.size > 0) {
      log.warn('Hay números de presupuesto repetidos en el historial', { numeros: [...numerosRepetidos] })
    }
  }, [numerosRepetidos])

  // Abre el popup de confirmación para el presupuesto indicado, siempre
  // empezando por el primer paso (aviso simple).
  function pedirEliminacion(p) {
    log.info('Pedir eliminación', { id: p.id, numero: p.numero })
    setDeleteError(null)
    setConfirmStep(1)
    setPendingDelete(p)
  }

  // Cierra el popup sin borrar nada.
  function cancelarEliminacion() {
    log.info('Eliminación cancelada', { id: pendingDelete?.id, paso: confirmStep })
    setPendingDelete(null)
    setConfirmStep(1)
    setDeleteError(null)
  }

  // Botón "Eliminar" del popup: en el paso 1 solo avanza al paso 2 (aviso
  // definitivo); en el paso 2 ejecuta el borrado real.
  async function confirmarEliminacion() {
    if (deleting) return
    if (confirmStep === 1) {
      setConfirmStep(2)
      return
    }
    const borrado = pendingDelete
    setDeleting(true)
    setDeleteError(null)
    try {
      await eliminarPresupuesto(borrado.id, borrado.numero)
    } catch (err) {
      setDeleteError(mensajeError(err))
      // Si no se borró nada, puede que ya no existiera: se recarga la lista
      if (err.code === 'SIN_FILAS') setRecarga(r => r + 1)
      return
    } finally {
      setDeleting(false)
    }
    setPresupuestos(prev => prev.filter(p => p.id !== borrado.id))
    setPendingDelete(null)
    setConfirmStep(1)
    onEliminado?.(borrado)
  }

  // Tras registrar o quitar un cobro, actualiza ese presupuesto en la lista
  // (sin volver a pedir todo a la base de datos).
  function cobroGuardado(pagos) {
    const id = cobrando.id
    log.debug('Lista del historial actualizada tras cambiar cobros', { id, numero: cobrando.numero, cobros: pagos.length })
    setPresupuestos(prev => prev.map(p => (p.id === id ? { ...p, pagos } : p)))
    setCobrando(null)
  }

  // Filtra en memoria los presupuestos según el texto del buscador y el
  // estado de cobro. Compara contra nombre del cliente, mascota y número.
  const filtrados = presupuestos.filter(p => {
    const s = busqueda.toLowerCase()
    const coincide = (
      (p.cliente?.nombre || '').toLowerCase().includes(s) ||
      (p.mascota || '').toLowerCase().includes(s) ||
      String(p.numero ?? '').includes(s)
    )
    if (!coincide) return false
    if (filtroCobro === 'todos') return true
    const { estado } = estadoCobro(p)
    return filtroCobro === 'pagados' ? estado === 'pagado' : estado !== 'pagado'
  })

  function cambiarFiltroCobro(k) {
    if (k === filtroCobro) return
    log.info('Filtro de cobro', { filtro: k, resultados: conteo[k] })
    setFiltroCobro(k)
  }

  function abrirCobro(p) {
    log.debug('Abrir cobros desde el historial', { id: p.id, numero: p.numero })
    setCobrando(p)
  }

  const conteo = useMemo(() => {
    let pagados = 0
    presupuestos.forEach(p => { if (estadoCobro(p).estado === 'pagado') pagados++ })
    return { todos: presupuestos.length, pagados, pendientes: presupuestos.length - pagados }
  }, [presupuestos])

  return (
    <div className="space-y-4">
      {/* Buscador — filtra la lista sin hacer nuevas llamadas a la base de datos */}
      <input
        className={`${inp} w-full`}
        placeholder="Buscar por cliente, mascota o número..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      {/* Filtro por estado de cobro */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por cobro">
        {[['todos', 'Todos'], ['pendientes', 'Pendientes de cobro'], ['pagados', 'Pagados']].map(([k, t]) => (
          <button
            key={k}
            onClick={() => cambiarFiltroCobro(k)}
            aria-pressed={filtroCobro === k}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filtroCobro === k ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {t}{!loading && !error ? ` (${conteo[k]})` : ''}
          </button>
        ))}
      </div>

      {/* Estados de carga y error */}
      {loading && <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>}
      {error && (
        <div className="text-center py-16 text-red-400 text-sm">
          <div>Error: {error}</div>
          <button
            onClick={() => setRecarga(r => r + 1)}
            className="mt-3 text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Aviso de números repetidos (duplicados antiguos o colisiones) */}
      {!loading && !error && numerosRepetidos.size > 0 && (
        <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          Hay presupuestos con el número repetido ({[...numerosRepetidos].map(n => `#${n}`).join(', ')}).
          Revisa los marcados como «repetido» y elimina los que sobren.
        </div>
      )}

      {/* Lista vacía: mensaje diferente si hay búsqueda activa o si no hay datos aún */}
      {!loading && !error && filtrados.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {busqueda || filtroCobro !== 'todos' ? 'Sin resultados' : 'Aún no hay presupuestos guardados'}
        </div>
      )}

      {/* Lista de tarjetas, una por presupuesto */}
      {!loading && !error && filtrados.map(p => {
        // Usa el total guardado; si no existe (registros antiguos),
        // lo recalcula sumando los subtotales de las líneas
        const total = p.total ?? p.lineas?.reduce((s, l) => s + (l.subtotal ?? 0), 0) ?? 0
        const cobro = estadoCobro(p)

        // Formatea la fecha de creación en español (DD/MM/YYYY)
        // Incluye la hora: ayuda a distinguir presupuestos parecidos o repetidos
        const creado = new Date(p.created_at).toLocaleString('es-ES', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })

        return (
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm">
            {/* En el móvil los botones van debajo; en pantallas anchas, a la derecha */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">

              {/* Columna izquierda: número, nombre, mascota, fechas, dispositivo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-mono font-bold text-amber-600">#{p.numero}</span>
                  {numerosRepetidos.has(p.numero) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold uppercase">repetido</span>
                  )}
                  <span className="text-sm font-semibold text-gray-800">
                    {p.cliente?.nombre || <span className="text-gray-400 font-normal italic">Sin nombre</span>}
                  </span>
                  {p.mascota && <span className="text-xs text-gray-500">— {p.mascota}</span>}
                </div>
                {/* Estado de cobro */}
                <div className="mb-1.5">
                  {cobro.estado === 'pagado' && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                      ✓ Pagado · {cobro.metodos.map(etiquetaMetodo).join(' + ')} · {fmtFechaCobro(cobro.ultimaFecha)}
                    </span>
                  )}
                  {cobro.estado === 'parcial' && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                      Cobrado {fmtEuros(cobro.cobrado)} · faltan {fmtEuros(cobro.pendiente)}
                    </span>
                  )}
                  {cobro.estado === 'pendiente' && (
                    <span className="inline-flex text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Pendiente de cobro</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                  {p.fecha_inicio && <span>Entrada: {fmt(p.fecha_inicio)}</span>}
                  {p.fecha_fin && <span>Salida: {fmt(p.fecha_fin)}</span>}
                  <span>Guardado: {creado}</span>
                  {/* Dispositivo desde el que se creó, en ámbar para destacarlo */}
                  {p.dispositivo && (
                    <span className="text-amber-500 font-medium">{p.dispositivo}</span>
                  )}
                </div>
              </div>

              {/* Columna derecha: total y botones de acción */}
              <div className="shrink-0 flex items-center justify-between gap-3 sm:block sm:text-right">
                <div className="font-bold text-gray-800 text-sm whitespace-nowrap sm:mb-2.5">{total.toFixed(0)} EUR</div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {/* Registrar / ver cobros */}
                  <button
                    onClick={() => abrirCobro(p)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${cobro.estado === 'pagado' ? 'border border-green-200 text-green-700 hover:bg-green-50' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                  >
                    {cobro.estado === 'pagado' ? 'Cobros' : cobro.estado === 'parcial' ? 'Cobrar resto' : 'Cobrar'}
                  </button>
                  {/* Llama a onEditar con el registro completo;
                      App.jsx lo mapea al formato del formulario */}
                  <button
                    onClick={() => onEditar(p)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Editar
                  </button>
                  {/* Llama a onVer para abrir la vista de preview sin pasar por el formulario */}
                  <button
                    onClick={() => onVer(p)}
                    className="text-xs px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg font-medium transition-colors"
                  >
                    Ver PDF
                  </button>
                  {/* Abre el popup de doble confirmación antes de borrar nada */}
                  <button
                    onClick={() => pedirEliminacion(p)}
                    className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      })}

      {cobrando && (
        <CobroModal presupuesto={cobrando} onClose={() => setCobrando(null)} onGuardado={cobroGuardado} />
      )}

      {/* Popup de doble confirmación antes de eliminar un presupuesto del historial */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {confirmStep === 1 ? (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-2">¿Eliminar presupuesto?</h3>
                <p className="text-sm text-gray-500 mb-6">
                  Vas a eliminar el presupuesto <span className="font-mono font-semibold">#{pendingDelete.numero}</span>
                  {pendingDelete.cliente?.nombre ? <> de <span className="font-medium">{pendingDelete.cliente.nombre}</span></> : null}.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-red-600 mb-2">Esta acción no se puede deshacer</h3>
                <p className="text-sm text-gray-500 mb-6">
                  El presupuesto <span className="font-mono font-semibold">#{pendingDelete.numero}</span> se borrará
                  definitivamente del historial. Confirma para eliminarlo.
                </p>
              </>
            )}

            {deleteError && (
              <p className="text-xs text-red-500 mb-4">Error al eliminar: {deleteError}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelarEliminacion}
                disabled={deleting}
                className="text-xs px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminacion}
                disabled={deleting}
                className="text-xs px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : confirmStep === 1 ? 'Continuar' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

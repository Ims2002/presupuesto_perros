import { useState, useEffect, useRef } from 'react'
import { getTarifas } from './data/tarifas'
import PresupuestoForm from './components/PresupuestoForm'
import PresupuestoPreview from './components/PresupuestoPreview'
import TarifasEditor from './components/TarifasEditor'
import Historial from './components/Historial'
import LogViewer from './components/LogViewer'
import { createLogger, setLogContext } from './lib/logger'
import {
  obtenerMaxNumero,
  crearPresupuesto,
  actualizarPresupuesto,
  camposDesdeFormulario,
  nuevoIdBorrador,
  mensajeError,
  resumenParaLog,
} from './lib/presupuestosRepo'
import './index.css'

const log = createLogger('app')

/**
 * Lee el último número de presupuesto generado desde localStorage.
 * Se usa como estado inicial para no perder el contador al recargar.
 * El máximo remoto puede sobreescribirlo si hay valores más altos.
 */
function getUltimoNumero() {
  try {
    return Number(localStorage.getItem('ultimo_presupuesto') ?? 0) || 0
  } catch {
    return 0
  }
}

/**
 * Lee el nombre del dispositivo guardado en localStorage.
 * Se pide al usuario la primera vez que abre la app y se persiste aquí.
 * Permite identificar desde qué dispositivo se creó cada presupuesto.
 */
function getDispositivo() {
  try {
    return localStorage.getItem('dispositivo_nombre') || ''
  } catch {
    return ''
  }
}

/**
 * Componente raíz de la aplicación. Gestiona:
 *   - La navegación entre las tres vistas: 'form' | 'preview' | 'historial'
 *   - El estado global del presupuesto activo y el modo de edición
 *   - El guardado (crear / actualizar) a través de lib/presupuestosRepo
 *   - La identificación del dispositivo local
 *   - El visor del registro de actividad (logs)
 */
export default function App() {
  const [tarifas, setTarifas] = useState(getTarifas)       // tarifas editables (estancia + servicios)
  const [vista, setVista] = useState('form')                // vista activa: 'form' | 'preview' | 'historial'
  const [presupuesto, setPresupuesto] = useState(null)      // datos del presupuesto en preview
  const [showEditor, setShowEditor] = useState(false)       // controla si el editor de tarifas está abierto
  const [showLogs, setShowLogs] = useState(false)           // visor del registro de actividad
  const [ultimoNumero, setUltimoNumero] = useState(getUltimoNumero) // último número usado (para mostrar el siguiente)

  // --- Modo edición ---
  const [editData, setEditData] = useState(null)   // datos pre-cargados en el formulario al editar
  const [editId, setEditId] = useState(null)       // id del registro que se está editando (null = nuevo)

  // Id del borrador "nuevo" que hay en el formulario. Se envía como id del
  // INSERT: si el mismo borrador llegara a enviarse dos veces, la base de datos
  // rechaza el segundo por clave repetida y no se crea un duplicado.
  // Se renueva al pulsar "+ Nuevo".
  const [borradorId, setBorradorId] = useState(nuevoIdBorrador)

  // --- Estado del guardado ---
  // guardandoRef bloquea envíos simultáneos de forma síncrona (un doble toque
  // llega antes de que React vuelva a pintar con guardando=true).
  const guardandoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState(null)   // { mensaje, datos } si falló el guardado
  const [avisoPreview, setAvisoPreview] = useState(null)     // { tipo: 'ok' | 'error', texto }
  const [origenPreview, setOrigenPreview] = useState('form') // a dónde vuelve "Volver" desde el preview

  // Se usa como "key" de PresupuestoForm para forzar un montaje nuevo (formulario
  // en blanco) solo cuando el usuario pulsa "+ Nuevo". Si nos limitáramos a poner
  // editData a null, y ya estaba a null (caso de un presupuesto nuevo, no de edición),
  // React no detectaría cambio y el formulario conservaría lo que había escrito.
  const [formKey, setFormKey] = useState(0)

  // --- Dispositivo ---
  const [dispositivo, setDispositivo] = useState(getDispositivo)
  // Si no hay nombre de dispositivo guardado, muestra el modal al arrancar
  const [showDispositivoModal, setShowDispositivoModal] = useState(!getDispositivo())
  const [dispositivoInput, setDispositivoInput] = useState('')

  // Contexto que se adjunta a cada entrada del log
  useEffect(() => { setLogContext({ dispositivo: dispositivo || '(sin nombre)' }) }, [dispositivo])
  useEffect(() => {
    setLogContext({ vista })
    log.info('Navegación', { vista })
    // Al cambiar de vista se sube al principio, para que se vea el aviso de
    // "Guardado" / "Editando" (antes se conservaba el scroll del formulario).
    try { window.scrollTo(0, 0) } catch { /* entorno sin scroll */ }
  }, [vista])

  // Atajo de teclado para abrir el registro: Ctrl+Shift+L
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        setShowLogs(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Guarda en localStorage y en estado el número más alto conocido. */
  function registrarNumero(n) {
    const max = Math.max(Number(n) || 0, getUltimoNumero())
    try { localStorage.setItem('ultimo_presupuesto', String(max)) } catch { /* sin almacenamiento */ }
    setUltimoNumero(max)
  }

  /**
   * Al montar la app, consulta el número más alto guardado en remoto y lo
   * compara con el de localStorage. Gana el mayor de los dos. Solo sirve para
   * mostrar el número previsto: el número definitivo se calcula de nuevo en el
   * momento de guardar (ver crearPresupuesto en lib/presupuestosRepo.js).
   */
  useEffect(() => {
    let cancelado = false
    async function syncNumero() {
      try {
        const maxRemoto = await obtenerMaxNumero()
        if (cancelado) return
        const maxLocal = getUltimoNumero()
        log.info('Contador sincronizado', { maxRemoto, maxLocal })
        registrarNumero(Math.max(maxRemoto, maxLocal))
      } catch (err) {
        log.warn('No se pudo sincronizar el contador con la base de datos; se usa el local', { error: err })
      }
    }
    syncNumero()
    return () => { cancelado = true }
  }, [])

  /**
   * Recibe los datos del formulario al pulsar "Ver presupuesto" / "Guardar cambios".
   *
   * - Si hay editId: actualiza ese registro (UPDATE).
   * - Si no: crea uno nuevo (INSERT) con el id del borrador y, en cuanto se
   *   confirma, el formulario pasa a MODO EDICIÓN de ese registro. Así, si el
   *   usuario vuelve al formulario desde el preview y pulsa otra vez el botón,
   *   se actualiza el mismo presupuesto en lugar de crear otro (era la causa
   *   principal de los duplicados en el historial).
   *
   * Si el guardado falla, se queda en el formulario con un aviso y la opción
   * de ver el presupuesto sin guardarlo (para poder sacar el PDF igualmente).
   */
  async function handleGenerar(datos) {
    if (guardandoRef.current) {
      log.warn('Envío ignorado: ya hay un guardado en curso (doble toque)', { editId })
      return
    }
    guardandoRef.current = true
    setGuardando(true)
    setErrorGuardado(null)

    const campos = camposDesdeFormulario(datos)
    const modo = editId ? 'editar' : 'crear'
    log.info(`Guardar presupuesto (${modo})`, {
      editId,
      borradorId: editId ? undefined : borradorId,
      ...resumenParaLog({ ...campos, numero: datos.numero }),
    })

    try {
      let guardado
      if (editId) {
        // UPDATE: conserva el número original y el dispositivo que lo creó
        await actualizarPresupuesto(editId, campos)
        guardado = datos
        setAvisoPreview({ tipo: 'ok', texto: `Cambios guardados en el presupuesto #${datos.numero}` })
      } else {
        const { row, yaExistia } = await crearPresupuesto({
          id: borradorId,
          campos: { ...campos, dispositivo: getDispositivo() },
          numeroMinimo: getUltimoNumero(),
        })
        // Si el borrador ya existía (reintento), se actualiza con los datos actuales
        if (yaExistia) await actualizarPresupuesto(row.id, campos)
        if (row.numero !== datos.numero) {
          log.info('Número asignado distinto del previsto (otro dispositivo guardó antes)', { previsto: datos.numero, asignado: row.numero })
        }
        guardado = { ...datos, numero: row.numero }
        registrarNumero(row.numero)
        setEditId(row.id)
        setEditData(guardado)
        setAvisoPreview({ tipo: 'ok', texto: `Guardado en el historial como #${row.numero}` })
        log.info('Formulario en modo edición del presupuesto recién creado', { id: row.id, numero: row.numero })
      }
      setPresupuesto(guardado)
      setOrigenPreview('form')
      setVista('preview')
    } catch (err) {
      log.error(`No se pudo guardar el presupuesto (${modo})`, { editId, borradorId, error: err })
      setErrorGuardado({ mensaje: mensajeError(err), datos })
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  /** Tras un fallo de guardado: muestra el presupuesto igualmente (sin guardar). */
  function verSinGuardar() {
    if (!errorGuardado) return
    log.warn('Se muestra el presupuesto SIN guardarlo en el historial', { numero: errorGuardado.datos.numero })
    setPresupuesto(errorGuardado.datos)
    setAvisoPreview({ tipo: 'error', texto: 'Este presupuesto NO se ha guardado en el historial.' })
    setOrigenPreview('form')
    setVista('preview')
  }

  /**
   * Llamado desde Historial cuando el usuario pulsa "Editar".
   * Mapea el formato de la base de datos (snake_case, columnas separadas)
   * al formato que espera PresupuestoForm (camelCase, objeto plano).
   * Guarda el id del registro para que handleGenerar sepa que es un UPDATE.
   */
  function handleEditarDesdeHistorial(p) {
    log.info('Editar desde historial', { id: p.id, numero: p.numero })
    setEditData({
      cliente: p.cliente || { nombre: '' },
      mascota: p.mascota || '',
      fechaInicio: p.fecha_inicio || '',
      fechaFin: p.fecha_fin || '',
      lineas: p.lineas || [],
      notas: p.notas || '',
      numero: p.numero,
    })
    setEditId(p.id)
    setErrorGuardado(null)
    setVista('form')
  }

  /**
   * Llamado desde Historial cuando el usuario pulsa "Ver PDF".
   * Construye el objeto de presupuesto que espera PresupuestoPreview
   * directamente desde el registro, sin pasar por el formulario.
   * "Volver" regresará al historial (no al formulario, que puede contener
   * otro presupuesto distinto).
   */
  function handleVerDesdeHistorial(p) {
    log.info('Ver PDF desde historial', { id: p.id, numero: p.numero })
    setPresupuesto({
      cliente: p.cliente || {},
      mascota: p.mascota || '',
      fechaInicio: p.fecha_inicio || '',
      fechaFin: p.fecha_fin || '',
      lineas: p.lineas || [],
      notas: p.notas || '',
      numero: p.numero,
    })
    setAvisoPreview(null)
    setOrigenPreview('historial')
    setVista('preview')
  }

  /** Vacía el formulario y lo deja listo para un presupuesto nuevo. */
  function reiniciarFormulario() {
    setEditData(null)
    setEditId(null)
    setBorradorId(nuevoIdBorrador())
    setErrorGuardado(null)
    setFormKey(k => k + 1) // fuerza remontar el formulario en blanco, aunque ya estuviera en null
  }

  /**
   * Resetea el estado de edición y navega al formulario vacío.
   * Se usa en el botón "+ Nuevo" de la cabecera.
   */
  function handleNuevo() {
    log.info('Nuevo presupuesto', { editIdAnterior: editId })
    reiniciarFormulario()
    setVista('form')
  }

  /**
   * Llamado desde Historial tras borrar un presupuesto. Si era el que estaba
   * abierto en el formulario, se reinicia el formulario para no intentar
   * actualizar un registro que ya no existe.
   */
  function handleEliminado(p) {
    if (p.id === editId) {
      log.warn('Se ha eliminado el presupuesto abierto en el formulario; se reinicia el formulario', { id: p.id, numero: p.numero })
      reiniciarFormulario()
    }
  }

  /**
   * Guarda el nombre del dispositivo en localStorage y cierra el modal.
   * Si el campo está vacío usa "Dispositivo" como valor por defecto.
   */
  function guardarDispositivo() {
    const nombre = dispositivoInput.trim() || 'Dispositivo'
    try { localStorage.setItem('dispositivo_nombre', nombre) } catch { /* sin almacenamiento */ }
    log.info('Dispositivo configurado', { nombre })
    setDispositivo(nombre)
    setShowDispositivoModal(false)
  }

  // --- Estilos de botones de la cabecera ---
  const headerBtn = {
    fontSize: 13, padding: '6px 14px', borderRadius: 8,
    border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#6b7280'
  }
  // Estado activo del botón Historial (fondo oscuro cuando la vista está activa)
  const headerBtnActive = {
    ...headerBtn, background: '#1f2937', color: 'white', borderColor: '#1f2937'
  }
  const tarifasBtn = {
    fontSize: 13, padding: '6px 14px', borderRadius: 8,
    border: '1px solid #fde68a', background: '#fffbeb', cursor: 'pointer', color: '#d97706', fontWeight: 500
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f7' }}>

      {/* Modal de nombre de dispositivo — solo se muestra la primera vez */}
      {showDispositivoModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2937', marginBottom: 8 }}>
              ¿Desde qué dispositivo usas esto?
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              Ayuda a identificar desde dónde se creó cada presupuesto.
            </div>
            <input
              autoFocus
              style={{
                width: '100%', border: '1px solid #e5e7eb', borderRadius: 8,
                padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box'
              }}
              placeholder="Ej: Móvil Nuria, Tablet recepción..."
              value={dispositivoInput}
              onChange={e => setDispositivoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && guardarDispositivo()}
            />
            <button
              onClick={guardarDispositivo}
              style={{
                marginTop: 16, width: '100%', padding: '10px 0',
                background: '#f59e0b', color: 'white', border: 'none',
                borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14
              }}
            >
              Guardar y continuar
            </button>
          </div>
        </div>
      )}

      {/* Cabecera sticky — se oculta al imprimir con la clase no-print */}
      <header className="no-print" style={{
        background: 'white', borderBottom: '1px solid #f3f4f6',
        position: 'sticky', top: 0, zIndex: 40
      }}>
        <div style={{
          maxWidth: 720, margin: '0 auto', padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16 }}>Pet Hotel</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Benitachell - Dog Daycare</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* "+ Nuevo" solo aparece cuando no estás ya en el formulario */}
            {(vista === 'preview' || vista === 'historial') && (
              <button style={headerBtn} onClick={handleNuevo}>+ Nuevo</button>
            )}
            {/* Botón Historial actúa como toggle: abre y cierra la vista */}
            <button
              style={vista === 'historial' ? headerBtnActive : headerBtn}
              onClick={() => setVista(v => v === 'historial' ? 'form' : 'historial')}
            >
              Historial
            </button>
            <button style={tarifasBtn} onClick={() => setShowEditor(true)}>Editar tarifas</button>
          </div>
        </div>
      </header>

      {/* Área de contenido principal — renderiza la vista activa */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {/*
          El formulario se mantiene siempre montado (solo se oculta con CSS) en lugar
          de desmontarse al cambiar de vista. Si se desmontara, al volver desde el
          preview perdería todo su estado interno (líneas añadidas, fechas, etc.),
          ya que se crearía una instancia completamente nueva del componente.
        */}
        <div style={{ display: vista === 'form' ? 'block' : 'none' }}>
          {/* Aviso de fallo de guardado: el presupuesto NO está en el historial */}
          {errorGuardado && (
            <div role="alert" style={{
              marginBottom: 16, padding: '12px 16px', borderRadius: 12,
              background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No se ha podido guardar el presupuesto</div>
              <div style={{ marginBottom: 10 }}>{errorGuardado.mensaje}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={verSinGuardar} style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #fecaca', background: 'white', color: '#b91c1c'
                }}>
                  Ver presupuesto sin guardar
                </button>
                <button type="button" onClick={() => setShowLogs(true)} style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: 'none', background: 'none', color: '#b91c1c', textDecoration: 'underline'
                }}>
                  Ver registro
                </button>
              </div>
            </div>
          )}
          <PresupuestoForm
            key={formKey}         // cambia solo al pulsar "+ Nuevo": fuerza formulario en blanco
            tarifas={tarifas}
            onGenerar={handleGenerar}
            ultimoNumero={ultimoNumero}
            initialData={editData}   // null = nuevo, objeto = edición
            isEditing={!!editId}     // true cuando hay un id de edición activo
            guardando={guardando}    // deshabilita el botón mientras se guarda
          />
        </div>
        {vista === 'preview' && presupuesto && (
          <>
            {avisoPreview && (
              <div className="no-print" role="status" style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                ...(avisoPreview.tipo === 'ok'
                  ? { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }
                  : { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' })
              }}>
                {avisoPreview.tipo === 'ok' ? '✓ ' : '⚠ '}{avisoPreview.texto}
              </div>
            )}
            <PresupuestoPreview
              presupuesto={presupuesto}
              onBack={() => setVista(origenPreview)}
              backLabel={origenPreview === 'historial' ? 'Volver al historial' : 'Volver al formulario'}
            />
          </>
        )}
        {vista === 'historial' && (
          <Historial
            onEditar={handleEditarDesdeHistorial}
            onVer={handleVerDesdeHistorial}
            onEliminado={handleEliminado}
          />
        )}
      </main>

      {/* Modal del editor de tarifas — se monta solo cuando está abierto */}
      {showEditor && (
        <TarifasEditor tarifas={tarifas} onUpdate={setTarifas} onClose={() => setShowEditor(false)} />
      )}

      {/* Pie discreto con acceso al registro de actividad (también Ctrl+Shift+L) */}
      <footer className="no-print" style={{ textAlign: 'center', padding: '8px 16px 24px' }}>
        <button
          onClick={() => setShowLogs(true)}
          style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Registro de actividad
        </button>
      </footer>

      {showLogs && <LogViewer onClose={() => setShowLogs(false)} />}
    </div>
  )
}

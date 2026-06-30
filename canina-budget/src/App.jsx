import { useState, useEffect } from 'react'
import { getTarifas } from './data/tarifas'
import PresupuestoForm from './components/PresupuestoForm'
import PresupuestoPreview from './components/PresupuestoPreview'
import TarifasEditor from './components/TarifasEditor'
import Historial from './components/Historial'
import { supabase } from './lib/supabase'
import './index.css'

/**
 * Lee el último número de presupuesto generado desde localStorage.
 * Se usa como estado inicial para no perder el contador al recargar.
 * Supabase puede sobreescribirlo en el useEffect si hay valores más altos en remoto.
 */
function getUltimoNumero() {
  return Number(localStorage.getItem('ultimo_presupuesto') ?? 0)
}

/**
 * Lee el nombre del dispositivo guardado en localStorage.
 * Se pide al usuario la primera vez que abre la app y se persiste aquí.
 * Permite identificar desde qué dispositivo se creó cada presupuesto.
 */
function getDispositivo() {
  return localStorage.getItem('dispositivo_nombre') || ''
}

/**
 * Componente raíz de la aplicación. Gestiona:
 *   - La navegación entre las tres vistas: 'form' | 'preview' | 'historial'
 *   - El estado global del presupuesto activo y el modo de edición
 *   - La sincronización del contador de números con Supabase
 *   - La identificación del dispositivo local
 */
export default function App() {
  const [tarifas, setTarifas] = useState(getTarifas)       // tarifas editables (estancia + servicios)
  const [vista, setVista] = useState('form')                // vista activa: 'form' | 'preview' | 'historial'
  const [presupuesto, setPresupuesto] = useState(null)      // datos del presupuesto en preview
  const [showEditor, setShowEditor] = useState(false)       // controla si el editor de tarifas está abierto
  const [ultimoNumero, setUltimoNumero] = useState(getUltimoNumero) // último número usado (para incrementar)

  // --- Modo edición ---
  const [editData, setEditData] = useState(null)   // datos pre-cargados en el formulario al editar
  const [editId, setEditId] = useState(null)       // UUID del registro de Supabase que se está editando

  // --- Dispositivo ---
  const [dispositivo, setDispositivo] = useState(getDispositivo)
  // Si no hay nombre de dispositivo guardado, muestra el modal al arrancar
  const [showDispositivoModal, setShowDispositivoModal] = useState(!getDispositivo())
  const [dispositivoInput, setDispositivoInput] = useState('')

  /**
   * Al montar la app, consulta el número más alto guardado en Supabase
   * y lo compara con el de localStorage. Gana el mayor de los dos.
   * Esto garantiza que dos dispositivos diferentes no repitan números
   * aunque hayan estado desconectados entre sí.
   */
  useEffect(() => {
    async function syncNumero() {
      const { data } = await supabase
        .from('presupuestos')
        .select('numero')
        .order('numero', { ascending: false })
        .limit(1)
      if (data && data.length > 0) {
        const maxRemoto = Number(data[0].numero) || 0
        const maxLocal = getUltimoNumero()
        const max = Math.max(maxRemoto, maxLocal)
        localStorage.setItem('ultimo_presupuesto', String(max))
        setUltimoNumero(max)
      }
    }
    syncNumero()
  }, [])

  /**
   * Recibe los datos del formulario al pulsar "Ver presupuesto" / "Guardar cambios".
   *
   * - Si hay editId activo: actualiza el registro existente en Supabase (UPDATE).
   * - Si no hay editId: crea un registro nuevo (INSERT) e incrementa el contador.
   *
   * En ambos casos muestra la vista de preview y limpia el estado de edición.
   */
  async function handleGenerar(datos) {
    const disp = getDispositivo()
    const totalCalc = datos.lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)

    if (editId) {
      // UPDATE: conserva el número original y el dispositivo que lo creó
      await supabase
        .from('presupuestos')
        .update({
          cliente: datos.cliente,
          mascota: datos.mascota,
          fecha_inicio: datos.fechaInicio || null,
          fecha_fin: datos.fechaFin || null,
          lineas: datos.lineas,
          notas: datos.notas,
          total: totalCalc,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editId)
    } else {
      // INSERT: incrementa el contador y guarda el dispositivo de origen
      const nuevo = ultimoNumero + 1
      localStorage.setItem('ultimo_presupuesto', String(nuevo))
      setUltimoNumero(nuevo)
      await supabase.from('presupuestos').insert({
        numero: datos.numero,
        cliente: datos.cliente,
        mascota: datos.mascota,
        fecha_inicio: datos.fechaInicio || null,
        fecha_fin: datos.fechaFin || null,
        lineas: datos.lineas,
        notas: datos.notas,
        total: totalCalc,
        dispositivo: disp,
      })
    }

    setPresupuesto(datos)
    setVista('preview')
    setEditData(null)
    setEditId(null)
  }

  /**
   * Llamado desde Historial cuando el usuario pulsa "Editar".
   * Mapea el formato de Supabase (snake_case, columnas separadas)
   * al formato que espera PresupuestoForm (camelCase, objeto plano).
   * Guarda el UUID del registro para que handleGenerar sepa que es un UPDATE.
   */
  function handleEditarDesdeHistorial(p) {
    setEditData({
      cliente: p.cliente || { nombre: '' },
      mascota: p.mascota || '',
      fechaInicio: p.fecha_inicio || '',   // Supabase devuelve snake_case
      fechaFin: p.fecha_fin || '',
      lineas: p.lineas || [],
      notas: p.notas || '',
      numero: p.numero,
    })
    setEditId(p.id)
    setVista('form')
  }

  /**
   * Llamado desde Historial cuando el usuario pulsa "Ver PDF".
   * Construye el objeto de presupuesto que espera PresupuestoPreview
   * directamente desde el registro de Supabase, sin pasar por el formulario.
   */
  function handleVerDesdeHistorial(p) {
    setPresupuesto({
      cliente: p.cliente || {},
      mascota: p.mascota || '',
      fechaInicio: p.fecha_inicio || '',
      fechaFin: p.fecha_fin || '',
      lineas: p.lineas || [],
      notas: p.notas || '',
      numero: p.numero,
    })
    setVista('preview')
  }

  /**
   * Resetea el estado de edición y navega al formulario vacío.
   * Se usa en el botón "+ Nuevo" de la cabecera.
   */
  function handleNuevo() {
    setEditData(null)
    setEditId(null)
    setVista('form')
  }

  /**
   * Guarda el nombre del dispositivo en localStorage y cierra el modal.
   * Si el campo está vacío usa "Dispositivo" como valor por defecto.
   */
  function guardarDispositivo() {
    const nombre = dispositivoInput.trim() || 'Dispositivo'
    localStorage.setItem('dispositivo_nombre', nombre)
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
        {vista === 'form' && (
          <PresupuestoForm
            tarifas={tarifas}
            onGenerar={handleGenerar}
            ultimoNumero={ultimoNumero}
            initialData={editData}   // null = nuevo, objeto = edición
            isEditing={!!editId}     // true cuando hay un UUID de edición activo
          />
        )}
        {vista === 'preview' && presupuesto && (
          <PresupuestoPreview presupuesto={presupuesto} onBack={() => setVista('form')} />
        )}
        {vista === 'historial' && (
          <Historial
            onEditar={handleEditarDesdeHistorial}
            onVer={handleVerDesdeHistorial}
          />
        )}
      </main>

      {/* Modal del editor de tarifas — se monta solo cuando está abierto */}
      {showEditor && (
        <TarifasEditor tarifas={tarifas} onUpdate={setTarifas} onClose={() => setShowEditor(false)} />
      )}
    </div>
  )
}

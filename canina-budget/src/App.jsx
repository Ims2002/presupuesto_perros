import { useState, useEffect } from 'react'
import { getTarifas } from './data/tarifas'
import PresupuestoForm from './components/PresupuestoForm'
import PresupuestoPreview from './components/PresupuestoPreview'
import TarifasEditor from './components/TarifasEditor'
import Historial from './components/Historial'
import { supabase } from './lib/supabase'
import './index.css'

function getUltimoNumero() {
  return Number(localStorage.getItem('ultimo_presupuesto') ?? 0)
}

function getDispositivo() {
  return localStorage.getItem('dispositivo_nombre') || ''
}

export default function App() {
  const [tarifas, setTarifas] = useState(getTarifas)
  const [vista, setVista] = useState('form')
  const [presupuesto, setPresupuesto] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [ultimoNumero, setUltimoNumero] = useState(getUltimoNumero)

  // Edicion
  const [editData, setEditData] = useState(null)
  const [editId, setEditId] = useState(null)

  // Dispositivo
  const [dispositivo, setDispositivo] = useState(getDispositivo)
  const [showDispositivoModal, setShowDispositivoModal] = useState(!getDispositivo())
  const [dispositivoInput, setDispositivoInput] = useState('')

  // Sincronizar ultimo numero con Supabase al arrancar
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

  async function handleGenerar(datos) {
    const disp = getDispositivo()
    const totalCalc = datos.lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)

    if (editId) {
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

  function handleEditarDesdeHistorial(p) {
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
    setVista('form')
  }

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

  function handleNuevo() {
    setEditData(null)
    setEditId(null)
    setVista('form')
  }

  function guardarDispositivo() {
    const nombre = dispositivoInput.trim() || 'Dispositivo'
    localStorage.setItem('dispositivo_nombre', nombre)
    setDispositivo(nombre)
    setShowDispositivoModal(false)
  }

  const headerBtn = {
    fontSize: 13, padding: '6px 14px', borderRadius: 8,
    border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#6b7280'
  }
  const headerBtnActive = {
    ...headerBtn, background: '#1f2937', color: 'white', borderColor: '#1f2937'
  }
  const tarifasBtn = {
    fontSize: 13, padding: '6px 14px', borderRadius: 8,
    border: '1px solid #fde68a', background: '#fffbeb', cursor: 'pointer', color: '#d97706', fontWeight: 500
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f7' }}>

      {/* Modal nombre de dispositivo */}
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
            {(vista === 'preview' || vista === 'historial') && (
              <button style={headerBtn} onClick={handleNuevo}>+ Nuevo</button>
            )}
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

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {vista === 'form' && (
          <PresupuestoForm
            tarifas={tarifas}
            onGenerar={handleGenerar}
            ultimoNumero={ultimoNumero}
            initialData={editData}
            isEditing={!!editId}
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

      {showEditor && (
        <TarifasEditor tarifas={tarifas} onUpdate={setTarifas} onClose={() => setShowEditor(false)} />
      )}
    </div>
  )
}

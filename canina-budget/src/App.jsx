import { useState } from 'react'
import { getTarifas } from './data/tarifas'
import PresupuestoForm from './components/PresupuestoForm'
import PresupuestoPreview from './components/PresupuestoPreview'
import TarifasEditor from './components/TarifasEditor'
import './index.css'

function getUltimoNumero() {
  return Number(localStorage.getItem('ultimo_presupuesto') ?? 0)
}

export default function App() {
  const [tarifas, setTarifas] = useState(getTarifas)
  const [vista, setVista] = useState('form')
  const [presupuesto, setPresupuesto] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [ultimoNumero, setUltimoNumero] = useState(getUltimoNumero)

  function handleGenerar(datos) {
    const nuevo = ultimoNumero + 1
    localStorage.setItem('ultimo_presupuesto', String(nuevo))
    setUltimoNumero(nuevo)
    setPresupuesto(datos)
    setVista('preview')
  }

  const headerBtn = { fontSize: 13, padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#6b7280' }
  const tarifasBtn = { fontSize: 13, padding: '6px 14px', borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb', cursor: 'pointer', color: '#d97706', fontWeight: 500 }

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f7' }}>
      <header className="no-print" style={{ background: 'white', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16 }}>Pet Hotel</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Benitachell - Dog Daycare</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {vista === 'preview' && (
              <button style={headerBtn} onClick={() => setVista('form')}>+ Nuevo</button>
            )}
            <button style={tarifasBtn} onClick={() => setShowEditor(true)}>Editar tarifas</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: vista === 'form' ? 'block' : 'none' }}>
          <PresupuestoForm tarifas={tarifas} onGenerar={handleGenerar} ultimoNumero={ultimoNumero} />
        </div>
        {vista === 'preview' && presupuesto && (
          <PresupuestoPreview presupuesto={presupuesto} onBack={() => setVista('form')} />
        )}
      </main>

      {showEditor && (
        <TarifasEditor tarifas={tarifas} onUpdate={setTarifas} onClose={() => setShowEditor(false)} />
      )}
    </div>
  )
}

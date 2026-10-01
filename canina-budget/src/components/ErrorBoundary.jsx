import { Component } from 'react'
import { createLogger, downloadLogs } from '../lib/logger'

const log = createLogger('react')

/**
 * Captura los errores de renderizado de React (que de otro modo dejan la
 * pantalla en blanco), los registra en el log con el árbol de componentes
 * donde ocurrieron y muestra una pantalla de recuperación con opción de
 * descargar el registro.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    log.error('Error de renderizado', { error, componentStack: info?.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#faf9f7', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2937', marginBottom: 8 }}>Algo ha fallado</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
            La aplicación ha encontrado un error inesperado. Los presupuestos guardados no se han perdido.
          </div>
          <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 20, wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ flex: 1, padding: '10px 0', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
            >
              Recargar
            </button>
            <button
              onClick={downloadLogs}
              style={{ flex: 1, padding: '10px 0', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}
            >
              Descargar registro
            </button>
          </div>
        </div>
      </div>
    )
  }
}

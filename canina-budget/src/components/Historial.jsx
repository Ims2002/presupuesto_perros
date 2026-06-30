import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function fmt(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400'

export default function Historial({ onEditar, onVer }) {
  const [presupuestos, setPresupuestos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) setError(error.message)
      else setPresupuestos(data)
      setLoading(false)
    }
    fetch()
  }, [])

  const filtrados = presupuestos.filter(p => {
    const s = busqueda.toLowerCase()
    return (
      (p.cliente?.nombre || '').toLowerCase().includes(s) ||
      (p.mascota || '').toLowerCase().includes(s) ||
      p.numero.includes(s)
    )
  })

  return (
    <div className="space-y-4">
      <input
        className={`${inp} w-full`}
        placeholder="Buscar por cliente, mascota o número..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      {loading && <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>}
      {error && <div className="text-center py-16 text-red-400 text-sm">Error: {error}</div>}

      {!loading && !error && filtrados.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {busqueda ? 'Sin resultados' : 'Aún no hay presupuestos guardados'}
        </div>
      )}

      {!loading && !error && filtrados.map(p => {
        const total = p.total ?? p.lineas?.reduce((s, l) => s + (l.subtotal ?? 0), 0) ?? 0
        const creado = new Date(p.created_at).toLocaleDateString('es-ES', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        })

        return (
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-mono font-bold text-amber-600">#{p.numero}</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {p.cliente?.nombre || <span className="text-gray-400 font-normal italic">Sin nombre</span>}
                  </span>
                  {p.mascota && <span className="text-xs text-gray-500">— {p.mascota}</span>}
                </div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                  {p.fecha_inicio && <span>Entrada: {fmt(p.fecha_inicio)}</span>}
                  {p.fecha_fin && <span>Salida: {fmt(p.fecha_fin)}</span>}
                  <span>Guardado: {creado}</span>
                  {p.dispositivo && (
                    <span className="text-amber-500 font-medium">{p.dispositivo}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-gray-800 text-sm mb-2.5">{total.toFixed(0)} EUR</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEditar(p)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onVer(p)}
                    className="text-xs px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg font-medium transition-colors"
                  >
                    Ver PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

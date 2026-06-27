import { useState } from 'react'
import { saveTarifas, tarifasDefault } from '../data/tarifas'

export default function TarifasEditor({ tarifas, onUpdate, onClose }) {
  const [local, setLocal] = useState(JSON.parse(JSON.stringify(tarifas)))
  const [saved, setSaved] = useState(false)

  function updateEstancia(i, field, val) {
    const copy = JSON.parse(JSON.stringify(local))
    copy.estancia[i][field] = val === '' ? '' : Number(val)
    setLocal(copy)
  }

  function updateServicio(i, field, val) {
    const copy = JSON.parse(JSON.stringify(local))
    if (val === 'null' || val === '') copy.servicios[i][field] = null
    else copy.servicios[i][field] = Number(val)
    setLocal(copy)
  }

  function handleSave() {
    saveTarifas(local)
    onUpdate(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    if (confirm('¿Restablecer tarifas por defecto?')) {
      setLocal(JSON.parse(JSON.stringify(tarifasDefault)))
    }
  }

  const estiloInput =
    'w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-amber-500'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center rounded-t-2xl">
          <h2 className="text-xl font-semibold text-gray-800">✏️ Editar Tarifas</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-8">
          {/* Tabla Estancia */}
          <section>
            <h3 className="font-semibold text-gray-700 mb-3">Estancia / Guardería</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-amber-50">
                    <th className="text-left px-3 py-2 border border-gray-200">Mascotas</th>
                    <th className="px-3 py-2 border border-gray-200">Día entre semana</th>
                    <th className="px-3 py-2 border border-gray-200">Día+Noche entresemana</th>
                    <th className="px-3 py-2 border border-gray-200">Día fin de semana</th>
                    <th className="px-3 py-2 border border-gray-200">Día+Noche fin semana</th>
                    <th className="px-3 py-2 border border-gray-200">Tarde+Noche</th>
                  </tr>
                </thead>
                <tbody>
                  {local.estancia.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700">{row.label}</td>
                      {['diaEntresemana', 'diaNocheEntresemana', 'diaFinSemana', 'diaNocheFinSemana', 'tardeNoche'].map(field => (
                        <td key={field} className="px-3 py-2 border border-gray-200 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              className={estiloInput}
                              value={row[field]}
                              onChange={e => updateEstancia(i, field, e.target.value)}
                            />
                            <span className="text-gray-400 text-xs">€</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tabla Servicios */}
          <section>
            <h3 className="font-semibold text-gray-700 mb-3">Servicios Adicionales</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-amber-50">
                    <th className="text-left px-3 py-2 border border-gray-200">Servicio</th>
                    <th className="px-3 py-2 border border-gray-200">Entre semana (€)</th>
                    <th className="px-3 py-2 border border-gray-200">Fin de semana / Festivo (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {local.servicios.map((srv, i) => (
                    <tr key={srv.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200 text-gray-700">{srv.label}</td>
                      {['entresemana', 'finSemana'].map(field => (
                        <td key={field} className="px-3 py-2 border border-gray-200 text-center">
                          {srv.tipo === 'consultar' ? (
                            <span className="text-gray-400 italic text-xs">Consultar</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                className={estiloInput}
                                value={srv[field] ?? ''}
                                onChange={e => updateServicio(i, field, e.target.value)}
                              />
                              <span className="text-gray-400 text-xs">€</span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-between items-center rounded-b-2xl">
          <button
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Restablecer valores por defecto
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
            >
              {saved ? '✓ Guardado' : 'Guardar tarifas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

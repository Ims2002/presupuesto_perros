export default function PresupuestoPreview({ presupuesto, onBack }) {
  const { cliente, mascota, fechaInicio, fechaFin, lineas, notas, numero } = presupuesto
  const total = lineas.reduce((s, l) => s + l.subtotal, 0)
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div>
      {/* Barra de acciones */}
      <div className="no-print flex justify-between items-center mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm"
        >
          ← Volver al formulario
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium"
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      {/* Documento imprimible */}
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-2xl mx-auto" id="print-area">
        {/* Cabecera */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Guardería Canina</h1>
            <p className="text-gray-500 text-sm mt-1">Presupuesto #{numero}</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Fecha: {hoy}</p>
            {fechaInicio && <p>Estancia desde: {fechaInicio}</p>}
            {fechaFin && <p>Estancia hasta: {fechaFin}</p>}
          </div>
        </div>

        {/* Datos cliente */}
        <div className="border border-gray-100 rounded-xl p-4 mb-6 bg-gray-50">
          <h2 className="text-xs uppercase tracking-wide text-gray-400 mb-2">Cliente</h2>
          <p className="font-semibold text-gray-800">{cliente.nombre || '—'}</p>
          {cliente.telefono && <p className="text-sm text-gray-600">📞 {cliente.telefono}</p>}
          {cliente.email && <p className="text-sm text-gray-600">✉️ {cliente.email}</p>}
          {mascota && <p className="text-sm text-gray-600 mt-1">🐾 Mascota: <strong>{mascota}</strong></p>}
        </div>

        {/* Líneas */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 text-gray-600">Descripción</th>
              <th className="text-center py-2 text-gray-600">Cant.</th>
              <th className="text-right py-2 text-gray-600">P. unit.</th>
              <th className="text-right py-2 text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 text-gray-700">{l.descripcion}</td>
                <td className="py-2 text-center text-gray-600">{l.cantidad}</td>
                <td className="py-2 text-right text-gray-600">
                  {l.precioUnit === null ? 'Consultar' : `${l.precioUnit.toFixed(2)} €`}
                </td>
                <td className="py-2 text-right font-medium text-gray-800">
                  {l.subtotal === null ? '—' : `${l.subtotal.toFixed(2)} €`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-4 text-right font-bold text-gray-800 text-base">TOTAL</td>
              <td className="pt-4 text-right font-bold text-amber-600 text-base">{total.toFixed(2)} €</td>
            </tr>
          </tfoot>
        </table>

        {/* Notas */}
        {notas && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notas</p>
            <p className="text-sm text-gray-600 whitespace-pre-line">{notas}</p>
          </div>
        )}

        <p className="text-xs text-gray-300 text-center mt-10">
          Presupuesto válido durante 30 días desde la fecha de emisión.
        </p>
      </div>
    </div>
  )
}

import { useState } from 'react'

const TIPOS_ESTANCIA = [
  { key: 'diaEntresemana', label: 'Día entre semana' },
  { key: 'diaNocheEntresemana', label: 'Día + Noche entre semana' },
  { key: 'diaFinSemana', label: 'Día fin de semana' },
  { key: 'diaNocheFinSemana', label: 'Día + Noche fin de semana' },
  { key: 'tardeNoche', label: 'Servicio Tarde + Noche' },
]

export default function PresupuestoForm({ tarifas, onGenerar, ultimoNumero }) {
  const [cliente, setCliente] = useState({ nombre: '', telefono: '', email: '' })
  const [mascota, setMascota] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState([])

  // Para añadir línea de estancia
  const [numMascotas, setNumMascotas] = useState(0)
  const [tipoEstancia, setTipoEstancia] = useState('')
  const [diasEstancia, setDiasEstancia] = useState(1)

  // Para añadir servicio adicional
  const [servicioSel, setServicioSel] = useState('')
  const [diasSemana, setDiasSemana] = useState('entresemana')
  const [cantServicio, setCantServicio] = useState(1)

  function addEstancia() {
    if (numMascotas < 0 || numMascotas > 2 || !tipoEstancia) return
    const row = tarifas.estancia[numMascotas]
    const precio = row[tipoEstancia]
    const tipo = TIPOS_ESTANCIA.find(t => t.key === tipoEstancia)
    const desc = `${row.label} — ${tipo.label}`
    addLinea(desc, diasEstancia, precio)
    setDiasEstancia(1)
  }

  function addServicio() {
    if (!servicioSel) return
    const srv = tarifas.servicios.find(s => s.id === servicioSel)
    const precio = srv.tipo === 'consultar' ? null : srv[diasSemana]
    const esFs = diasSemana === 'finSemana'
    const desc = `${srv.label} — ${esFs ? 'Fin de semana/Festivo' : 'Entre semana'}`
    addLinea(desc, cantServicio, precio)
    setCantServicio(1)
  }

  function addLinea(descripcion, cantidad, precioUnit) {
    setLineas(prev => [
      ...prev,
      {
        descripcion,
        cantidad: Number(cantidad),
        precioUnit,
        subtotal: precioUnit !== null ? Number(cantidad) * precioUnit : null,
      },
    ])
  }

  function removeLinea(i) {
    setLineas(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLinea(i, field, val) {
    setLineas(prev => {
      const copy = [...prev]
      copy[i] = { ...copy[i], [field]: field === 'descripcion' ? val : Number(val) }
      const l = copy[i]
      copy[i].subtotal = l.precioUnit !== null ? l.cantidad * l.precioUnit : null
      return copy
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!cliente.nombre) return alert('Introduce el nombre del cliente.')
    if (lineas.length === 0) return alert('Añade al menos un servicio.')
    const numero = String(ultimoNumero + 1).padStart(4, '0')
    onGenerar({ cliente, mascota, fechaInicio, fechaFin, notas, lineas, numero })
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400'
  const labelCls = 'block text-xs text-gray-500 mb-1'
  const total = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">👤 Datos del cliente</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} value={cliente.nombre}
              onChange={e => setCliente(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Nombre y apellidos" />
          </div>
          <div>
            <label className={labelCls}>Teléfono</label>
            <input className={inputCls} value={cliente.telefono}
              onChange={e => setCliente(p => ({ ...p, telefono: e.target.value }))}
              placeholder="6XX XXX XXX" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={cliente.email}
              onChange={e => setCliente(p => ({ ...p, email: e.target.value }))}
              placeholder="correo@ejemplo.com" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-4">
          <div>
            <label className={labelCls}>Mascota(s)</label>
            <input className={inputCls} value={mascota}
              onChange={e => setMascota(e.target.value)}
              placeholder="Nombre de la mascota" />
          </div>
          <div>
            <label className={labelCls}>Fecha inicio estancia</label>
            <input className={inputCls} type="date" value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Fecha fin estancia</label>
            <input className={inputCls} type="date" value={fechaFin}
              onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Añadir estancia */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">🐶 Añadir estancia</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className={labelCls}>Nº mascotas</label>
            <select className={inputCls} value={numMascotas}
              onChange={e => setNumMascotas(Number(e.target.value))}>
              <option value={0}>1 mascota</option>
              <option value={1}>2 mascotas</option>
              <option value={2}>3 mascotas</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo de servicio</label>
            <select className={inputCls} value={tipoEstancia}
              onChange={e => setTipoEstancia(e.target.value)}>
              <option value="">Seleccionar…</option>
              {TIPOS_ESTANCIA.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Días</label>
            <input className={inputCls} type="number" min={1} value={diasEstancia}
              onChange={e => setDiasEstancia(e.target.value)} />
          </div>
          <button type="button" onClick={addEstancia}
            className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium">
            + Añadir
          </button>
        </div>
      </section>

      {/* Añadir servicio adicional */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">➕ Añadir servicio adicional</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className={labelCls}>Servicio</label>
            <select className={inputCls} value={servicioSel}
              onChange={e => setServicioSel(e.target.value)}>
              <option value="">Seleccionar…</option>
              {tarifas.servicios.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Período</label>
            <select className={inputCls} value={diasSemana}
              onChange={e => setDiasSemana(e.target.value)}>
              <option value="entresemana">Entre semana</option>
              <option value="finSemana">Fin de semana / Festivo</option>
            </select>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={labelCls}>Cantidad</label>
              <input className={inputCls} type="number" min={1} value={cantServicio}
                onChange={e => setCantServicio(e.target.value)} />
            </div>
            <button type="button" onClick={addServicio}
              className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium whitespace-nowrap">
              + Añadir
            </button>
          </div>
        </div>
      </section>

      {/* Líneas del presupuesto */}
      {lineas.length > 0 && (
        <section className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">📋 Líneas del presupuesto</h2>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                <input
                  className="flex-1 bg-transparent border-b border-gray-200 focus:outline-none focus:border-amber-400 text-gray-700"
                  value={l.descripcion}
                  onChange={e => updateLinea(i, 'descripcion', e.target.value)}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number" min={1}
                    className="w-14 border border-gray-200 rounded px-2 py-1 text-center text-xs focus:outline-none focus:border-amber-400"
                    value={l.cantidad}
                    onChange={e => updateLinea(i, 'cantidad', e.target.value)}
                  />
                  <span className="text-gray-400 text-xs">×</span>
                  <span className="text-gray-600 font-medium w-20 text-right">
                    {l.precioUnit !== null ? `${l.precioUnit} €` : 'Consultar'}
                  </span>
                  <span className="text-gray-400">=</span>
                  <span className="font-bold text-gray-800 w-20 text-right">
                    {l.subtotal !== null ? `${l.subtotal.toFixed(2)} €` : '—'}
                  </span>
                </div>
                <button type="button" onClick={() => removeLinea(i)}
                  className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0">×</button>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right">
            <span className="text-lg font-bold text-gray-800">
              Total: <span className="text-amber-600">{total.toFixed(2)} €</span>
            </span>
          </div>
        </section>
      )}

      {/* Notas */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <label className={labelCls}>Notas / observaciones</label>
        <textarea className={`${inputCls} h-20 resize-none`} value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Indicaciones especiales, medicación, alergias…" />
      </section>

      <button type="submit"
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-base transition-colors">
        Generar presupuesto →
      </button>
    </form>
  )
}

import { useState, useEffect } from 'react'

/**
 * Catálogo de tipos de estancia disponibles.
 * key: identificador usado en el objeto de tarifas para leer el precio.
 * label: texto que aparece en el selector y en el presupuesto generado.
 */
const TIPOS_ESTANCIA = [
  { key: 'diaEntresemana', label: 'Dia entre semana' },
  { key: 'diaNocheEntresemana', label: 'Dia + Noche entre semana' },
  { key: 'diaFinSemana', label: 'Dia fin de semana' },
  { key: 'diaNocheFinSemana', label: 'Dia + Noche fin de semana' },
  { key: 'tardeNoche', label: 'Servicio Tarde + Noche' },
]

/**
 * Mapa que traduce un tipo de estancia entre semana a su equivalente de fin de semana.
 * Se usa en addEstancia() para desglosar automáticamente los días cuando hay fechas.
 * Los tipos que ya son de fin de semana se mapean a sí mismos.
 */
const FIN_SEMANA_KEY = {
  'diaEntresemana': 'diaFinSemana',
  'diaNocheEntresemana': 'diaNocheFinSemana',
  'diaFinSemana': 'diaFinSemana',
  'diaNocheFinSemana': 'diaNocheFinSemana',
  'tardeNoche': 'tardeNoche',
}

/**
 * Recorre el rango [inicio, fin] día a día y clasifica cada día
 * como entre semana (lunes-viernes) o fin de semana (sábado-domingo).
 *
 * @param {string} inicio - Fecha en formato "YYYY-MM-DD"
 * @param {string} fin    - Fecha en formato "YYYY-MM-DD"
 * @returns {{ entresemana: number, finSemana: number, total: number }}
 *
 * Nota: se añade 'T00:00:00' para forzar la hora a medianoche local
 * y evitar que el timezone del navegador desplace la fecha un día.
 */
function splitDias(inicio, fin) {
  if (!inicio || !fin) return { entresemana: 0, finSemana: 0, total: 0 }
  let d = new Date(inicio + 'T00:00:00')
  const end = new Date(fin + 'T00:00:00')
  let entresemana = 0, finSemana = 0
  while (d <= end) {
    const day = d.getDay() // 0 = domingo, 6 = sábado
    if (day === 0 || day === 6) finSemana++
    else entresemana++
    d.setDate(d.getDate() + 1)
  }
  return { entresemana, finSemana, total: entresemana + finSemana }
}

// Clases Tailwind reutilizables para mantener consistencia visual en todos los inputs
const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400'
const lbl = 'block text-xs text-gray-500 mb-1'
const sec = { fontWeight: 600, color: '#374151', marginBottom: 16, fontSize: 14 }

/**
 * Formulario principal de creación y edición de presupuestos.
 *
 * Props:
 *   tarifas      - Objeto con las tarifas actuales (estancia y servicios del catálogo)
 *   onGenerar    - Callback que recibe los datos del presupuesto al enviar el formulario
 *   ultimoNumero - Último número usado; se incrementa para el nuevo presupuesto
 *   initialData  - Si se pasa, pre-rellena todos los campos (modo edición)
 *   isEditing    - true cuando se está editando un presupuesto existente
 */
export default function PresupuestoForm({ tarifas, onGenerar, ultimoNumero, initialData, isEditing }) {
  // --- Datos principales del presupuesto ---
  const [cliente, setCliente] = useState({ nombre: '' })
  const [mascota, setMascota] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState([]) // array de líneas añadidas al presupuesto

  // --- Estado del bloque "Estancia" ---
  const [numMascotas, setNumMascotas] = useState(0)       // índice en tarifas.estancia (0=1 mascota, 1=2, 2=3)
  const [tipoEstancia, setTipoEstancia] = useState('')
  const [subfechaEstancia, setSubfechaEstancia] = useState('') // texto opcional de días concretos

  // --- Estado del bloque "Servicios del catálogo" ---
  const [servicioSel, setServicioSel] = useState('')
  const [diasSemana, setDiasSemana] = useState('entresemana') // 'entresemana' | 'finSemana'
  const [cantServicio, setCantServicio] = useState(1)
  const [subfechaServicio, setSubfechaServicio] = useState('')

  // --- Estado del bloque "Servicios adicionales" (línea manual) ---
  const [manDesc, setManDesc] = useState('')
  const [manSubfecha, setManSubfecha] = useState('')
  const [manPrecio, setManPrecio] = useState('')
  const [manCant, setManCant] = useState(1)

  /**
   * Cuando cambia initialData (al abrir un presupuesto del historial para editar),
   * pre-rellena todos los campos de estado con los valores del registro.
   * Cuando initialData es null (nuevo presupuesto), resetea todos los campos.
   */
  useEffect(() => {
    if (initialData) {
      setCliente(initialData.cliente || { nombre: '' })
      setMascota(initialData.mascota || '')
      setFechaInicio(initialData.fechaInicio || '')
      setFechaFin(initialData.fechaFin || '')
      setNotas(initialData.notas || '')
      setLineas(initialData.lineas || [])
    } else {
      setCliente({ nombre: '' })
      setMascota('')
      setFechaInicio('')
      setFechaFin('')
      setNotas('')
      setLineas([])
    }
  }, [initialData])

  // Desglose de días calculado en tiempo real según las fechas introducidas
  const split = splitDias(fechaInicio, fechaFin)
  const hasFechas = fechaInicio && fechaFin && split.total > 0

  /**
   * Añade líneas de estancia al presupuesto.
   *
   * Si hay fechas definidas: genera automáticamente dos líneas separadas,
   * una con los días entre semana (al precio normal) y otra con los días
   * de fin de semana (al precio de fin de semana del mismo tipo de servicio).
   *
   * Si no hay fechas: añade una sola línea con cantidad 1.
   */
  function addEstancia() {
    if (!tipoEstancia) return
    const row = tarifas.estancia[numMascotas] // fila de tarifas según número de mascotas
    const tipo = TIPOS_ESTANCIA.find(t => t.key === tipoEstancia)

    if (hasFechas) {
      // Determina la clave de fin de semana equivalente al tipo seleccionado
      const fsKey = tipoEstancia.includes('Fin') || tipoEstancia.includes('finSemana')
        ? tipoEstancia
        : FIN_SEMANA_KEY[tipoEstancia]
      if (split.entresemana > 0) {
        addLinea(`${row.label} - ${tipo.label}`, subfechaEstancia, split.entresemana, row[tipoEstancia])
      }
      if (split.finSemana > 0) {
        const fsLabel = TIPOS_ESTANCIA.find(t => t.key === fsKey)?.label || tipo.label
        addLinea(`${row.label} - ${fsLabel} (fin de semana)`, subfechaEstancia, split.finSemana, row[fsKey])
      }
    } else {
      addLinea(`${row.label} - ${tipo.label}`, subfechaEstancia, 1, row[tipoEstancia])
    }
    setSubfechaEstancia('')
  }

  /**
   * Añade un servicio del catálogo (baño, corte, etc.) como línea del presupuesto.
   * Si el servicio es de tipo 'consultar', el precio queda como null
   * y el presupuesto mostrará "Consultar" en lugar de un importe.
   */
  function addServicio() {
    if (!servicioSel) return
    const srv = tarifas.servicios.find(s => s.id === servicioSel)
    const precio = srv.tipo === 'consultar' ? null : srv[diasSemana]
    const esFs = diasSemana === 'finSemana'
    addLinea(`${srv.label} (${esFs ? 'fin de semana/festivo' : 'entre semana'})`, subfechaServicio, cantServicio, precio)
    setCantServicio(1)
    setSubfechaServicio('')
  }

  /**
   * Añade una línea completamente manual (descripción y precio libres).
   * Útil para extras no contemplados en el catálogo (temporada alta, etc.).
   */
  function addManual() {
    if (!manDesc || manPrecio === '') return
    addLinea(manDesc, manSubfecha, Number(manCant), Number(manPrecio))
    setManDesc('')
    setManSubfecha('')
    setManPrecio('')
    setManCant(1)
  }

  /**
   * Función base que construye y añade una línea al array de lineas.
   * Calcula el subtotal en el momento de inserción.
   * Si precioUnit es null (servicio a consultar), el subtotal también es null.
   *
   * @param {string} descripcion
   * @param {string} subfecha    - Texto aclaratorio opcional (días concretos, etc.)
   * @param {number} cantidad
   * @param {number|null} precioUnit
   */
  function addLinea(descripcion, subfecha, cantidad, precioUnit) {
    setLineas(prev => [...prev, {
      descripcion,
      subfecha: subfecha || '',
      cantidad: Number(cantidad),
      precioUnit,
      subtotal: precioUnit !== null ? Number(cantidad) * precioUnit : null,
    }])
  }

  /** Elimina la línea en la posición i del resumen. */
  function removeLinea(i) {
    setLineas(prev => prev.filter((_, idx) => idx !== i))
  }

  /**
   * Actualiza un campo de una línea existente en el resumen.
   * Si se modifica cantidad o precioUnit, recalcula el subtotal.
   *
   * @param {number} i     - Índice de la línea
   * @param {string} field - Campo a modificar
   * @param {string} val   - Nuevo valor (siempre string desde el input)
   */
  function updateLinea(i, field, val) {
    setLineas(prev => {
      const copy = [...prev]
      if (field === 'descripcion' || field === 'subfecha') {
        copy[i] = { ...copy[i], [field]: val }
      } else {
        copy[i] = { ...copy[i], [field]: Number(val) }
        const l = copy[i]
        copy[i].subtotal = l.precioUnit !== null ? l.cantidad * l.precioUnit : null
      }
      return copy
    })
  }

  /**
   * Valida y envía el formulario.
   *
   * El número de presupuesto se determina aquí:
   *   - Edición: se mantiene el número original de initialData
   *   - Nuevo: se incrementa ultimoNumero y se formatea con ceros ("0001")
   *
   * El incremento real del contador en localStorage lo gestiona App.jsx
   * dentro de handleGenerar, una vez confirmado el INSERT en Supabase.
   */
  function handleSubmit(e) {
    e.preventDefault()
    if (lineas.length === 0) return alert('Añade al menos un servicio.')
    const numero = isEditing
      ? initialData.numero
      : String(ultimoNumero + 1).padStart(4, '0')
    onGenerar({ cliente, mascota, fechaInicio, fechaFin, notas, lineas, numero })
  }

  // Total acumulado de todas las líneas con precio conocido
  const total = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Banner de modo edición — solo visible cuando isEditing es true */}
      {isEditing && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
          Editando presupuesto #{initialData?.numero}
        </div>
      )}

      {/* Datos del cliente */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <div style={sec}>Datos del cliente</div>
        <div>
          <label className={lbl}>Nombre</label>
          <input className={inp} value={cliente.nombre} onChange={e => setCliente(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre del cliente" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-4">
          <div>
            <label className={lbl}>Mascota(s)</label>
            <input className={inp} value={mascota} onChange={e => setMascota(e.target.value)} placeholder="Nombre" />
          </div>
          <div>
            <label className={lbl}>Fecha entrada</label>
            <input className={inp} type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Fecha salida</label>
            <input className={inp} type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>
        {/* Desglose de días — solo aparece cuando ambas fechas están rellenas */}
        {hasFechas && (
          <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
            {split.total} dias totales: {split.entresemana} entre semana + {split.finSemana} fin de semana
          </div>
        )}
      </section>

      {/* Estancia */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <div style={sec}>Estancia</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className={lbl}>Mascotas</label>
            {/* El valor es el índice (0,1,2) en el array tarifas.estancia */}
            <select className={inp} value={numMascotas} onChange={e => setNumMascotas(Number(e.target.value))}>
              <option value={0}>1 mascota</option>
              <option value={1}>2 mascotas</option>
              <option value={2}>3 mascotas</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Tipo de servicio</label>
            <select className={inp} value={tipoEstancia} onChange={e => setTipoEstancia(e.target.value)}>
              <option value="">Seleccionar...</option>
              {TIPOS_ESTANCIA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {/* El texto del botón cambia para indicar que se generará desglose automático */}
          <button type="button" onClick={addEstancia} className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium">
            {hasFechas ? '+ Añadir (con desglose)' : '+ Añadir'}
          </button>
        </div>
        <div className="mt-3">
          <label className={lbl}>Dias concretos (aparece en el presupuesto, ej: 20,21,24,26)</label>
          <input className={inp} value={subfechaEstancia} onChange={e => setSubfechaEstancia(e.target.value)} placeholder="Opcional" />
        </div>
      </section>

      {/* Servicios del catálogo */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <div style={sec}>Servicios del catalogo</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className={lbl}>Servicio</label>
            <select className={inp} value={servicioSel} onChange={e => setServicioSel(e.target.value)}>
              <option value="">Seleccionar...</option>
              {tarifas.servicios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Periodo</label>
            <select className={inp} value={diasSemana} onChange={e => setDiasSemana(e.target.value)}>
              <option value="entresemana">Entre semana</option>
              <option value="finSemana">Fin de semana / Festivo</option>
            </select>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={lbl}>Cant.</label>
              <input className={inp} type="number" min={1} value={cantServicio} onChange={e => setCantServicio(e.target.value)} />
            </div>
            <button type="button" onClick={addServicio} className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium">
              + Añadir
            </button>
          </div>
        </div>
        <div className="mt-3">
          <label className={lbl}>Aclaracion (opcional)</label>
          <input className={inp} value={subfechaServicio} onChange={e => setSubfechaServicio(e.target.value)} placeholder="Ej: dias 22,23,25" />
        </div>
      </section>

      {/* Servicios adicionales — línea completamente libre */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <div style={sec}>Servicios adicionales</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className={lbl}>Descripcion</label>
            <input className={inp} value={manDesc} onChange={e => setManDesc(e.target.value)} placeholder="Ej: Extra temporada alta" />
          </div>
          <div>
            <label className={lbl}>Precio/unidad (EUR)</label>
            <input className={inp} type="number" min={0} step={0.01} value={manPrecio} onChange={e => setManPrecio(e.target.value)} placeholder="0.00" />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={lbl}>Cant.</label>
              <input className={inp} type="number" min={1} value={manCant} onChange={e => setManCant(e.target.value)} />
            </div>
            <button type="button" onClick={addManual} className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium">
              + Añadir
            </button>
          </div>
        </div>
        <div className="mt-3">
          <label className={lbl}>Aclaracion (opcional)</label>
          <input className={inp} value={manSubfecha} onChange={e => setManSubfecha(e.target.value)} placeholder="Ej: 1 EUR/dia, 8 dias" />
        </div>
      </section>

      {/* Resumen de líneas — solo visible cuando hay al menos una línea añadida */}
      {lineas.length > 0 && (
        <section className="bg-white rounded-2xl p-5 shadow-sm">
          <div style={sec}>Resumen</div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                <div className="flex-1 min-w-0">
                  {/* Descripción y aclaración son editables inline para correcciones rápidas */}
                  <input className="w-full bg-transparent border-b border-gray-200 focus:outline-none focus:border-amber-400 text-gray-700 font-medium text-xs" value={l.descripcion} onChange={e => updateLinea(i, 'descripcion', e.target.value)} />
                  <input className="w-full bg-transparent text-gray-400 text-xs mt-1 border-b border-gray-100 focus:outline-none" value={l.subfecha} onChange={e => updateLinea(i, 'subfecha', e.target.value)} placeholder="Aclaracion..." />
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  {/* La cantidad también es editable; al cambiar recalcula el subtotal */}
                  <input type="number" min={1} className="w-12 border border-gray-200 rounded px-2 py-1 text-center text-xs focus:outline-none" value={l.cantidad} onChange={e => updateLinea(i, 'cantidad', e.target.value)} />
                  <span className="text-gray-400 text-xs">x {l.precioUnit ?? '?'}</span>
                  <span className="font-bold text-gray-700 text-xs w-16 text-right">{l.subtotal !== null ? `${l.subtotal.toFixed(2)}EUR` : '-'}</span>
                </div>
                <button type="button" onClick={() => removeLinea(i)} className="text-gray-300 hover:text-red-400 text-base leading-none mt-1 shrink-0">x</button>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right font-bold text-gray-800 text-sm">
            Total: <span className="text-amber-600">{total.toFixed(2)} EUR</span>
          </div>
        </section>
      )}

      {/* Notas libres — se imprimen en el documento final */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <label className={lbl}>Notas / observaciones (aparecen en el presupuesto)</label>
        <textarea className={`${inp} h-20 resize-none`} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Indicaciones especiales, medicacion, alergias..." />
      </section>

      {/* El texto del botón cambia según el modo para que el usuario sepa qué va a pasar */}
      <button type="submit" className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-base transition-colors">
        {isEditing ? 'Guardar cambios' : 'Ver presupuesto'}
      </button>
    </form>
  )
}

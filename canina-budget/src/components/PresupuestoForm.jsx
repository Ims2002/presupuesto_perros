import { useState, useEffect, useRef } from 'react'
import { createLogger } from '../lib/logger'
import { nuevoIdBorrador } from '../lib/presupuestosRepo'

const log = createLogger('form')
// Logger específico de las líneas del resumen: en el visor se puede filtrar
// por "form:lineas" para ver solo altas, cambios, borrados y pérdidas de líneas.
const logLineas = log.child('lineas')

/**
 * Asegura que cada línea tiene un id estable. Las líneas guardadas antes de
 * este cambio no lo tienen: se les asigna uno al cargarlas.
 * El id sirve para identificar cada línea en el registro de actividad y como
 * "key" de React (antes era el índice, y al borrar una línea la siguiente
 * heredaba su posición, su foco y sus botones).
 */
function conIds(lineas) {
  return (lineas || []).map(l => (l?.id ? l : { ...l, id: nuevoIdBorrador() }))
}

/** Id corto para el registro (los 8 primeros caracteres bastan para distinguirlas). */
const idCorto = id => String(id ?? '').slice(0, 8)

/** Datos de una línea aptos para el registro (sin el texto: solo su longitud). */
function lineaParaLog(l, indice) {
  return {
    id: idCorto(l?.id),
    indice,
    cantidad: l?.cantidad,
    precioUnit: l?.precioUnit,
    largoDescripcion: (l?.descripcion || '').length,
  }
}

/**
 * Indica cómo se ha activado un botón: 'ratón', 'táctil', 'lápiz' o 'teclado'
 * (Intro / espacio sobre el botón enfocado). Sirve para saber, por ejemplo, si
 * un borrado se pidió con el teclado sin querer al tabular entre campos.
 */
function origenEvento(e) {
  const pt = e?.nativeEvent?.pointerType
  if (pt === 'mouse') return 'ratón'
  if (pt === 'touch') return 'táctil'
  if (pt === 'pen') return 'lápiz'
  return e?.detail === 0 ? 'teclado' : 'ratón'
}

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
 * como entre semana (lunes-jueves) o fin de semana (viernes-domingo).
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
    const day = d.getDay() // 0 = domingo, 5 = viernes, 6 = sábado
    if (day === 0 || day === 5 || day === 6) finSemana++
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
 *   guardando    - true mientras App está guardando: el botón se deshabilita
 */
export default function PresupuestoForm({ tarifas, onGenerar, ultimoNumero, initialData, isEditing, guardando = false }) {
  // --- Datos principales del presupuesto ---
  const [cliente, setCliente] = useState({ nombre: '' })
  const [mascota, setMascota] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState([]) // array de líneas añadidas al presupuesto

  // --- Trazabilidad de las líneas (registro de actividad) ---
  // lineasRef: siempre el último valor de "lineas" (para leerlo dentro de efectos y handlers).
  // motivosRef: por qué se va a cambiar la lista en el próximo render
  //   ('añadir' | 'modificar' | 'eliminar' | 'cargar' | 'vaciar'). Lo consume el
  //   vigilante de más abajo: si desaparece una línea sin un motivo que lo
  //   justifique, se deja un aviso en el registro con el detalle.
  const lineasRef = useRef(lineas)
  lineasRef.current = lineas
  const motivosRef = useRef([])
  const prevLineasRef = useRef(lineas)
  const edicionRef = useRef(null) // { id, campo, valor } del campo del resumen con el foco

  /** Único punto por el que se cambia la lista de líneas: anota el motivo y aplica el cambio. */
  function cambiarLineas(motivo, updater) {
    motivosRef.current.push(motivo)
    setLineas(updater)
  }

  // --- Confirmación de borrado de líneas ---
  const [lineaABorrar, setLineaABorrar] = useState(null) // { id, indice, origen } o null

  // --- Estado del bloque "Estancia" ---
  const [numMascotas, setNumMascotas] = useState(0)       // índice en tarifas.estancia (0=1 mascota, 1=2, 2=3, 3=4)
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
    log.debug(initialData ? 'Formulario cargado con datos' : 'Formulario en blanco', initialData ? { numero: initialData.numero, lineas: initialData.lineas?.length ?? 0 } : undefined)
    const actuales = lineasRef.current
    if (initialData) {
      const nuevas = conIds(initialData.lineas)
      // Si lo que hay en pantalla no coincide con lo que se va a cargar, se
      // pierden cambios del usuario (p. ej. líneas añadidas o editadas mientras
      // el botón ponía "Guardando..."). Se deja constancia de qué se pierde.
      const porId = new Map(nuevas.map(l => [l.id, JSON.stringify(l)]))
      const perdidas = actuales.filter(l => !porId.has(l.id))
      const modificadas = actuales.filter(l => porId.has(l.id) && porId.get(l.id) !== JSON.stringify(l))
      if (actuales.length && (perdidas.length || modificadas.length)) {
        logLineas.warn('Al cargar datos en el formulario se descartan cambios que había en pantalla', {
          origen: initialData.origen || 'desconocido',
          numero: initialData.numero,
          lineasEnPantalla: actuales.length,
          lineasCargadas: nuevas.length,
          lineasDescartadas: perdidas.map(l => lineaParaLog(l, actuales.indexOf(l))),
          lineasConCambiosDescartados: modificadas.map(l => lineaParaLog(l, actuales.indexOf(l))),
        })
      }
      setCliente(initialData.cliente || { nombre: '' })
      setMascota(initialData.mascota || '')
      setFechaInicio(initialData.fechaInicio || '')
      setFechaFin(initialData.fechaFin || '')
      setNotas(initialData.notas || '')
      cambiarLineas({ accion: 'cargar', origen: initialData.origen || 'desconocido', numero: initialData.numero }, nuevas)
    } else {
      setCliente({ nombre: '' })
      setMascota('')
      setFechaInicio('')
      setFechaFin('')
      setNotas('')
      cambiarLineas({ accion: 'vaciar' }, [])
    }
  }, [initialData])

  /**
   * Vigilante de la lista de líneas: compara cada versión con la anterior.
   * Si desaparece alguna línea, lo registra junto con el motivo del cambio.
   *   - Motivo esperado (borrado confirmado, carga, vaciado) → info.
   *   - Cualquier otro caso → warn "Han desaparecido líneas del resumen sin que
   *     el usuario las borrase", con el motivo que se estaba aplicando y las
   *     líneas afectadas. Es la entrada que hay que buscar si vuelve a ocurrir.
   */
  useEffect(() => {
    const prev = prevLineasRef.current
    prevLineasRef.current = lineas
    const motivos = motivosRef.current
    motivosRef.current = []
    if (prev === lineas) return

    const idsAhora = new Set(lineas.map(l => l.id))
    const desaparecidas = prev.filter(l => !idsAhora.has(l.id))
    if (desaparecidas.length === 0) return

    const acciones = motivos.map(m => m.accion)
    const datos = {
      motivo: acciones.length ? acciones.join('+') : 'desconocido',
      detalleMotivo: motivos,
      antes: prev.length,
      despues: lineas.length,
      desaparecidas: desaparecidas.map(l => lineaParaLog(l, prev.indexOf(l))),
    }
    const esperado = acciones.some(a => a === 'eliminar' || a === 'cargar' || a === 'vaciar')
    if (esperado) logLineas.info('Líneas quitadas del resumen', datos)
    else logLineas.warn('Han desaparecido líneas del resumen sin que el usuario las borrase', datos)
  }, [lineas])

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
        addLinea(`${row.label} - ${tipo.label}`, subfechaEstancia, split.entresemana, row[tipoEstancia], 'estancia')
      }
      if (split.finSemana > 0) {
        const fsLabel = TIPOS_ESTANCIA.find(t => t.key === fsKey)?.label || tipo.label
        addLinea(`${row.label} - ${fsLabel} (fin de semana)`, subfechaEstancia, split.finSemana, row[fsKey], 'estancia')
      }
    } else {
      addLinea(`${row.label} - ${tipo.label}`, subfechaEstancia, 1, row[tipoEstancia], 'estancia')
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
    addLinea(`${srv.label} (${esFs ? 'fin de semana/festivo' : 'entre semana'})`, subfechaServicio, cantServicio, precio, 'catalogo')
    setCantServicio(1)
    setSubfechaServicio('')
  }

  /**
   * Añade una línea completamente manual (descripción y precio libres).
   * Útil para extras no contemplados en el catálogo (temporada alta, etc.).
   */
  function addManual() {
    if (!manDesc || manPrecio === '') return
    addLinea(manDesc, manSubfecha, Number(manCant), Number(manPrecio), 'manual')
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
   * @param {string} origen      - Bloque desde el que se añade: 'estancia' | 'catalogo' | 'manual'
   */
  function addLinea(descripcion, subfecha, cantidad, precioUnit, origen) {
    const linea = {
      id: nuevoIdBorrador(),
      descripcion,
      subfecha: subfecha || '',
      cantidad: Number(cantidad),
      precioUnit,
      subtotal: precioUnit !== null ? Number(cantidad) * precioUnit : null,
    }
    logLineas.info('Línea añadida', { origen, ...lineaParaLog(linea, lineasRef.current.length), lineasTotales: lineasRef.current.length + 1 })
    cambiarLineas({ accion: 'añadir', id: idCorto(linea.id), origen }, prev => [...prev, linea])
  }

  /**
   * Paso 1 del borrado: el botón "x" NO borra, solo abre la ventana de
   * confirmación. Se registra cómo se pulsó (ratón, táctil o teclado).
   */
  function pedirBorrado(l, i, e) {
    const origen = origenEvento(e)
    logLineas.info('Pedir confirmación para eliminar línea', { ...lineaParaLog(l, i), origen, lineasTotales: lineas.length })
    setLineaABorrar({ id: l.id, indice: i, origen })
  }

  /** Cierra la ventana de confirmación sin borrar nada. */
  function cancelarBorrado(como) {
    if (!lineaABorrar) return
    logLineas.info('Eliminación de línea cancelada', { id: idCorto(lineaABorrar.id), como })
    setLineaABorrar(null)
  }

  /** Paso 2 del borrado: el usuario ha confirmado en la ventana. Borra por id, no por posición. */
  function confirmarBorrado() {
    if (!lineaABorrar) return
    const { id, origen } = lineaABorrar
    const indice = lineas.findIndex(l => l.id === id)
    if (indice === -1) {
      logLineas.warn('Se confirmó el borrado de una línea que ya no estaba en el resumen', { id: idCorto(id) })
    } else {
      logLineas.info('Línea eliminada (confirmado por el usuario)', { ...lineaParaLog(lineas[indice], indice), origen, quedan: lineas.length - 1 })
      cambiarLineas({ accion: 'eliminar', id: idCorto(id) }, prev => prev.filter(l => l.id !== id))
    }
    setLineaABorrar(null)
  }

  /**
   * Actualiza un campo de una línea existente en el resumen (por id).
   * Si se modifica cantidad o precioUnit, recalcula el subtotal.
   * No pide confirmación ni registra cada pulsación: el cambio se registra
   * una sola vez al salir del campo (ver finEdicion).
   *
   * @param {string} id    - Id de la línea
   * @param {string} field - Campo a modificar
   * @param {string} val   - Nuevo valor (siempre string desde el input)
   */
  function updateLinea(id, field, val) {
    cambiarLineas({ accion: 'modificar', id: idCorto(id), campo: field }, prev => prev.map(l => {
      if (l.id !== id) return l
      if (field === 'descripcion' || field === 'subfecha') return { ...l, [field]: val }
      const nueva = { ...l, [field]: Number(val) }
      nueva.subtotal = nueva.precioUnit !== null ? nueva.cantidad * nueva.precioUnit : null
      return nueva
    }))
  }

  /** Al entrar en un campo del resumen se guarda su valor para comparar al salir. */
  function inicioEdicion(l, campo) {
    edicionRef.current = { id: l.id, campo, valor: l[campo] }
  }

  /**
   * Al salir de un campo del resumen se registra el cambio (una entrada por
   * edición, no por tecla). Del texto solo se anota la longitud.
   * Si la línea ya no existe al salir del campo, es una pérdida: se avisa.
   */
  function finEdicion(l, campo) {
    const ed = edicionRef.current
    edicionRef.current = null
    if (!ed || ed.id !== l.id || ed.campo !== campo) return
    const actuales = lineasRef.current
    const indice = actuales.findIndex(x => x.id === l.id)
    if (indice === -1) {
      logLineas.warn('La línea que se estaba editando ya no está en el resumen', { id: idCorto(l.id), campo })
      return
    }
    const nuevo = actuales[indice][campo]
    if (nuevo === ed.valor) return
    const cambio = campo === 'cantidad'
      ? { de: ed.valor, a: nuevo }
      : { largoAntes: String(ed.valor ?? '').length, largoDespues: String(nuevo ?? '').length }
    logLineas.info('Línea modificada', { id: idCorto(l.id), indice, campo, ...cambio, lineasTotales: actuales.length })
  }

  /**
   * Valida y envía el formulario.
   *
   * El número de presupuesto se determina aquí:
   *   - Edición: se mantiene el número original de initialData
   *   - Nuevo: número PREVISTO (ultimoNumero + 1, con ceros: "0001"). El
   *     definitivo lo asigna la capa de datos al guardar, consultando el
   *     máximo en remoto en ese momento (puede variar si otro dispositivo
   *     guardó antes).
   */
  function handleSubmit(e) {
    e.preventDefault()
    if (guardando) {
      log.warn('Envío ignorado: el formulario ya se está guardando')
      return
    }
    if (lineas.length === 0) {
      log.info('Envío bloqueado: el presupuesto no tiene líneas')
      return alert('Añade al menos un servicio.')
    }
    const numero = isEditing
      ? initialData.numero
      : String(ultimoNumero + 1).padStart(4, '0')
    log.debug('Formulario enviado', { modo: isEditing ? 'editar' : 'crear', numero, lineas: lineas.length })
    onGenerar({ cliente, mascota, fechaInicio, fechaFin, notas, lineas, numero })
  }

  /**
   * Evita que la tecla Intro dentro de un campo envíe (y guarde) el
   * presupuesto. Es el comportamiento por defecto de los formularios HTML y en
   * el móvil es muy fácil pulsar "Ir"/"Intro" sin querer: se guardaba un
   * presupuesto a medias y, al terminarlo y enviarlo, aparecía otro más.
   * Solo el botón de abajo guarda. En los textarea Intro sigue haciendo salto de línea.
   */
  function bloquearIntro(e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault()
      log.debug('Intro bloqueado en un campo (no envía el formulario)', { campo: e.target.placeholder || e.target.type })
    }
  }

  // Total acumulado de todas las líneas con precio conocido
  const total = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)

  // Línea pendiente de confirmar su borrado (para mostrarla en la ventana)
  const lineaPendiente = lineaABorrar ? lineas.find(l => l.id === lineaABorrar.id) : null

  return (
    <>
    <form onSubmit={handleSubmit} onKeyDown={bloquearIntro} className="space-y-5">

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
            {/* El valor es el índice en el array tarifas.estancia (una opción por fila de tarifas) */}
            <select className={inp} value={numMascotas} onChange={e => setNumMascotas(Number(e.target.value))}>
              {tarifas.estancia.map((row, i) => (
                <option key={i} value={i}>{i + 1} {i === 0 ? 'mascota' : 'mascotas'}</option>
              ))}
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
              <div key={l.id ?? i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                <div className="flex-1 min-w-0">
                  {/* Descripción y aclaración son editables inline para correcciones rápidas */}
                  <input className="w-full bg-transparent border-b border-gray-200 focus:outline-none focus:border-amber-400 text-gray-700 font-medium text-xs" value={l.descripcion} onChange={e => updateLinea(l.id, 'descripcion', e.target.value)} onFocus={() => inicioEdicion(l, 'descripcion')} onBlur={() => finEdicion(l, 'descripcion')} />
                  <input className="w-full bg-transparent text-gray-400 text-xs mt-1 border-b border-gray-100 focus:outline-none" value={l.subfecha ?? ''} onChange={e => updateLinea(l.id, 'subfecha', e.target.value)} onFocus={() => inicioEdicion(l, 'subfecha')} onBlur={() => finEdicion(l, 'subfecha')} placeholder="Aclaracion..." />
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  {/* La cantidad también es editable; al cambiar recalcula el subtotal */}
                  <input type="number" min={1} className="w-12 border border-gray-200 rounded px-2 py-1 text-center text-xs focus:outline-none" value={l.cantidad} onChange={e => updateLinea(l.id, 'cantidad', e.target.value)} onFocus={() => inicioEdicion(l, 'cantidad')} onBlur={() => finEdicion(l, 'cantidad')} />
                  <span className="text-gray-400 text-xs">x {l.precioUnit ?? '?'}</span>
                  <span className="font-bold text-gray-700 text-xs w-16 text-right">{l.subtotal !== null ? `${l.subtotal.toFixed(2)}EUR` : '-'}</span>
                </div>
                {/* Abre la confirmación; no borra directamente. Fuera del orden de tabulación
                    para que Tab pase de la cantidad a la línea siguiente sin pararse aquí. */}
                <button type="button" tabIndex={-1} aria-label={`Eliminar línea ${i + 1}`} title="Eliminar línea" onClick={e => pedirBorrado(l, i, e)} className="text-gray-300 hover:text-red-400 text-base leading-none mt-1 shrink-0">x</button>
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
      {/* Deshabilitado mientras se guarda: evita el doble envío por doble toque */}
      <button
        type="submit"
        disabled={guardando}
        aria-busy={guardando}
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-base transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {guardando ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Ver presupuesto'}
      </button>
    </form>

    {/* Ventana de confirmación antes de eliminar una línea del resumen.
        El foco empieza en "Cancelar": un Intro o espacio accidental no borra nada. */}
    {lineaABorrar && (
      <div
        className="no-print"
        onClick={() => cancelarBorrado('clic fuera')}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelarBorrado('tecla Escape') } }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="borrar-linea-titulo"
          onClick={e => e.stopPropagation()}
          style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%' }}
        >
          <div id="borrar-linea-titulo" style={{ fontWeight: 700, fontSize: 16, color: '#1f2937', marginBottom: 8 }}>
            ¿Eliminar esta línea?
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
            Se quitará del resumen del presupuesto.
          </div>
          {lineaPendiente && (
            <div style={{ fontSize: 13, background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 10, padding: '10px 12px', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, color: '#374151', wordBreak: 'break-word' }}>{lineaPendiente.descripcion || '(sin descripción)'}</div>
              {lineaPendiente.subfecha && <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>{lineaPendiente.subfecha}</div>}
              <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                {lineaPendiente.cantidad} x {lineaPendiente.precioUnit ?? '?'} = {lineaPendiente.subtotal !== null && lineaPendiente.subtotal !== undefined ? `${Number(lineaPendiente.subtotal).toFixed(2)} EUR` : 'Consultar'}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              autoFocus
              onClick={() => cancelarBorrado('botón Cancelar')}
              style={{ flex: 1, padding: '10px 0', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarBorrado}
              style={{ flex: 1, padding: '10px 0', background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

import { createLogger } from '../lib/logger'

const log = createLogger('tarifas')

// Versión de las tarifas por defecto. Al subirla, getTarifas() reemplaza la tabla de
// estancia guardada en localStorage por la de aquí (los servicios guardados se conservan).
// v2 (oct 2026): nuevos precios de Día+Noche y Tarde+Noche, y fila de 4 mascotas.
export const TARIFAS_VERSION = 2

// Tarifas por defecto — se sobreescriben con lo guardado en localStorage
export const tarifasDefault = {
  version: TARIFAS_VERSION,
  estancia: [
    {
      label: '1 Mascota',
      diaEntresemana: 20,
      diaNocheEntresemana: 25,
      diaFinSemana: 25,
      diaNocheFinSemana: 30,
      tardeNoche: 20,
    },
    {
      label: '2 Mascotas',
      diaEntresemana: 35,
      diaNocheEntresemana: 45,
      diaFinSemana: 40,
      diaNocheFinSemana: 50,
      tardeNoche: 35,
    },
    {
      label: '3 Mascotas',
      diaEntresemana: 45,
      diaNocheEntresemana: 55,
      diaFinSemana: 50,
      diaNocheFinSemana: 60,
      tardeNoche: 45,
    },
    {
      label: '4 Mascotas',
      diaEntresemana: 55,
      diaNocheEntresemana: 65,
      diaFinSemana: 60,
      diaNocheFinSemana: 70,
      tardeNoche: 55,
    },
  ],
  servicios: [
    {
      id: 'paseo15',
      label: 'Paseo 15 minutos',
      entresemana: 12,
      finSemana: 15,
      tipo: 'precio_simple',
    },
    {
      id: 'gatoDom1',
      label: 'Cuidado a Domicilio Gato (1 visita)',
      entresemana: 15,
      finSemana: 17,
      tipo: 'precio_simple',
    },
    {
      id: 'gatoDom2',
      label: 'Cuidado a Domicilio Gato (2 visitas)',
      entresemana: 20,
      finSemana: 22,
      tipo: 'precio_simple',
    },
    {
      id: 'gatos2Dom1',
      label: 'Cuidado a Domicilio 2 Gatos (1 visita)',
      entresemana: 20,
      finSemana: 22,
      tipo: 'precio_simple',
    },
    {
      id: 'gatos2Dom2',
      label: 'Cuidado a Domicilio 2 Gatos (2 visitas)',
      entresemana: 25,
      finSemana: 27,
      tipo: 'precio_simple',
    },
    {
      id: 'largaEstancia',
      label: 'Cuidado Larga Estancia (+30 días, fuera temporada alta)',
      entresemana: 18,
      finSemana: 20,
      tipo: 'precio_simple',
    },
    {
      id: 'perroDom',
      label: 'Cuidado a Domicilio Perro',
      entresemana: null,
      finSemana: null,
      tipo: 'consultar',
    },
  ],
}

export function getTarifas() {
  let stored
  try {
    const raw = localStorage.getItem('tarifas_canina')
    stored = raw ? JSON.parse(raw) : null
  } catch (err) {
    log.warn('Tarifas guardadas ilegibles; se usan las de por defecto', { error: err })
    return tarifasDefault
  }
  if (!stored) return tarifasDefault

  // Tarifas guardadas con una versión anterior: se actualiza la tabla de estancia
  // a los precios vigentes y se mantienen los servicios tal como estaban guardados.
  if ((stored.version ?? 1) < TARIFAS_VERSION) {
    const migradas = {
      ...stored,
      version: TARIFAS_VERSION,
      estancia: JSON.parse(JSON.stringify(tarifasDefault.estancia)),
    }
    try {
      saveTarifas(migradas)
    } catch (err) {
      log.warn('No se pudieron guardar las tarifas actualizadas en este dispositivo', { error: err })
    }
    log.info(`Tarifas de estancia actualizadas a la versión ${TARIFAS_VERSION}`)
    return migradas
  }
  return stored
}

export function saveTarifas(tarifas) {
  localStorage.setItem('tarifas_canina', JSON.stringify(tarifas))
}

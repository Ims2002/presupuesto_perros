// Tarifas por defecto — se sobreescriben con lo guardado en localStorage
export const tarifasDefault = {
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
      diaNocheEntresemana: 40,
      diaFinSemana: 40,
      diaNocheFinSemana: 45,
      tardeNoche: 35,
    },
    {
      label: '3 Mascotas',
      diaEntresemana: 45,
      diaNocheEntresemana: 50,
      diaFinSemana: 50,
      diaNocheFinSemana: 55,
      tardeNoche: 40,
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
  try {
    const stored = localStorage.getItem('tarifas_canina')
    return stored ? JSON.parse(stored) : tarifasDefault
  } catch {
    return tarifasDefault
  }
}

export function saveTarifas(tarifas) {
  localStorage.setItem('tarifas_canina', JSON.stringify(tarifas))
}

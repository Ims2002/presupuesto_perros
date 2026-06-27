export const configDefault = {
  bizum: '+34 644159343',
  contactos: [
    { nombre: 'Rocio', telefono: '+34 644159343' },
    { nombre: 'Ivan', telefono: '+34 695955289' },
  ],
  email: 'guarderiacaninabenitachell@gmail.com',
  politicas: [
    /*'Politica de Reserva: Para confirmar una reserva, es necesario abonar el 50% del importe total antes del inicio del servicio.',
    'Politica de Cancelacion: En caso de cancelacion con menos de 48 horas de antelacion, se reembolsara unicamente el 50% del importe total de la reserva. En casos de enfermedad debidamente justificada o catastrofes naturales, se evaluara la posibilidad de reembolso completo.',
    'El incumplimiento de los horarios establecidos podra generar un cargo adicional al precio final del servicio.',*/
  ],
}

export function getConfig() {
  try {
    const s = localStorage.getItem('config_canina')
    return s ? JSON.parse(s) : configDefault
  } catch { return configDefault }
}

export function saveConfig(cfg) {
  localStorage.setItem('config_canina', JSON.stringify(cfg))
}

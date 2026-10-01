import { createLogger } from './logger'

const log = createLogger('http')

/**
 * fetch instrumentado: registra cada petición HTTP que hace el cliente de
 * la base de datos (método, ruta, estado y duración). Las respuestas con error
 * (>= 400) guardan también el cuerpo de la respuesta, que es donde
 * el servidor explica el motivo (permisos, restricción única, campo inválido...).
 * Un fallo de red ("Failed to fetch", proyecto pausado, sin cobertura) se
 * registra como aviso y se relanza tal cual.
 */
export async function fetchConLog(input, init = {}) {
  const method = (init.method || 'GET').toUpperCase()
  let ruta = typeof input === 'string' ? input : input?.url || String(input)
  try { const u = new URL(ruta); ruta = u.pathname + u.search } catch { /* ruta relativa */ }
  const start = performance.now()
  try {
    const res = await fetch(input, init)
    const ms = Math.round(performance.now() - start)
    if (res.status >= 400) {
      let cuerpo = ''
      try { cuerpo = await res.clone().text() } catch { /* cuerpo no legible */ }
      log.warn(`${method} ${res.status}`, { ruta, ms, cuerpo })
    } else {
      log.debug(`${method} ${res.status}`, { ruta, ms })
    }
    return res
  } catch (err) {
    // warn y no error: el cliente reintenta algunas peticiones y la capa de
    // datos (presupuestosRepo) registra el error definitivo una sola vez.
    log.warn(`${method} fallo de red`, { ruta, ms: Math.round(performance.now() - start), error: err, online: navigator.onLine })
    throw err
  }
}

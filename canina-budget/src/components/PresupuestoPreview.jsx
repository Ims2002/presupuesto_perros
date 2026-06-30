import { getConfig } from '../data/config'

/** Convierte "YYYY-MM-DD" a "DD/MM/YYYY" para mostrar en el documento. */
function fmt(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// Fuente tipográfica del documento imprimible
const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif"

/**
 * Paleta de colores del documento PDF.
 * Se centraliza aquí para poder cambiar el aspecto del presupuesto
 * modificando solo este objeto, sin tocar el JSX.
 */
const C = {
  cream: '#fdf9f5',       // fondo blanco crudo del documento
  tan: '#d8c9b5',         // bordes/separadores beige tostado
  title: '#3c2008',       // marron espresso oscuro - "PRESUPUESTO"
  body: '#2a1a08',        // texto principal, marron muy oscuro
  muted: '#9a8570',       // texto secundario, gris-marron calido
  totalBg: '#1c0e04',     // barra TOTAL, espresso profundo
  accent: '#a07848',      // "Datos del cliente:" - tono miel calido
  footerBg: '#f5ede0',    // fondo suave de la seccion de pago
}

/**
 * Genera y descarga el presupuesto como PDF.
 *
 * Flujo:
 *   1. Importa html2canvas y jsPDF de forma lazy (solo cuando el usuario pulsa
 *      "Descargar PDF") para no incrementar el bundle inicial de la app.
 *   2. Renderiza el div#print-area a un canvas con escala x2 (alta resolución).
 *   3. Calcula la altura proporcional de la imagen respecto al ancho A4.
 *   4. Si la imagen cabe en una sola página, la inserta directamente.
 *      Si no (presupuesto largo), la divide en páginas desplazando posY:
 *      en cada página se añade la imagen completa pero offset verticalmente
 *      para mostrar solo el fragmento correspondiente a esa página.
 *
 * @param {string} numero - Número del presupuesto, usado en el nombre del archivo.
 */
async function downloadPDF(numero) {
  const { default: html2canvas } = await import('html2canvas')
  const { default: jsPDF } = await import('jspdf')

  const el = document.getElementById('print-area')
  // scale: 2 → doble resolución para que el PDF no se vea pixelado al imprimir
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight()  // 297 mm
  // Altura de la imagen manteniendo la proporción del canvas al ancho A4
  const imgH = (canvas.height * pageW) / canvas.width

  let posY = 0
  if (imgH <= pageH) {
    // Caso simple: todo el contenido cabe en una página
    pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH)
  } else {
    // Caso multi-página: se repite la imagen completa desplazada hacia arriba
    // en cada página para "mostrar" el trozo correspondiente
    let remaining = imgH
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, -posY, pageW, imgH)
      remaining -= pageH
      posY += pageH
      if (remaining > 0) pdf.addPage()
    }
  }
  pdf.save(`presupuesto-${numero}.pdf`)
}

/**
 * Vista de previsualización del presupuesto generado.
 * Renderiza el documento con el estilo final y ofrece descargarlo como PDF.
 *
 * Props:
 *   presupuesto - Objeto con todos los datos del presupuesto
 *   onBack      - Callback para volver al formulario
 *   logoSrc     - (opcional) URL de imagen del logo; si no se pasa, muestra texto
 */
export default function PresupuestoPreview({ presupuesto, onBack, logoSrc }) {
  const { cliente, mascota, fechaInicio, fechaFin, lineas, notas, numero } = presupuesto
  const total = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)
  // cfg contiene bizum, contactos y políticas configurables desde data/config.js
  const cfg = getConfig()

  return (
    <div>
      {/* Barra de acciones — se oculta al imprimir con la clase no-print */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={onBack} style={{ fontSize: 13, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
          Volver al formulario
        </button>
        <button
          onClick={() => downloadPDF(numero)}
          style={{ fontSize: 13, padding: '9px 22px', background: C.totalBg, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, letterSpacing: '0.04em', fontFamily: FONT }}
        >
          Descargar PDF
        </button>
      </div>

      {/* Documento imprimible — html2canvas captura este div */}
      <div id="print-area" style={{ background: 'white', maxWidth: 680, margin: '0 auto', fontFamily: FONT, color: C.body, boxShadow: '0 2px 20px rgba(0,0,0,0.08)', borderRadius: 4 }}>

        {/* CABECERA: título + datos del cliente a la izquierda, logo/fechas/número a la derecha */}
        <div style={{ padding: '36px 44px 24px', borderBottom: `2px solid ${C.tan}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 42, fontWeight: 800, color: C.title, lineHeight: 1, letterSpacing: '-1.5px', textTransform: 'uppercase', fontFamily: FONT }}>
              Presupuesto
            </div>
            <div style={{ fontSize: 15, color: C.accent, marginTop: 8, fontWeight: 400 }}>
              Datos del cliente:{'  '}
              <span style={{ color: C.body, fontWeight: 600 }}>{cliente.nombre}</span>
              {mascota && <span style={{ fontWeight: 400, color: C.muted }}> &mdash; {mascota}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', paddingTop: 4 }}>
            {/* Si se pasa logoSrc se muestra la imagen; si no, texto con el nombre del negocio */}
            {logoSrc
              ? <img src={logoSrc} alt="Pet Hotel" style={{ width: 80, marginBottom: 6 }} />
              : (
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.15em', textTransform: 'uppercase', lineHeight: 1.5, fontFamily: FONT }}>
                  Pet Hotel<br />Guarderia Canina
                </div>
              )
            }
            {fechaInicio && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Entrada: {fmt(fechaInicio)}</div>}
            {fechaFin && <div style={{ fontSize: 11, color: C.muted }}>Salida: {fmt(fechaFin)}</div>}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>N.&deg; {numero}</div>
          </div>
        </div>

        {/* TABLA DE LÍNEAS */}
        <div style={{ padding: '4px 44px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 8px', borderBottom: `1px solid ${C.tan}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.body, letterSpacing: '0.01em' }}>Descripcion</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.body, letterSpacing: '0.01em' }}>Total</div>
          </div>

          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${C.tan}` }}>
              <div style={{ flex: 1, paddingRight: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.title, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  {l.descripcion}
                </div>
                {/* subfecha es la aclaración opcional (días concretos, etc.) */}
                {l.subfecha && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{l.subfecha}</div>
                )}
                {/* Solo muestra desglose precio/día cuando el precio no es null (no es "a consultar") */}
                {l.precioUnit !== null && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                    {l.precioUnit}EUR/dia &bull; {l.cantidad} {l.cantidad === 1 ? 'dia' : 'dias'}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.title, minWidth: 64, textAlign: 'right', paddingTop: 1 }}>
                {l.subtotal !== null ? `${l.subtotal.toFixed(0)}EUR` : 'Consultar'}
              </div>
            </div>
          ))}
        </div>

        {/* BARRA DE TOTAL */}
        <div style={{ margin: '28px 44px 0', background: C.totalBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 28px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: FONT }}>
            T O T A L :
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white', letterSpacing: '0.08em', fontFamily: FONT }}>
            {total.toFixed(0)} EUR
          </div>
        </div>

        {/* SECCIÓN PAGO + CONTACTO — datos configurable desde data/config.js */}
        <div style={{ display: 'flex', margin: '28px 44px 0', background: C.footerBg, padding: '20px 24px', borderRadius: 2 }}>
          <div style={{ flex: 1, paddingRight: 28, borderRight: `1px solid ${C.tan}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.title, marginBottom: 12, fontFamily: FONT }}>
              Informacion para el pago
            </div>
            <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.9, fontFamily: FONT }}>
              <span style={{ color: C.body, fontWeight: 600 }}>{cfg.bizum}</span><br />
              Mediante Bizum al numero o pago en metálico
            </div>
          </div>
          <div style={{ flex: 1, paddingLeft: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.title, marginBottom: 12, fontFamily: FONT }}>
              Datos de contacto
            </div>
            {cfg.contactos.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: C.muted, marginBottom: 6, fontFamily: FONT }}>
                {c.telefono} <span style={{ fontSize: 11 }}>({c.nombre})</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: FONT }}>{cfg.email}</div>
          </div>
        </div>

        {/* NOTAS — se renderizan con pre-line para respetar los saltos de línea del textarea */}
        {notas && (
          <div style={{ margin: '20px 44px 0', padding: '12px 16px', background: C.footerBg, borderLeft: `3px solid ${C.tan}`, fontSize: 12, color: C.muted, whiteSpace: 'pre-line', fontFamily: FONT }}>
            <strong style={{ display: 'block', marginBottom: 4, color: C.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notas</strong>
            {notas}
          </div>
        )}

        {/* POLÍTICAS — lista configurable desde data/config.js */}
        <div style={{ margin: '24px 44px 36px', borderTop: `1px solid ${C.tan}`, paddingTop: 16 }}>
          <ul style={{ margin: 0, padding: 0, paddingLeft: 16, fontSize: 11, color: C.muted, lineHeight: 1.8, fontFamily: FONT }}>
            {cfg.politicas.map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

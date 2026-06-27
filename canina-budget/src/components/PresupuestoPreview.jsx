import { getConfig } from '../data/config'

function fmt(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif"

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

async function downloadPDF(numero) {
  const { default: html2canvas } = await import('html2canvas')
  const { default: jsPDF } = await import('jspdf')

  const el = document.getElementById('print-area')
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgH = (canvas.height * pageW) / canvas.width

  let posY = 0
  if (imgH <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH)
  } else {
    // multi-pagina
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

export default function PresupuestoPreview({ presupuesto, onBack, logoSrc }) {
  const { cliente, mascota, fechaInicio, fechaFin, lineas, notas, numero } = presupuesto
  const total = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0)
  const cfg = getConfig()

  return (
    <div>
      {/* Barra de acciones */}
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

      {/* DOCUMENTO */}
      <div id="print-area" style={{ background: 'white', maxWidth: 680, margin: '0 auto', fontFamily: FONT, color: C.body, boxShadow: '0 2px 20px rgba(0,0,0,0.08)', borderRadius: 4 }}>

        {/* CABECERA */}
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

        {/* TABLA */}
        <div style={{ padding: '4px 44px 0' }}>
          {/* Cabecera tabla */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 8px', borderBottom: `1px solid ${C.tan}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.body, letterSpacing: '0.01em' }}>Descripcion</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.body, letterSpacing: '0.01em' }}>Total</div>
          </div>

          {/* Filas */}
          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${C.tan}` }}>
              <div style={{ flex: 1, paddingRight: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.title, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  {l.descripcion}
                </div>
                {l.subfecha && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{l.subfecha}</div>
                )}
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

        {/* TOTAL */}
        <div style={{ margin: '28px 44px 0', background: C.totalBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 28px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: FONT }}>
            T O T A L :
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white', letterSpacing: '0.08em', fontFamily: FONT }}>
            {total.toFixed(0)} EUR
          </div>
        </div>

        {/* PAGO + CONTACTO */}
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

        {/* Notas */}
        {notas && (
          <div style={{ margin: '20px 44px 0', padding: '12px 16px', background: C.footerBg, borderLeft: `3px solid ${C.tan}`, fontSize: 12, color: C.muted, whiteSpace: 'pre-line', fontFamily: FONT }}>
            <strong style={{ display: 'block', marginBottom: 4, color: C.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notas</strong>
            {notas}
          </div>
        )}

        {/* POLITICAS */}
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

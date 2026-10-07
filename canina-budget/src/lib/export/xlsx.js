/**
 * Generador mínimo de archivos Excel (.xlsx) sin dependencias.
 *
 * Un .xlsx es un ZIP con varios XML. Aquí se escriben esos XML y se empaquetan
 * con un ZIP sin compresión (método "store"), que Excel, LibreOffice, Numbers
 * y Google Sheets abren sin problema. Así no hay que añadir librerías al
 * proyecto (ni tocar package.json, que modifica el parche de PocketBase).
 *
 * Lo que soporta (lo justo para el extracto):
 *   - Varias hojas, anchos de columna, fila de cabecera fija y autofiltro
 *   - Fechas reales (Excel las puede ordenar y filtrar), importes en euros
 *   - Fórmulas SUMA en la fila de totales (con su valor ya calculado)
 *   - Celdas combinadas para títulos y ajuste de impresión a una página de ancho
 *
 * Celda: { v, t: 's' | 'n' | 'd' | 'f', s: estilo, f: 'SUM(E2:E9)' }
 *   t = 's' texto, 'n' número, 'd' fecha "YYYY-MM-DD", 'f' fórmula (v = valor calculado)
 */

// --- ZIP (store) ------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipStore(archivos) {
  const enc = new TextEncoder()
  const partes = []
  const central = []
  let offset = 0
  // Fecha/hora DOS fija (1/1/2026): no importa para Excel
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1

  for (const { nombre, contenido } of archivos) {
    const nombreB = enc.encode(nombre)
    const datos = typeof contenido === 'string' ? enc.encode(contenido) : contenido
    const crc = crc32(datos)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true)      // sin compresión
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, datos.length, true)
    local.setUint32(22, datos.length, true)
    local.setUint16(26, nombreB.length, true)
    local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nombreB, datos)

    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true)
    cen.setUint16(4, 20, true)
    cen.setUint16(6, 20, true)
    cen.setUint16(8, 0x0800, true)
    cen.setUint16(10, 0, true)
    cen.setUint16(12, dosTime, true)
    cen.setUint16(14, dosDate, true)
    cen.setUint32(16, crc, true)
    cen.setUint32(20, datos.length, true)
    cen.setUint32(24, datos.length, true)
    cen.setUint16(28, nombreB.length, true)
    cen.setUint32(42, offset, true)
    central.push(new Uint8Array(cen.buffer), nombreB)

    offset += 30 + nombreB.length + datos.length
  }

  const tamCentral = central.reduce((s, b) => s + b.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, archivos.length, true)
  fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamCentral, true)
  fin.setUint32(16, offset, true)

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)]
  const out = new Uint8Array(todo.reduce((s, b) => s + b.length, 0))
  let pos = 0
  for (const b of todo) { out.set(b, pos); pos += b.length }
  return out
}

// --- XLSX -------------------------------------------------------------------

/** Índices de estilo (cellXfs en styles.xml). */
export const ESTILO = {
  normal: 0, titulo: 1, negrita: 2, cabecera: 3, euros: 4, eurosTotal: 5,
  fecha: 6, gris: 7, pct: 8, totalTexto: 9, entero: 10, enteroTotal: 11,
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="1" fillId="2" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// Caracteres de control que invalidarían el XML (p. ej. pegados en una nota)
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g

function esc(s) {
  return String(s)
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Número de columna (0) → letra ("A"). */
export function colLetra(i) {
  let s = ''
  i += 1
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) }
  return s
}

/** "YYYY-MM-DD" → número de serie de Excel. */
function serialExcel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000
}

function celdaXml(ref, c) {
  if (c == null) return ''
  if (typeof c !== 'object') c = { v: c, t: typeof c === 'number' ? 'n' : 's' }
  const s = c.s ? ` s="${c.s}"` : ''
  if (c.t === 'f') return `<c r="${ref}"${s}><f>${esc(c.f)}</f>${c.v != null ? `<v>${c.v}</v>` : ''}</c>`
  if (c.v == null || c.v === '') return c.s ? `<c r="${ref}"${s}/>` : ''
  if (c.t === 'n') return `<c r="${ref}"${s}><v>${Number(c.v)}</v></c>`
  if (c.t === 'd') return `<c r="${ref}"${s}><v>${serialExcel(c.v)}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`
}

function hojaXml(h) {
  const filas = h.filas.map((fila, i) => {
    const r = i + 1
    const alto = h.altos?.[i] ? ` ht="${h.altos[i]}" customHeight="1"` : ''
    const celdas = (fila || []).map((c, j) => celdaXml(`${colLetra(j)}${r}`, c)).join('')
    return `<row r="${r}"${alto}>${celdas}</row>`
  }).join('')
  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const pane = h.fijarFilas
    ? `<pane ySplit="${h.fijarFilas}" topLeftCell="A${h.fijarFilas + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${h.fijarFilas + 1}" sqref="A${h.fijarFilas + 1}"/>`
    : ''
  const filtro = h.autofiltro ? `<autoFilter ref="${h.autofiltro}"/>` : ''
  const merges = h.combinar?.length
    ? `<mergeCells count="${h.combinar.length}">${h.combinar.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"${h.activa ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${filas}</sheetData>${filtro}${merges}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${h.vertical ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}

function nombreHoja(n) {
  return String(n).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Hoja'
}

/**
 * @param {Array<{nombre, filas: Celda[][], anchos?: number[], fijarFilas?: number, autofiltro?: string, combinar?: string[], vertical?: boolean}>} hojas
 * @returns {Uint8Array} contenido del .xlsx
 */
export function crearXlsx(hojas) {
  const nombres = hojas.map(h => nombreHoja(h.nombre))
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
    },
    {
      nombre: '_rels/.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${hojas.map((h, i) => h.autofiltro
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(nombres[i].replace(/'/g, "''"))}'!${h.autofiltro.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>`
        : '').join('')}</definedNames>
</workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nombre: 'xl/styles.xml', contenido: STYLES_XML },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml({ ...h, activa: i === 0 }) })),
  ]
  return zipStore(archivos)
}

# Cobros y extracto para el gestor

## Puesta en marcha (una sola vez)

1. **Supabase → SQL Editor**: pega y ejecuta `supabase_pagos.sql`. Añade la columna `pagos` (jsonb).
   Si se te olvida, la app avisa al intentar guardar un cobro ("Falta la columna pagos").
2. No hay dependencias nuevas: basta con `npm run dev` / volver a desplegar.

Si migras a PocketBase, `migracion-pocketbase/pb_schema.json` ya incluye el campo `pagos` y el
importador lo copia. El parche `cambios-codigo.patch` sigue aplicando igual.

## Uso

- **Historial → Cobrar**: eliges Banco (transferencia, Bizum, tarjeta) o Efectivo. La fecha (hoy)
  y el importe pendiente ya vienen rellenos: un toque en *Marcar como pagado*.
  - Señal + resto: botón *Señal 50 %* → *Registrar cobro*. Más tarde, *Cobrar resto*.
  - *Cobros* en un presupuesto pagado permite ver o quitar cobros.
  - Filtros: Todos / Pendientes de cobro / Pagados.
- **Extracto**: periodo (este mes, mes pasado, este trimestre, este año, últimos N días/semanas/meses o
  fechas exactas), forma de pago e IVA opcional. Se filtra por la **fecha del cobro**.

## Formatos (para probar con el gestor)

| Formato | Contenido |
|---|---|
| Excel completo (.xlsx) | Resumen por mes + hoja *Cobros* (una fila por cobro) + hoja *Por presupuesto*. Fechas y euros reales, totales con SUMA, filtros. |
| PDF · detalle de cobros | Imprimible: totales, resumen mensual y una línea por cobro. |
| PDF · por presupuesto | Una línea por presupuesto, separando banco y efectivo. |

**IVA:** por defecto se desglosa el **21 %** en todos los cobros, por banco y en efectivo.
Los importes cobrados se consideran con IVA incluido: base = importe / 1,21 y cuota = importe − base,
redondeado a céntimos en cada cobro. Se puede desactivar o cambiar el tipo en la pantalla del extracto.
El IVA no se guarda en la base de datos: se calcula al generar el extracto.

`muestras/` tiene los 3 formatos (con IVA 21 %) generados con **datos inventados**
(3.er trimestre 2026) para enseñárselos al gestor sin tocar datos reales.

## Datos: columna `pagos`

Tipo `jsonb`, nunca nula, valor por defecto `[]` (lista vacía = sin cobros). Una entrada por cobro:

```json
[
  { "id": "3f2b9c1e-8a4d-4f6b-9e21-7c0d5a1b2e34", "fecha": "2026-09-10", "importe": 60,
    "metodo": "banco", "nota": "Señal 50 %", "registrado": "2026-09-10T08:12:31.402Z" },
  { "id": "a81c7e02-5b3f-4d9a-8c64-1e2f3a4b5c6d", "fecha": "2026-09-14", "importe": 60,
    "metodo": "efectivo", "nota": "", "registrado": "2026-09-14T17:45:02.118Z" }
]
```

| Campo | Contenido |
|---|---|
| `id` | UUID generado en la app. Identifica el cobro para poder quitarlo. |
| `fecha` | Día del cobro, `AAAA-MM-DD`. Es la fecha que usa el extracto. Por defecto, hoy. |
| `importe` | Euros cobrados, IVA incluido, número con 2 decimales como máximo. |
| `metodo` | `"banco"` (transferencia, Bizum o tarjeta) o `"efectivo"`. |
| `nota` | Texto libre opcional; `""` si no hay. |
| `registrado` | Momento en que se apuntó en la app (UTC). Solo para control. |

No se guardan el IVA, la base, el estado (pendiente/parcial/pagado) ni totales: se calculan al vuelo.
Al guardar cobros se actualiza también `updated_at` del presupuesto; el resto de columnas no se toca.

El estado (pendiente / parcial / pagado) no se guarda: se calcula comparando lo cobrado con
el total, así que si editas el presupuesto se recalcula solo.

Código: `src/lib/cobros.js` (cálculos), `pagosRepo.js` (guardar), `periodos.js`, `extracto.js`,
`export/xlsx.js` (Excel sin librerías), `export/exportadores.js`, `components/CobroModal.jsx`,
`components/Extracto.jsx`.

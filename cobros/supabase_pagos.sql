-- Cobros de presupuestos (canina-budget)
-- Ejecutar UNA vez en Supabase: panel del proyecto → SQL Editor → pegar → Run.
-- Es seguro relanzarlo: no hace nada si la columna ya existe.

alter table public.presupuestos
  add column if not exists pagos jsonb not null default '[]'::jsonb;

-- Que la API vea la columna nueva al momento (si no, puede tardar un poco)
notify pgrst, 'reload schema';

-- Comprobación: debe devolver una fila con data_type = jsonb
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'presupuestos' and column_name = 'pagos';

-- ---------------------------------------------------------------------------
-- Consultas útiles (opcionales)
-- ---------------------------------------------------------------------------

-- Cobros de un periodo, uno por fila (lo mismo que la hoja "Cobros" del Excel):
-- select (p->>'fecha')::date as fecha_cobro, numero, cliente->>'nombre' as cliente,
--        p->>'metodo' as forma_pago, (p->>'importe')::numeric as importe
-- from presupuestos, jsonb_array_elements(pagos) as p
-- where (p->>'fecha')::date between '2026-07-01' and '2026-09-30'
-- order by 1, 2;

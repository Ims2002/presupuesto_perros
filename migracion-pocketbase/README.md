# Migración Supabase → PocketBase (canina-budget)

Todo lo necesario para pasar el historial de presupuestos de Supabase a PocketBase
en tu servidor. Probado contra **PocketBase v0.40.4** (vale cualquier v0.23 o posterior).

| Archivo | Para qué sirve |
|---|---|
| `exportar_supabase.mjs` | **Paso 1.** Copia de seguridad de la tabla `presupuestos` a `backup/*.json` |
| `pb_schema.json` | **Paso 2.** Definición de la colección `presupuestos` para importar en PocketBase |
| `importar_pocketbase.mjs` | **Paso 3.** Sube el JSON a PocketBase (sin duplicar si se relanza) |
| `cambios-codigo.patch` | **Paso 4.** Cambios de la app: `@supabase/supabase-js` → `pocketbase` |

Los scripts solo necesitan Node 18 o superior y no instalan nada.

---

## ⚠️ Ya: haz la copia de seguridad mientras Supabase está activo

Los proyectos gratuitos de Supabase se pausan tras unos días sin actividad (ese
fue el origen del `TypeError: Failed to fetch`). Desde la carpeta `presupuestos`:

```powershell
node migracion-pocketbase/exportar_supabase.mjs
```

Esto genera `migracion-pocketbase/backup/presupuestos_supabase_AAAA-MM-DD.json`.
Si luego se vuelve a pausar, ya tienes los datos y la migración no depende de Supabase.

---

## Paso 2 · Crear la colección en PocketBase

1. Entra en el panel: `https://TU-SERVIDOR/_/`
2. **Settings → Import collections** → pega el contenido de `pb_schema.json`.
3. Deja desmarcado *"Delete missing collections"* → **Review** → **Confirm**.

Qué crea:

- `numero` (texto, `"0001"`), `cliente` (JSON), `mascota`, `notas`, `dispositivo` (texto)
- `fecha_inicio` / `fecha_fin`: **texto `YYYY-MM-DD`**, igual que en Supabase. Así la app no
  necesita convertir fechas.
- `lineas` (JSON), `total` (número)
- `created_at` / `updated_at` (fecha): se rellenan desde la app y en la importación
  **conservan la fecha original**. Los `autodate` de PocketBase no se pueden fijar a mano.
- `supabase_id`: id original, para que la importación sea idempotente
- **Reglas de API públicas (`""`)**, equivalentes a lo que había con la clave pública
  de Supabase. Mira la sección *Seguridad* más abajo.

## Paso 3 · Importar los datos

```powershell
$env:PB_URL="https://TU-SERVIDOR"
$env:PB_EMAIL="email-superusuario"
$env:PB_PASSWORD="contraseña-superusuario"
node migracion-pocketbase/importar_pocketbase.mjs migracion-pocketbase/backup/presupuestos_supabase_AAAA-MM-DD.json --dry-run
node migracion-pocketbase/importar_pocketbase.mjs migracion-pocketbase/backup/presupuestos_supabase_AAAA-MM-DD.json
```

- `--dry-run` muestra lo que haría sin escribir.
- Si se corta a medias, vuelve a lanzarlo: salta los que ya existen (`Ya existían: N`).
- Si `total` venía vacío en registros antiguos, lo recalcula sumando los subtotales.

## Paso 4 · Cambiar la app a PocketBase

Desde la carpeta `presupuestos`, **en una rama nueva**:

```powershell
git switch -c migracion-pocketbase
git apply --check migracion-pocketbase/cambios-codigo.patch   # comprueba que aplica limpio
git apply migracion-pocketbase/cambios-codigo.patch
cd canina-budget
copy .env.example .env.local      # y edita VITE_PB_URL con la URL real
npm install                       # quita supabase-js e instala pocketbase
npm run dev
```

Qué cambia el parche (versión 2, 1-oct-2026, sobre el código con la corrección de
duplicados y el sistema de logs):

Desde esa corrección, todo el acceso a datos está en `src/lib/presupuestosRepo.js`.
Los componentes (`App.jsx`, `Historial.jsx`...) ya no conocen el backend, así que el
parche **solo toca la capa de datos**:

- `src/lib/supabase.js` → `src/lib/pocketbase.js`: lee la URL de `VITE_PB_URL` y pasa
  todas las peticiones por el registro HTTP (`httpLog.js`).
- `src/lib/presupuestosRepo.js`: mismas funciones con `pb.collection(...)` y las mismas
  protecciones contra duplicados:
  - id del borrador de 15 caracteres `[a-z0-9]` (formato de PocketBase). Un reenvío
    del mismo borrador no crea otro registro.
  - número calculado al guardar y reintento si el número ya existe.
  - 404 → error `SIN_FILAS` al editar o borrar un registro que ya no existe.
- Fechas de PocketBase (`"2026-09-25 10:00:00.000Z"`) normalizadas a ISO al listar,
  para que se vean bien en Safari/iPhone.
- `package.json` / `package-lock.json`: `@supabase/supabase-js` → `pocketbase@^0.28.1`.
- Nuevo `.env.example`. `.env.local` ya está en `.gitignore` (`*.local`).

Probado contra PocketBase v0.40.4 real con pruebas E2E (navegador): crear, volver y
reenviar, doble clic, respuesta perdida y reintento, número fresco con otro registro
creado entre medias, editar dos veces, borrar el registro abierto y marcar números
repetidos.

> El parche anterior (que modificaba `App.jsx` e `Historial.jsx`) ya no aplica sobre
> el código actual. Usa este.

**Opcional:** cuando hayas limpiado los números repetidos del historial, puedes hacer
único el índice de `numero` (en el panel: colección → *Indexes* → marcar *Unique*).
La app ya está preparada para reintentar con el siguiente número si choca.

## Checklist de despliegue

- [ ] PocketBase servido por **HTTPS**. Si la app está en HTTPS (Vercel), un PocketBase en
      `http://` se bloquea como *mixed content* y vuelve a dar `Failed to fetch`.
- [ ] Si la app está desplegada, define `VITE_PB_URL` también en las variables de
      entorno del hosting y vuelve a desplegar. Vite la incrusta al compilar.
- [ ] CORS: PocketBase acepta cualquier origen por defecto. Si lo arrancas con `--origins`,
      incluye el dominio de la app y `http://localhost:5173`.
- [ ] Copias de seguridad de PocketBase activadas (**Settings → Backups**), o copia periódica
      de `pb_data/`.
- [ ] Probar en móvil: crear, editar, ver PDF, borrar y buscar en el historial.
- [ ] Guarda una copia de `backup/*.json` fuera del repo. Contiene datos de clientes y
      el `.gitignore` de esta carpeta la excluye de git.

## Seguridad (decisión pendiente)

Con las reglas `""` cualquiera que conozca la URL puede leer, crear y **borrar**
presupuestos, igual que antes con la clave pública de Supabase. Para cerrarlo más adelante:

1. Crear un usuario en la colección `users` para el negocio.
2. Cambiar las 5 reglas de `presupuestos` a `@request.auth.id != ""`.
3. Añadir en la app una pantalla de login (`pb.collection('users').authWithPassword(...)`).
   El SDK guarda la sesión en `localStorage` automáticamente.

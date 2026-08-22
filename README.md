# SIRIO XVII

Sistema Integral de Registro, Indicadores y Operación. Gestiona **MINUME
XVII**, el modelo de Naciones Unidas escolar de la República Dominicana
bajo el MINERD y el PLE-RD (edición "de Estrellas"). Cubre personas y
organigrama, cuentas, permisos, calendario, tareas, evidencia fotográfica,
asistencia, espacios y plano, un tablero consolidado, y los catálogos y
configuración que sostienen todo lo anterior — más una ronda de corrección
de seguridad y bugs sobre esa base (migraciones `0019`–`0026`, ver
"Seguridad" abajo). El sistema **no está completo** frente al catálogo
maestro de 172 funcionalidades: evaluación por cortes, comisiones,
consolidados en tiempo real, reportes/exportación, croquis público,
planificación estratégica, hospedaje/regionales, auditoría completa y
acreditación de delegados siguen sin construirse — ver "Fuera de alcance".

Stack: HTML + CSS + JavaScript vanilla con módulos ES nativos. Sin
framework, sin paso de build. Páginas HTML reales por módulo, no una SPA
de una sola página — ver "Arquitectura" abajo. Supabase para datos,
autenticación, Storage y RLS. Deploy estático en Vercel. Todo en plan
gratuito.

## Arquitectura

Cada módulo es una página `.html` real, no una ruta de un router por hash.
`js/core/shell.js` centraliza el chrome compartido (header, nav, banner de
conexión, compuerta de sesión) para que ninguna página lo duplique a
mano; cada página solo declara los placeholders vacíos y llama a
`montarShell()`. `js/core/parametros.js` reemplaza los parámetros de ruta
del viejo router: las páginas de detalle usan query string
(`tarea.html?id=...`). Con 15 páginas, el header/nav móvil solo muestra
los destinos principales — todo lo de administración cuelga de un único
enlace "Admin" y su propia sub-navegación en cada página `admin-*.html`
(`pintarSubnavAdmin()` en `shell.js`).

## Estructura

```
/index.html · tablero.html · mis-tareas.html · calendario.html · actividad.html · tarea.html · bandeja.html
/organigrama.html · espacios.html · asistencia.html
/admin-personas.html · admin-cuentas.html · admin-catalogos.html · admin-configuracion.html · bitacora.html
/css/                 tokens.css · base.css · componentes.css · vistas.css
/js/config.js          URL y clave publicable de Supabase
/js/core/               supabase.js · sesion.js · shell.js · parametros.js · store.js
                        permisos.js (solo UI) · cola.js (avances sin red)
/js/paginas/            un bootstrap delgado por página (monta el shell, importa su módulo)
/js/modules/             la capa de render de cada pantalla
/js/ui/                  icono.js (único set de SVG) · modal · aviso · formulario · tabla
/js/utils/               fechas.js · formato.js · imagen.js (compresión de fotos)
/js/vendor/              supabase-js vendorizado, fijado a una versión exacta (ver "Seguridad")
/supabase/migrations/    esquema, funciones, RLS, reglas de negocio, V1 y datos de prueba
/supabase/functions/     crear-cuenta · restablecer-contrasena · alternar-cuenta · purgar-evidencia
```

## Correr en local

No hace falta build. `serve.json` desactiva las clean URLs (`.html`
explícito en todas partes, sin redirecciones que descarten query
strings):

```bash
npx serve .
```

Abre la URL que imprima y entra con una de las cuentas de prueba (las
contraseñas se te compartieron por separado, no viven en este repositorio).

## Cuentas de prueba

Un cargo por tipo, con jerarquía coherente: super admin → SG → SGA/SGL →
subsecretario → coordinador → voluntario, más una rama paralela (SGA
académica) para comprobar el aislamiento entre ramas.

| Correo | Cargo |
|---|---|
| tu correo real | Super admin |
| sg@minume.test | Secretaría General |
| sga@minume.test | Secretaría General Adjunta |
| sgl@minume.test | Secretaría General Logística |
| subsecretario@minume.test | Subsecretaría de Operaciones |
| coordinador@minume.test | Coordinación de Salón |
| voluntario@minume.test | Voluntariado de Salón |
| academica@minume.test / voluntario2@minume.test | Rama paralela SGA, para probar aislamiento |

Las cuentas se crean solo desde *Admin → Cuentas*, nunca por autoservicio.

## Seguridad

Toda regla de acceso vive en RLS y en triggers de Postgres, no en el
frontend — `js/core/permisos.js` solo oculta botones. El detalle está en
`/supabase/migrations`, en orden:

- `0001`–`0007` — Módulo 1: esquema, funciones (`cargo_actual()`,
  `es_descendiente()`, `es_ascendiente_de()`, `puede_asignar()`), RLS,
  reglas de negocio de tareas, semilla, y endurecimiento del linter.
- `0008` — bitácora de auditoría mínima (solo super admin y SG la leen) y
  el helper `es_evaluador_de()`.
- `0009` — personas y cargos: documento/foto, historial de titulares,
  `fn_sustituir_titular()` (reasigna tareas abiertas automáticamente
  porque apuntan a `cargos.id`, no a `personas.id`), y la escritura
  abierta a cualquier jefe de rama, no solo al super admin.
- `0010` — cuentas activas/desactivadas, `configuracion_sistema`,
  catálogo de subsecretarías.
- `0011` — estados de actividad alineados al catálogo (`ALTER TYPE ...
  RENAME VALUE`, sin reescritura de datos) y fases como catálogo.
- `0012` — historial de reasignación de tareas, capturado por trigger.
- `0013` — propiedades, tipos y estados de espacio, coordenadas de plano,
  asignaciones de personal a espacio.
- `0014` — evidencia fotográfica: bucket privado de Storage, tabla,
  trigger de aprobar/rechazar, purga.
- `0015` — asistencia: tolerancias de puntualidad, bloqueo de salida por
  corte abierto, anulación con motivo, vista de horas de servicio.
- `0016` — semillas de V1.
- `0017`–`0018` — endurecimiento: funciones de trigger cerradas a RPC
  directa, y dos RPCs pasadas a `security definer` porque llamaban a la
  función interna de bitácora (que `authenticated` no puede invocar
  directamente).
- `0019` — zona horaria única (`America/Santo_Domingo`) para
  `asistencia.fecha/hora`, y bloqueo de salida acotado por ventana de
  fecha y división en vez de global — ver "Zona horaria" abajo.
- `0020` — trigger `fn_validar_cambio_cargo()`: nadie salvo el super admin
  puede cambiar `tipo`, `superior_id` o `evaluador_id` de un cargo (antes
  cualquier jefe de rama podía auto-escalarse a `tipo='sg'` sobre su
  propio cargo), y bloquea ciclos en la jerarquía.
- `0021` — reescribe `v_horas_servicio`: empareja cada entrada con la
  primera salida posterior por `lateral join` en vez de cruzar todas las
  entradas con todas las salidas del mismo día (producía filas
  infladas).
- `0022` — política `personas_select_sin_cargo`: quien puede asignar ve
  también las personas recién creadas sin cargo, para poder asignarles
  uno.
- `0023`, `0026` — cargo activo seleccionable (ver "Modelo de cargos"
  abajo) y la política que permite a cada quien ver siempre sus propios
  cargos sin importar la rama.
- `0024` — vistas del tablero consolidado (`tablero.html`), todas
  `security_invoker`: el alcance de cada indicador lo decide la RLS de
  las tablas base, igual que `v_tareas`/`v_horas_servicio`.
- `0025` — corrige `search_path` mutable en los helpers de fecha/hora
  locales añadidos en `0019`.

Las únicas piezas que tocan la clave de servicio de Supabase son las
Edge Functions (`crear-cuenta`, `restablecer-contrasena`,
`alternar-cuenta`, `purgar-evidencia`): nunca viajan al navegador.

Además, `js/ui/tabla.js` escapa por defecto toda celda (dato crudo o lo
que devuelva `render()`); una columna solo se libra con `html: true`
explícito, y hoy son solo dos en todo el proyecto (`admin-personas.js` y
`bitacora.js`, ambas ya escapando a mano la parte que sí viene de la base
de datos). `js/ui/modal.js`, `aviso.js` y `formulario.js` escapan título,
mensaje y opciones de `<select>` de la misma forma. Antes de esto,
`documento`/`correo`/`telefono` en Personas y `lugar` en Asistencia
viajaban crudos a `innerHTML` — XSS almacenado explotable por cualquier
cuenta con `puede_asignar()`.

## Zona horaria

Toda fecha/hora de **operación** (asistencia, bloqueo de salida, el
tablero) usa `America/Santo_Domingo` como única referencia, nunca UTC —
vía `current_date_local()`/`current_time_local()` (`0019`). Antes,
`asistencia.fecha/hora` se evaluaban con `current_date`/`current_time`
del servidor (UTC): todo marcaje después de las 8pm hora RD quedaba con
la fecha del día siguiente. **Ningún módulo nuevo debe usar
`current_date`/`current_time`/`now()` a secas ni `new
Date().toISOString().slice(0,10)` en el frontend para obtener una fecha
calendario** — en JS existe `hoyISO()` (`js/utils/fechas.js`) para eso,
en SQL las dos funciones de arriba.

## Modelo de cargos

Una persona puede ocupar más de un cargo a la vez (típicamente dos roles
de mesa directiva en comisiones distintas). Se adoptó **cargo activo
seleccionable**, no unión de permisos: la tabla `cargo_activo` (`0023`)
guarda cuál cargo está en uso por cada usuario; `cargo_actual()` lo
respeta si hay uno guardado y sigue activo, y si no, cae al cargo más
antiguo de siempre — cero cambio para quien solo tiene un cargo, que es
la inmensa mayoría. El header muestra un conmutador (`<select>`) solo
cuando `sesion.cargos.length > 1`. Se descartó la alternativa de evaluar
permisos como unión de todos los cargos activos porque cada política RLS
recursiva (`es_descendiente`, `es_ascendiente_de`) pasaría de una CTE por
fila a N CTEs unidas — con 163 cargos, un costo de rendimiento real.

## Actualizar `supabase-js`

`js/core/supabase.js` importa desde `/js/vendor/supabase-js-<versión>.js`
en vez de `esm.sh` directo — una caída del CDN el día del evento ya no
tumba el sistema, y la versión queda fijada en vez de flotante. Para
actualizar:

1. Bajar el bundle de la versión nueva: `curl -s
   "https://esm.sh/@supabase/supabase-js@<versión>?bundle" -o /tmp/x.js`
   y revisar sus `import` — apuntan a rutas `/node/*.mjs` de esm.sh
   (polyfills de `process`/`buffer`/`events`/`tty`/`async_hooks`; el set
   exacto puede cambiar de una versión a otra).
2. Bajar recursivamente cada import hasta que no queden imports externos
   sin resolver (confirmar con `grep 'from"/'` sobre todos los archivos
   bajados).
3. Reescribir esos imports a rutas relativas locales (`./node-proceso.js`,
   etc.) y guardar todo en `/js/vendor/` con un nombre por archivo.
4. Actualizar el import en `supabase.js` a la ruta nueva y borrar la
   versión vieja.
5. Probar login real en el navegador antes de desplegar — no basta con
   que los archivos carguen sin error 404, hay que confirmar una consulta
   autenticada real contra Postgres (RLS incluida).

## Deploy

Conecta el repositorio a Vercel como proyecto estático (sin framework,
sin build command, `cleanUrls: false` — ver `vercel.json`). No hace falta
configurar variables de entorno: la clave publicable de Supabase vive en
`js/config.js` y está diseñada para ser pública, protegida por RLS.
`vercel.json` también define cabeceras de seguridad (`Content-Security-
Policy` sin `unsafe-inline` en scripts, `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) — si
se agrega un dominio externo nuevo (fuente, API, CDN), hay que sumarlo a
la CSP o el navegador lo bloquea en silencio.

## Fuera de alcance de esta ronda

Del catálogo maestro de 172 funcionalidades: evaluación por cortes
(rúbricas/pesos — las tablas base ya existen sin usar, ver
`criterios_evaluacion`/`evaluaciones`/`es_evaluador_de()`), comisiones
como estructura propia, consolidados en tiempo real, reportes y
exportación, croquis público, planificación estratégica, hospedaje y
regionales, auditoría completa (esta ronda solo tiene la bitácora
mínima), y acreditación de delegados. También quedan pendientes de una
ronda dedicada: paginación general de listas largas, densificación de
`mis-tareas`/`bandeja` a tablas con filtros persistentes en la URL,
Realtime, PWA, notificaciones internas, y una auditoría de accesibilidad
completa (foco de modal, ARIA, `prefers-reduced-motion`).

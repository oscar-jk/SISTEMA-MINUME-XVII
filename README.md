# SIRIO XVII

Sistema Integral de Registro, Indicadores y Operación. Gestiona **MINUME
XVII**, el modelo de Naciones Unidas escolar de la República Dominicana
bajo el MINERD y el PLE-RD (edición "de Estrellas"). Este es el V1
completo: personas y organigrama, cuentas, permisos, calendario, tareas,
evidencia fotográfica, asistencia, espacios y plano, y los catálogos y
configuración que sostienen todo lo anterior.

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
(`tarea.html?id=...`). Con 14 páginas, el header/nav móvil solo muestra
los destinos principales — todo lo de administración cuelga de un único
enlace "Admin" y su propia sub-navegación en cada página `admin-*.html`
(`pintarSubnavAdmin()` en `shell.js`).

## Estructura

```
/index.html · mis-tareas.html · calendario.html · actividad.html · tarea.html · bandeja.html
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

Las únicas piezas que tocan la clave de servicio de Supabase son las
Edge Functions (`crear-cuenta`, `restablecer-contrasena`,
`alternar-cuenta`, `purgar-evidencia`): nunca viajan al navegador.

## Deploy

Conecta el repositorio a Vercel como proyecto estático (sin framework,
sin build command, `cleanUrls: false` — ver `vercel.json`). No hace falta
configurar variables de entorno: la clave publicable de Supabase vive en
`js/config.js` y está diseñada para ser pública, protegida por RLS.

## Fuera de alcance de este V1

Todo lo etiquetado V1.1/V1.2/V1.3 en el catálogo maestro: comisiones y
croquis público, motor de evaluación por rúbricas, consolidados en tiempo
real, acreditación de delegados con QR, datos de salud/hospedaje/
regionales, reportes/exportación, matriz de planificación estratégica, y
la auditoría completa (esta ronda solo construyó la bitácora mínima).

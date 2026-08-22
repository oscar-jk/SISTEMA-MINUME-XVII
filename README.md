# MINUME XVII — Módulo 1: Calendario y gestión de tareas

Primer entregable funcional del sistema MINUME XVII (MINUME de Estrellas),
el modelo de Naciones Unidas escolar de la República Dominicana bajo el
MINERD y el PLE-RD. Este módulo cubre el ciclo diario del equipo
organizador: planificar una actividad, generar sus tareas, reportar
avances, aprobar y cerrar.

Stack: HTML + CSS + JavaScript vanilla con módulos ES nativos. Sin
framework, sin paso de build. Supabase para datos, autenticación y RLS.
Deploy estático en Vercel. Todo en plan gratuito.

## Estructura

```
/index.html              punto de entrada, shell de la app
/css/                     tokens.css · base.css · componentes.css · vistas.css
/js/config.js             URL y clave publicable de Supabase
/js/core/                 supabase.js · sesion.js · router.js · store.js
                          permisos.js (solo UI) · cola.js (avances sin red)
/js/modules/               calendario · actividad · tareas · tarea · bandeja · admin
/js/ui/                    icono.js (único set de SVG) · modal · aviso · formulario · tabla
/js/utils/                  fechas.js · formato.js
/supabase/migrations/       esquema, funciones, RLS, reglas de negocio y datos de prueba
/supabase/functions/        crear-cuenta (la única pieza que usa la clave de servicio)
```

## Correr en local

No hace falta build. Cualquier servidor estático sirve, por ejemplo:

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

Las cuentas se crean solo desde el panel de administración (pestaña
*Cuentas*), nunca por autoservicio.

## Seguridad

Toda regla de acceso vive en RLS y en triggers de Postgres, no en el
frontend — `js/core/permisos.js` solo oculta botones para mejorar la
experiencia. El detalle está en `/supabase/migrations`:

- `0001_esquema.sql` — tablas del sistema completo (solo este módulo tiene pantallas).
- `0002_funciones.sql` — `cargo_actual()`, `es_descendiente()`, `es_ascendiente_de()`, `puede_asignar()`.
- `0003_rls.sql` — políticas por tabla; cada quien ve su rama hacia abajo, nada más.
- `0004_reglas_negocio.sql` — un responsable no puede completar su propia tarea, el historial de avances es inmutable, despliegue de tareas y re-fechado en bloque.
- `0005_seed.sql` — datos de prueba.

La única pieza que toca la clave de servicio de Supabase es la Edge
Function `crear-cuenta`: nunca viaja al navegador.

## Deploy

Conecta el repositorio a Vercel como proyecto estático (sin framework,
sin build command — ver `vercel.json`). No hace falta configurar
variables de entorno: la clave publicable de Supabase vive en
`js/config.js` y está diseñada para ser pública, protegida por RLS.

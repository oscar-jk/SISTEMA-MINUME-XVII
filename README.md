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

## Identidad visual

Tipografía tomada de [plerd.minerd.gob.do](https://plerd.minerd.gob.do)
(el sitio del programa que sostiene a MINUME): **Barlow** para títulos
(peso 800, el mismo par de familias que usa PLERD) y **Public Sans**
para todo lo demás — reemplazan a Fraunces/Source Sans 3, y se conservan
sin cambios en la Ronda 2. El **color no se tomó de PLERD** (que usa
azul/morado/ámbar de una plantilla MUI genérica): SIRIO mantiene su
propio navy + dorado, ligado al nombre ("la estrella más brillante") y a
"MINUME de Estrellas" — decisión explícita, no un descuido.

Sistema de formas (Ronda 2, `css/tokens.css` y `css/componentes.css`):
el radio de esquina bajó de 8–12px a 2–4px (`--radio`/`--radio-chico`) y
`--sombra` se eliminó — la separación es por línea de 1px (`--rule`), no
por elevación. La escala tipográfica es propia (proporción 1.2 sobre
`--texto-base`), ya no la de Tailwind renombrada al español. Cada
concepto tiene su propia forma en vez de compartir la píldora de 999px
de antes: filtro = pestaña con subrayado (`.chip`), estado = etiqueta
rectangular con borde lateral de color (`.estado`), prioridad = marca
compacta sin relleno (`.prioridad`), progreso = barra recta con valor
tabular junto a ella (`.progreso-fila`), destino de navegación activo =
borde lateral, nunca relleno sólido (`.sidebar__enlace.activo`) — la
única forma con relleno sólido es un botón de acción.

El patrón de puntos genérico (login y header) se sustituyó por una
constelación real dibujada a mano en SVG (`index.html`,
`.pantalla-login__cielo`): 55 estrellas de fondo estáticas más 5 que
forman a SIRIO y sus vecinas, con un parpadeo lento solo en esas cinco
(`prefers-reduced-motion` lo desactiva). Se evaluaron librerías de
campo de estrellas (tsParticles con su preset `stars`, varios scripts
de starfield en canvas) pero se descartaron: cualquier dependencia
runtime externa reintroduce el mismo riesgo que motivó vendorizar
`supabase-js` (ver arriba) — el sistema debe seguir funcionando si un
CDN cae el día del evento — y para un solo elemento decorativo estático
no hay nada que una librería resuelva mejor que un SVG de ~60 líneas. La
barra lateral y las barras móviles no llevan el patrón de puntos:
son chrome persistente durante horas de trabajo real, no el lugar para
una decoración.

Stack: HTML + CSS + JavaScript vanilla con módulos ES nativos. Sin
framework, sin paso de build. Páginas HTML reales por módulo, no una SPA
de una sola página — ver "Arquitectura" abajo. Supabase para datos,
autenticación, Storage y RLS. Deploy estático en Vercel. Todo en plan
gratuito.

## Arquitectura

Cada módulo es una página `.html` real, no una ruta de un router por hash.
`js/core/shell.js` centraliza el chrome compartido (barra lateral, banner
de conexión, compuerta de sesión) para que ninguna página lo duplique a
mano; cada página solo declara los placeholders vacíos
(`#app-sidebar`, `#app-topbar-movil`, `#app-nav-inferior`,
`#app-drawer-fondo`, `#banner-conexion`) y llama a `montarShell()`.
`js/core/parametros.js` reemplaza los parámetros de ruta del viejo
router: las páginas de detalle usan query string (`tarea.html?id=...`).

Navegación (Ronda 2): barra lateral izquierda persistente, agrupada en
Operativo / Organización / Administración — un solo `ENLACES_NAV` con
`grupo`/`requiere`/`enBarraInferior` reemplaza los antiguos
`ENLACES_NAV`+`ENLACES_ADMIN` separados y la sub-navegación de chips por
página (`pintarSubnavAdmin()`, eliminada). Colapsable a solo-iconos en
escritorio (estado persistido en `localStorage`); en móvil se convierte
en panel deslizable con una barra inferior curada de 4-5 destinos
frecuentes. Es un único árbol de navegación en el DOM — CSS lo reposiciona
por viewport, no se monta dos veces. El filtrado por permiso
(`requiere: 'asignar' | 'admin'`) sigue siendo cosmético; la RLS es la
autoridad real. `registro.html` es la única excepción a "toda página
exige sesión" — ver "Acreditación de delegados" más abajo.

## Estructura

```
/index.html · tablero.html · checklist.html · mis-tareas.html · calendario.html · actividad.html · tarea.html · bandeja.html
/organigrama.html · espacios.html · asistencia.html · grupos-trabajo.html · solicitudes-ayuda.html
/admin-personas.html · admin-cuentas.html · admin-catalogos.html · admin-configuracion.html · admin-desarrollador.html · bitacora.html
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
- `0027` — catálogo `regionales` (18 filas), y `cargos.acceso_salud_acreditacion`
  sumado a la misma protección de `fn_validar_cambio_cargo()` que ya
  blindaba `tipo`/`superior_id`/`evaluador_id`.
- `0028` — `acreditados`/`acreditados_salud` (tabla de salud aparte, RLS
  mucho más estrecha), bucket de Storage `acreditacion`, tabla
  `acreditacion_intentos` para el límite de tasa — ver "Acreditación de
  delegados" abajo.
- `0029` — `regionales` con lectura pública (`anon`): el formulario de
  registro la necesita antes de iniciar sesión, que no tiene.
- `0030`-`0032` — normaliza `cargos.subsecretaria`/`comision` (texto
  libre) a FKs contra `subsecretarias`/`comisiones` — ver "Subsecretarías
  y comisiones" abajo.
- `0033` — `grupos_trabajo` (Bloque E), `cargos.grupo_trabajo_id`,
  `puede_gestionar_rama()` — ver "Grupos de trabajo" abajo.
- `0034` — bitácora en creación de `cargos`/`personas` (antes solo se
  auditaba el UPDATE de cargos).
- `0035` — Bloque A: `tareas.grupo_trabajo_id`, "toma voluntaria",
  `grupo_trabajo_actual()`, y cierra un hueco de autoridad en
  `cargos.grupo_trabajo_id` — ver "Tareas de equipo" abajo.
- `0036` — corrige `puede_ver_tarea()` (usada por `avances_select` e
  `historial_reasignacion_select`) para reconocer la misma rama de grupo
  que `0035` añadió a `tareas_select_rama` — encontrado probando en el
  navegador, no en el diseño: un miembro de grupo veía la tarea pero no su
  historial de avances ni de reasignación.
- `0037` — Bloque B: cierra tres fugas de visibilidad cruzada de rama
  (`personas_select_sin_cargo`, `subsecretarias`/`comisiones_select`,
  `acreditados_select`) y añade `solicitudes_ayuda` — ver "Solicitudes de
  ayuda y recorte de visibilidad" abajo. Añade `personas.creada_por`, lo
  que introdujo una segunda relación entre `cargos` y `personas` — todo
  embed `persona:personas(...)` que colgaba de una fila de `cargos` en
  todo el proyecto necesitó el hint `!cargos_persona_id_fkey` para seguir
  resolviendo sin ambigüedad (PGRST201).

Las únicas piezas que tocan la clave de servicio de Supabase son las
Edge Functions (`crear-cuenta`, `restablecer-contrasena`,
`alternar-cuenta`, `purgar-evidencia`, `registrar-acreditado`): nunca
viajan al navegador. `registrar-acreditado` es la única con
`verify_jwt: false` — su propia lógica de límite de tasa hace las veces
de protección, ver "Acreditación de delegados".

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

## Subsecretarías y comisiones

`cargos.subsecretaria`/`cargos.comision` eran texto libre desde el primer
día del esquema, sin FK — dos administradores podían escribir "Salones" y
"salones" y el sistema los trataba como ramas distintas (afectaba el
tablero, que agrupaba por ese texto, y la tolerancia de puntualidad, que
lo emparejaba por igualdad exacta de string). `0030`-`0032` lo normaliza:

- **SGA se organiza por comisiones**, no por subsecretarías — tabla
  `comisiones` (`id`, `codigo`, `nombre`, `activa`), sembrada con las 15
  reales del organigrama (CTD, PNUD, CSNU, ONUDC, CIJ, ONUDI, UNCTAD, OMT,
  CIME, COP31, AMS, FSCDH, OMA, CRPD, UNESCO Juventud y Deporte).
- **SG y SGL se organizan por subsecretarías** — la tabla `subsecretarias`
  (ya existía, `0010`) gana una columna `division` (`sg`/`sgl`, nunca
  `sga`). Se sembraron las 3 que reportan directo a SG (Planificación y
  Desarrollo, Comunicaciones y Relaciones Intercomisional, Tecnología de
  la Información); las 5 de SGL se cargan desde Admin → Catálogos cuando
  se confirmen sus nombres reales — **a propósito no se inventaron
  placeholders**.
- `cargos.subsecretaria_id`/`comision_id` (FK, mutuamente excluyentes)
  reemplazan el texto libre. Un trigger nuevo, `fn_validar_estructura_cargo`
  (`0030`, corre en INSERT y UPDATE, distinto de `fn_validar_cambio_cargo`
  que protege contra auto-escalada de privilegios), exige que `comision_id`
  solo se use con `division='sga'`, que `subsecretaria_id` solo se use con
  `division` en `('sg','sgl')` y que la `subsecretarias.division` de la
  fila elegida coincida con la del cargo.
- `tolerancias_puntualidad` recibió el mismo tratamiento
  (`subsecretaria_id`/`comision_id`, índices únicos parciales en vez del
  `unique` sobre texto de antes). El formulario en Admin → Configuración
  ya no puede usar `upsert({onConflict: 'subsecretaria'})` — un conflict
  target no puede llevar el predicado `WHERE` de un índice parcial vía
  PostgREST — así que hace un select-then-insert-or-update explícito.
- Los cargos y la fila `subsecretarias` sembrados antes de esta migración
  (`'Operaciones'`, `'Academica'`, `'Salones'` — datos de prueba, nunca
  correspondieron al organigrama real) quedaron sin catalogar a propósito:
  no había forma de remapear ese texto libre a una fila real sin
  inventar una, así que se dejaron con `subsecretaria_id`/`comision_id`
  en `null` en vez de borrarse.

## Panel de desarrollador y grupos de trabajo

Bloque E de la especificación funcional. Dos piezas:

**Panel de desarrollador** (`admin-desarrollador.html`, solo super admin):
crea persona + cargo + cuenta de acceso en un único flujo guiado, para los
perfiles de más alto nivel (SG/SGA/SGL y subsecretarios) — antes crear una
cuenta era un tercer paso desconectado en Cuentas, con un selector de
persona que no heredaba nada de lo ya escrito. Escrituras secuenciales
(persona → cargo → `crear-cuenta`), con el mismo estilo de mensaje de
error de `crearPersonaYAsignar()` en `admin-personas.js`: si un paso falla
a mitad de camino, el mensaje dice exactamente qué se guardó y dónde
terminar manualmente. `0034` audita las tres creaciones en `bitácora` —
antes ninguna de las tres se registraba, ni siquiera en el flujo cotidiano
de `admin-personas.js`.

**Grupos de trabajo** (`grupos-trabajo.html`, tabla `grupos_trabajo` —
`0033`): un grupo pertenece a una subsecretaría o comisión (nunca ambas,
nunca ninguna), tiene un espacio y un horario obligatorios, y sus miembros
son simplemente los cargos con `grupo_trabajo_id` apuntándole — **un cargo
pertenece a lo sumo un grupo**, sin tabla de unión; "tiene miembros" es
`select * from cargos where grupo_trabajo_id = X`. Extensible a
muchos-a-muchos después si hiciera falta, pero nada hoy lo necesita.

Quién puede crear/editar un grupo no es solo el super admin — es
`puede_gestionar_rama()`, una función nueva que autoriza a super admin o a
cualquier cargo `tipo='subsecretario'` que sea ascendiente (o el propio)
del grupo en cuestión. **Ojo con la trampa aquí**: `cargos.subsecretaria_id`/
`comision_id` puede estar poblado en cualquier cargo de la rama (no solo
en el del subsecretario — se denormaliza hacia abajo), y `es_descendiente()`
es auto-inclusivo. Una función que solo comprobara "¿hay algún cargo con
este subsecretaria_id en mi propio subárbol?" dejaría que un coordinador o
un voluntario se autorizara a sí mismo. La función exige además
`tipo='subsecretario'` en el cargo comparado — el único tipo que
representa "dueño de la rama" — para cerrar ese hueco.

El check-in (`asistencia.js`) ya no pide un `lugar` de texto libre: lee
`sesion.cargo.grupo_trabajo` (embebido en el `.select()` de `sesion.js`) y
muestra tres estados sin ida y vuelta al servidor — sin grupo (con el
contacto real del superior, también embebido), grupo inactivo, o grupo
activo con confirmación de un clic. La columna "Lugar" del historial cae
de vuelta al `lugar` de texto en las filas viejas si no hay
`grupo_trabajo_id` — sin necesidad de backfill.

**Nota de PostgREST para el que edite `sesion.js`**: embeber una relación
propia de una tabla consigo misma (`cargos.superior_id → cargos.id`) NO
usa la sintaxis `tabla!nombre_constraint` que sí funciona para relaciones
entre tablas distintas (como `grupos_trabajo!cargos_grupo_trabajo_id_fkey`,
necesaria aquí porque `cargos` y `grupos_trabajo` tienen dos FKs entre sí
— `cargos.grupo_trabajo_id` y `grupos_trabajo.creado_por` — y PostgREST no
puede adivinar cuál). Para la auto-referencia, hay que usar el nombre de
la columna directamente como alias de relación: `superior:superior_id(...)`.
Usar `cargos!superior_id(...)` compila pero resuelve la dirección
contraria (los subordinados, no el superior) sin ningún error — se
descubrió probando en el navegador con una sesión real, no leyendo la
documentación.

## Tareas de equipo (Bloque A)

Bloque A de la especificación funcional: un `grupos_trabajo` (Bloque E)
puede ser el destinatario de una tarea, y sus miembros la toman
voluntariamente en vez de que alguien la asigne uno por uno.
`tareas.grupo_trabajo_id` (`0035`) es nullable y sibling de
`responsable_cargo_id`: una tarea de grupo nace con `responsable_cargo_id
= null` (mismo patrón que `fn_desplegar_actividad` ya usaba para "hueco
vacante") hasta que alguien la toma.

**Quién puede dirigir una tarea a un grupo** no es `puede_asignar()` (el
conjunto amplio que ya crea tareas individuales — incluye coordinador) sino
`puede_gestionar_rama()`, la misma autoridad que ya gobierna crear el
grupo y su membresía (Bloque E). Decisión explícita: un coordinador sigue
creando tareas individuales como siempre, pero no puede dirigir trabajo al
grupo completo — eso es del subsecretario dueño de esa rama (o quien esté
por encima).

**Hallazgo de seguridad durante el diseño, corregido en la misma
migración**: `cargos.grupo_trabajo_id` (añadida en `0033`) nunca quedó
protegida por `fn_validar_cambio_cargo` — `cargos_update` (`0009`) solo
exige `puede_asignar() and es_descendiente(id)`, auto-inclusiva, así que
cualquier coordinador podía unirse a sí mismo a cualquier grupo de su
misma subsecretaría/comisión sin pasar por `puede_gestionar_rama()`
(`fn_validar_grupo_cargo`, `0033`, solo valida que el grupo sea de la
misma rama — consistencia referencial, no autoridad). Antes de este
bloque era inofensivo; con Bloque A, la membresía decide qué tareas ves y
puedes tomar — tan sensible como `tipo`/`superior_id`. Mismo patrón que
el bug que cerró `0020`. Se corrigió extendiendo `fn_validar_cambio_cargo`
para exigir `puede_gestionar_rama(new.subsecretaria_id, new.comision_id)`
en cualquier cambio de `grupo_trabajo_id`.

**Toma y liberación voluntaria** — `establecerResponsableGrupo()`
(`tareas.js`) hace un `.update()` directo sobre `tareas`, sin RPC
dedicada, gateado por dos capas (RLS decide qué filas se pueden tocar; un
trigger nuevo decide qué cambio es legal en esa fila — mismo reparto que
ya usa `fn_transicion_estado_tarea` con `progreso`):

- `tareas_update` gana una rama que deja tocar una fila de grupo sin
  responsable (para tomarla) o que ya tiene tomada quien la toca (para
  liberarla), acotado a `grupo_trabajo_actual()` (función nueva, mismo
  patrón que `superior_actual()`/`persona_visible()`, 0002).
- `fn_toma_voluntaria_tarea` (trigger) exige que la transición sea
  exactamente `null → yo` o `yo → null`, revalida la membresía contra
  `cargos` en vez de confiar en que la RLS ya filtró bien, y rechaza el
  cambio si cualquier otro campo se modifica en el mismo `UPDATE` — así
  nadie cuela un cambio de título/prioridad/fecha límite disfrazado de
  "tomar la tarea". Quien tiene autoridad real (supervisor de la tarea, un
  ascendiente suyo, o super admin) sigue reasignando con libertad total,
  sin esta restricción.
- Dos voluntarios tomando la misma tarea a la vez no necesita `FOR
  UPDATE` ni lock: Postgres re-evalúa `USING`/`WITH CHECK` contra la fila
  ya comprometida (`EvalPlanQual`, READ COMMITTED estándar) — el segundo
  simplemente afecta 0 filas, sin error. El frontend trata "0 filas
  devueltas" como "ya la tomaron", no como fallo.
- No hace falta una entrada nueva de bitácora: `historial_reasignacion_tarea`
  (`0012`) ya audita cualquier cambio de `responsable_cargo_id` sin
  importar qué trigger lo produjo — una toma queda como
  `(responsable, null, <quien tomó>, cambiado_por=<quien tomó>)`,
  distinguible de una reasignación manual porque `cargo_nuevo_id =
  cambiado_por`.

**Encontrado probando en el navegador, no en el diseño (`0036`)**:
`puede_ver_tarea()` — la función que gatea `avances_select` (`0003`) e
`historial_reasignacion_select` (`0012`) — nunca se actualizó junto con
`tareas_select_rama`. Resultado: un miembro de grupo veía la fila de la
tarea (por la rama nueva de `tareas_select_rama`) pero el historial de
avances y de reasignación se veían vacíos sin ningún error — ambas
consultas devuelven `[]` en silencio cuando RLS no encuentra filas, así
que no había ninguna pista en consola. Se corrigió añadiendo la misma
rama de grupo a `puede_ver_tarea()`, reutilizando `grupo_trabajo_actual()`.

Dónde se ve en la interfaz: `grupos-trabajo.js` gana un botón "Tareas" por
fila (modal con la lista + un formulario de creación visible solo si
`puedeGestionarEsteGrupo(sesion, grupo)`); `mis-tareas.html` gana una
sección "Tareas de mi grupo" debajo de la tabla personal, visible si
`sesion.cargo.grupo_trabajo_id` existe, con botón "Tomar"/"Liberar" por
fila; la ficha de una tarea (`tarea.html`) muestra "Grupo destinatario"
cuando aplica y el mismo botón. No hace falta página ni ruta nueva.

## Solicitudes de ayuda y recorte de visibilidad (Bloque B)

Bloque B de la especificación funcional, dos piezas (`0037`):

**Recorte de visibilidad.** Casi todo ya estaba acotado por rama (`cargos`,
`tareas`, `tablero`, `bandeja`, `organigrama` ya solo muestran la propia
rama hacia abajo vía RLS). Tres fugas reales cerradas:

- `personas_select_sin_cargo` (`0022`) dejaba ver a **cualquier**
  `puede_asignar()` (coordinador incluido) **todas** las personas sin
  cargo del evento entero, no solo las de su rama — se notaba en la lista
  de `admin-personas.js`. Se cierra con `es_gestor_de_rama()` (función
  nueva, espejo de `puedeGestionarRamas(sesion)`: super_admin/sg/sga/sgl/
  subsecretario, no coordinador) **o** `creada_por = cargo_actual()` —
  así quien crea una persona y falla el paso de asignarle cargo (el caso
  real que motivó la política en `0022`) sigue viéndola para terminar el
  flujo, sin reabrir la fuga para huérfanos ajenos. `personas.creada_por`
  se fija por trigger (`fn_fijar_creador_persona`), no por lo que mande el
  cliente — a diferencia de `tareas.creada_por`/`grupos_trabajo.creado_por`
  (puramente informativos), aquí sí decide una autorización.
- `subsecretarias_select`/`comisiones_select` eran `using (true)` —
  cualquiera veía el nombre de cualquier rama. Se acotan a
  `es_gestor_de_rama()` o la propia rama del cargo activo (necesario:
  `sesion.js` embebe el nombre de la propia subsecretaría/comisión, y
  PostgREST exige que esa fila pase la RLS de su propia tabla). **Trampa
  encontrada al diseñar esto**: `subsecretarias_escritura`/
  `comisiones_escritura` (`0010`/`0030`) eran `for all` — en Postgres el
  `using` de un `for all` también gatea SELECT como política permisiva
  adicional. Reemplazar solo `*_select` habría bajado la fuga de "todos" a
  `puede_asignar()` (coordinador incluido) sin cerrarla de verdad para el
  tier que se buscaba excluir. Se dividieron en `insert`/`update`/`delete`
  separadas, misma autoridad, sin ese efecto secundario sobre SELECT.
- `acreditados_select` (`verificar.html`) era `using (true)` — cualquier
  staff, no solo quien asigna. Se acota a `puede_asignar()`. **Cambio
  operativo real, no solo de datos**: el comentario original de `0028`
  documentaba esa apertura como deliberada para que un voluntario simple
  en la puerta pudiera verificar delegados — con este cambio, deja de
  poder hacerlo.

**Solicitudes de ayuda** (`solicitudes-ayuda.html`, tabla nueva
`solicitudes_ayuda`, sin precedente previo — no existía tabla, UI ni
mecanismo de notificación de ningún tipo en el proyecto). Cualquiera pide
ayuda escalando su propia cadena de supervisión (`destinatario_*` ambos
`null`); además, quien gestiona alguna rama puede dirigirla a una
subsecretaría/comisión distinta (`es_gestor_de_rama()` en el insert — un
coordinador pide ayuda, pero no "en nombre de su rama" hacia otra).
`puede_atender_solicitud_ayuda()` decide quién puede verla/resolverla:
sin destino, la cadena de supervisión completa hacia arriba
(`es_ascendiente_de(solicitante)`, no solo el superior directo, para que
no se atasque si ese superior no está disponible); con destino,
`puede_gestionar_rama()` sobre esa rama específica, sin relación con la
cadena del solicitante.

Mismo reparto que `fn_toma_voluntaria_tarea` (Bloque A): RLS decide qué
filas puede tocar cada quien, un trigger (`fn_transicion_solicitud_ayuda`)
decide con precisión qué cambia. **Hallazgo real durante el diseño**:
`es_ascendiente_de()` es auto-inclusiva, así que para una solicitud
escalada `puede_atender_solicitud_ayuda(mi_propio_id, null, null)`
también da `true` para el propio solicitante — un trigger que solo
comprobara "¿puede atenderla?" antes de "¿soy el solicitante?" habría
dejado que alguien resolviera su propia solicitud escalada. El chequeo de
identidad va primero y es excluyente. Estados terminales (`atendida`/
`descartada`) no aceptan más cambios salvo de super_admin; `atendida_por`/
`atendida_en` los fija siempre el servidor, y solo junto con el cambio de
`estado` en el mismo `UPDATE`, nunca por separado. Sin bitácora — la
tabla ya es su propio rastro completo, mismo criterio que
`historial_reasignacion_tarea` en Bloque A.

**Nota de PostgREST para quien toque `personas.creada_por`**: añadir esa
columna creó una SEGUNDA relación entre `cargos` y `personas` (la
original, `cargos.persona_id`, más esta nueva). Cualquier embed
`persona:personas(...)` colgado de una fila de `cargos` en cualquier
parte del proyecto se volvió ambiguo (`PGRST201`) hasta agregar el hint
`persona:personas!cargos_persona_id_fkey(...)` — rompió la carga de
sesión y una docena de módulos más, encontrado recién al probar en el
navegador después de aplicar la migración, no al diseñarla.

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

## Checklist

`checklist.html` es una vista transversal de todas las tareas visibles
para quien mira (no solo las propias, como Mis tareas), agrupadas por
fase del evento (`fases_actividad`, ya existente) con contador de
completadas por grupo y total. No es una tabla nueva ni un "hecho/no
hecho" aparte: reutiliza `tareas` tal cual, con las mismas funciones de
`permisos.js` y las mismas acciones (registrar avance, enviar a
revisión, aprobar/devolver) ya construidas en `tareas.js`/`bandeja.js`
— exportadas de ahí, no duplicadas. Nace de comparar SIRIO contra
`sistema-de-check-in-minume-xvii.vercel.app`, un prototipo de
acreditación/checklist para MINUME XVII que hoy no tiene backend real
(todo en `localStorage`, sin Supabase). El directorio de staff sí se sumó: pestaña "Directorio" en
`organigrama.html`, misma consulta que el árbol, buscable por nombre,
cargo, correo, subsecretaría o comisión, con correo/teléfono como
enlaces `mailto:`/`tel:`. El croquis en vivo también se sumó: pestaña
"En vivo" en `espacios.html`, calcula el estado de cada salón (en
sesión / próxima sesión / sesiones terminadas / libre) al vuelo contra
`actividades.hora_inicio/hora_fin` de hoy, sin campo de estado propio
que mantener sincronizado — se refresca solo cada 30s (`setInterval`,
limpiado al cambiar de pestaña o salir de la página). Decisión
explícita: refresco por sondeo, no Realtime — evita el presupuesto de
conexiones/mensajes que Realtime exige calcular por escrito antes de
implementarse (Bloque D, aún pendiente).

## Acreditación de delegados (SIRIO-ACR)

`registro.html` es la única página pública de todo el sistema — sin
`montarShell()`, sin sesión. Cualquiera con el enlace puede registrarse
como delegado, mesa directiva, prensa, staff, etc. (9 roles, distintos de
`tipo_cargo`: un delegado no tiene cargo en la jerarquía de MINUME).

**Arquitectura, con las decisiones tal como se confirmaron:**
- **Escritura**: la Edge Function pública `registrar-acreditado`
  (`verify_jwt: false`, la única del sistema sin JWT) hace todo el
  trabajo con `service_role` — nunca hay política de INSERT para `anon`
  ni `authenticated` en `acreditados`/`acreditados_salud`/Storage. Límite
  de tasa propio: máximo 5 envíos por IP cada 10 minutos, contra una
  tabla `acreditacion_intentos` con RLS activa y cero políticas (ni el
  propio cliente autenticado puede leerla).
- **Salud aparte**: `acreditados_salud` (diagnóstico, alergias, contacto
  de emergencia) es una tabla separada de `acreditados` con su propia
  RLS — solo super admin o un cargo con `acceso_salud_acreditacion = true`
  (columna nueva en `cargos`, protegida por el mismo trigger que ya
  blindaba `tipo`/`superior_id`/`evaluador_id` desde A1; se otorga desde
  *Admin → Personas y cargos*, pestaña Cargos). El certificado médico en
  Storage tiene la misma restricción — es en sí mismo un documento de
  salud.
- **QR**: codifica una URL (`verificar.html?c=<código>`), no datos
  personales — el propio teléfono del staff la escanea con su cámara
  nativa, sin necesitar un lector propio dentro de SIRIO. El código es
  aleatorio de 10 caracteres, alfabeto sin ambigüedad visual (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`,
  sin 0/O/1/I/L). Generado con
  [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator)
  vendorizado en `js/vendor/` (mismo criterio que `supabase-js`: se
  evaluó tsParticles y otras opciones con CDN, se descartaron por la
  misma razón).
- **Verificación en la puerta**: `verificar.html` (con sesión) — busca
  por código, muestra nombre/foto/estado, nunca datos de salud.
  Accesible a cualquier staff autenticado, no solo a quien asigna: el
  RLS de `acreditados` es de lectura abierta a `authenticated`.
- **Retención**: sin purga automática — son documentos de respaldo de
  una acreditación oficial, no evidencia operativa de una tarea.
- **Regionales**: catálogo nuevo (`regionales`, 18 filas R1–R18) con
  técnico regional y receptor de invitados por regional — administrable
  en *Admin → Catálogos → Regionales*, lectura pública (el formulario de
  registro los necesita sin sesión).
- **Revisión**: `admin-acreditacion.html` — aprobar/rechazar es
  `puede_asignar()`, igual que el resto del sistema.

## Fuera de alcance de esta ronda

Del catálogo maestro de 172 funcionalidades: evaluación por cortes
(rúbricas/pesos — las tablas base ya existen sin usar, ver
`criterios_evaluacion`/`evaluaciones`/`es_evaluador_de()`), poblar los
cargos reales de cada comisión/subsecretaría (el catálogo de las 15
comisiones y las 3+5 subsecretarías ya existe — ver "Subsecretarías y
comisiones" — pero los cargos concretos de cada una todavía no se cargan;
eso depende del panel de desarrollador y grupos de trabajo), consolidados
en tiempo real, reportes y exportación, croquis público (vista de solo
lectura del plano sin sesión — el croquis en vivo actual sí exige login), planificación
estratégica, hospedaje detallado más allá de lo que ya captura
acreditación (número de habitación/compañero/líder de edificio), y
auditoría completa (esta ronda solo tiene la bitácora mínima). También
quedan pendientes de una ronda dedicada: paginación general de listas
largas, densificación de
`mis-tareas`/`bandeja` a tablas con filtros persistentes en la URL,
Realtime, PWA, notificaciones internas, y una auditoría de accesibilidad
completa (foco de modal, ARIA, `prefers-reduced-motion`).

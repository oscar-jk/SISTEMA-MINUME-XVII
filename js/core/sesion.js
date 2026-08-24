// Sesión: login por correo + código de acceso, sin registro público.
import { supabase } from './supabase.js';
import { set, getEstado } from './store.js';

async function cargarPerfil(userId) {
  const { data: usuario, error: eu } = await supabase
    .from('usuarios')
    .select('persona_id, es_super_admin, personas(nombre, apellido, correo)')
    .eq('id', userId)
    .single();

  if (eu || !usuario) {
    throw new Error('Esta cuenta no tiene un perfil asignado en MINUME XVII. Contacta al administrador.');
  }

  // cargo_actual() (RLS, ver 0023) ya resuelve cuál de los cargos de esta
  // persona está activo — se le pregunta directamente en vez de repetir su
  // lógica aquí, para no poder desincronizarse de lo que la base decide.
  const [{ data: cargos, error: ec }, { data: idActivo, error: eActivo }] = await Promise.all([
    supabase
      .from('cargos')
      .select(`
        id, nombre, tipo, division, superior_id, acceso_salud_acreditacion,
        subsecretaria_id, comision_id,
        subsecretaria:subsecretarias(nombre), comision:comisiones(nombre),
        grupo_trabajo_id,
        grupo_trabajo:grupos_trabajo!cargos_grupo_trabajo_id_fkey(nombre, hora_inicio, hora_fin, activo, espacio:espacios(nombre)),
        superior:superior_id(nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido, telefono, correo))
      `)
      .eq('persona_id', usuario.persona_id)
      .eq('activo', true)
      .order('creado_en'),
    supabase.rpc('cargo_actual'),
  ]);

  if (ec) throw ec;
  if (eActivo) throw eActivo;
  if (!cargos || cargos.length === 0) {
    throw new Error('Esta persona no tiene un cargo activo asignado. Contacta al administrador.');
  }

  const cargo = cargos.find((c) => c.id === idActivo) ?? cargos[0];

  return {
    persona: usuario.personas,
    esSuperAdmin: usuario.es_super_admin,
    cargo,
    cargos,
  };
}

// Un único punto de verdad: onAuthStateChange dispara con INITIAL_SESSION
// tan pronto se registra (con la sesión persistida o null), y luego con
// cada SIGNED_IN / SIGNED_OUT posterior. Registrarlo condicionalmente al
// resultado de un getSession() previo (como se hacía antes) deja al primer
// login del formulario sin nadie escuchando: la sesión queda persistida en
// el navegador pero la app nunca se entera hasta que alguien recarga.
export async function iniciar() {
  set({ cargando: true });
  supabase.auth.onAuthStateChange(async (_evento, nuevaSesion) => {
    if (!nuevaSesion) {
      set({ sesion: null, cargando: false, errorSesion: null });
      return;
    }
    try {
      const perfil = await cargarPerfil(nuevaSesion.user.id);
      set({ sesion: { user: nuevaSesion.user, ...perfil }, cargando: false, errorSesion: null });
    } catch (err) {
      console.error(err);
      set({ sesion: null, cargando: false, errorSesion: err.message });
    }
  });
}

export async function iniciarSesion(correo, codigoAcceso) {
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: codigoAcceso,
  });
  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      throw new Error('Correo o código de acceso incorrecto.');
    }
    throw error;
  }
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  set({ sesion: null });
}

// Solo relevante para quien ocupa más de un cargo a la vez (ver 0023) — el
// conmutador en shell.js solo se muestra cuando sesion.cargos.length > 1.
export async function cambiarCargoActivo(cargoId) {
  const { error } = await supabase.rpc('fn_establecer_cargo_activo', { p_cargo: cargoId });
  if (error) throw error;
  const { sesion } = getEstado();
  const perfil = await cargarPerfil(sesion.user.id);
  set({ sesion: { user: sesion.user, ...perfil } });
}

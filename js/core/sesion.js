// Sesión: login por correo + código de acceso, sin registro público.
import { supabase } from './supabase.js';
import { set } from './store.js';

async function cargarPerfil(userId) {
  const { data: usuario, error: eu } = await supabase
    .from('usuarios')
    .select('persona_id, es_super_admin, personas(nombre, apellido, correo)')
    .eq('id', userId)
    .single();

  if (eu || !usuario) {
    throw new Error('Esta cuenta no tiene un perfil asignado en MINUME XVII. Contacta al administrador.');
  }

  const { data: cargo, error: ec } = await supabase
    .from('cargos')
    .select('id, nombre, tipo, division, subsecretaria, comision, superior_id')
    .eq('persona_id', usuario.persona_id)
    .eq('activo', true)
    .order('creado_en')
    .limit(1)
    .maybeSingle();

  if (ec) throw ec;
  if (!cargo) {
    throw new Error('Esta persona no tiene un cargo activo asignado. Contacta al administrador.');
  }

  return {
    persona: usuario.personas,
    esSuperAdmin: usuario.es_super_admin,
    cargo,
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

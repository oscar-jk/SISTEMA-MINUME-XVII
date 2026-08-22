// Activa o desactiva una cuenta sin borrar nada: el historial de la
// persona se conserva íntegro (ítem 18). Solo super admin.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const autorizacion = req.headers.get('Authorization') ?? '';
  const clienteLlamador = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user }, error: errUsuario } = await clienteLlamador.auth.getUser();
  if (errUsuario || !user) return json({ error: 'No autenticado.' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: perfilLlamador, error: errPerfil } = await admin
    .from('usuarios')
    .select('es_super_admin, persona_id')
    .eq('id', user.id)
    .single();

  if (errPerfil || !perfilLlamador?.es_super_admin) {
    return json({ error: 'Solo el super admin puede activar o desactivar cuentas.' }, 403);
  }

  const { data: cargoLlamador } = await admin
    .from('cargos')
    .select('id')
    .eq('persona_id', perfilLlamador.persona_id)
    .eq('activo', true)
    .maybeSingle();

  let cuerpo: { usuario_id?: string; activar?: boolean };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400);
  }

  const { usuario_id, activar } = cuerpo;
  if (!usuario_id || typeof activar !== 'boolean') {
    return json({ error: 'Falta el usuario o el estado deseado.' }, 400);
  }

  const { error: errBan } = await admin.auth.admin.updateUserById(usuario_id, {
    ban_duration: activar ? 'none' : '876000h',
  });
  if (errBan) return json({ error: errBan.message }, 400);

  const { error: errUpdate } = await admin
    .from('usuarios')
    .update({ activa: activar, desactivada_en: activar ? null : new Date().toISOString() })
    .eq('id', usuario_id);
  if (errUpdate) return json({ error: errUpdate.message }, 400);

  await admin.from('bitacora').insert({
    tabla: 'usuarios',
    registro_id: usuario_id,
    accion: activar ? 'cuenta_reactivada' : 'cuenta_desactivada',
    cargo_id: cargoLlamador?.id ?? null,
  });

  return json({ ok: true });
});

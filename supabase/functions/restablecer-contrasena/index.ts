// Restablece el código de acceso de una cuenta existente. Solo super admin.
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
    .select('es_super_admin')
    .eq('id', user.id)
    .single();

  if (errPerfil || !perfilLlamador?.es_super_admin) {
    return json({ error: 'Solo el super admin puede restablecer contraseñas.' }, 403);
  }

  let cuerpo: { usuario_id?: string; codigo_acceso?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400);
  }

  const { usuario_id, codigo_acceso } = cuerpo;
  if (!usuario_id || !codigo_acceso) {
    return json({ error: 'Falta el usuario o el código de acceso.' }, 400);
  }
  if (codigo_acceso.length < 8) {
    return json({ error: 'El código de acceso debe tener al menos 8 caracteres.' }, 400);
  }

  const { error: errUpdate } = await admin.auth.admin.updateUserById(usuario_id, {
    password: codigo_acceso,
  });
  if (errUpdate) return json({ error: errUpdate.message }, 400);

  return json({ ok: true });
});

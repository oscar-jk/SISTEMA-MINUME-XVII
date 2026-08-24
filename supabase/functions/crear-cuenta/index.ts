// Crea una cuenta de acceso (correo + código de acceso) para una persona que
// ya existe en el sistema. Es el único lugar donde se usa la clave de
// servicio: nunca viaja al navegador. Solo el super admin puede invocarla.
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
    return json({ error: 'Solo el super admin puede crear cuentas.' }, 403);
  }

  // Resuelve el cargo de quien llama para atribuirle la bitácora — el
  // cliente service-role no tiene auth.uid(), así que cargo_actual() no
  // sirve aquí (mismo patrón que alternar-cuenta/index.ts).
  const { data: cargoLlamador } = await admin
    .from('cargos')
    .select('id')
    .eq('persona_id', perfilLlamador.persona_id)
    .eq('activo', true)
    .maybeSingle();

  let cuerpo: { correo?: string; codigo_acceso?: string; persona_id?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400);
  }

  const { correo, codigo_acceso, persona_id } = cuerpo;
  if (!correo || !codigo_acceso || !persona_id) {
    return json({ error: 'Faltan correo, código de acceso o persona.' }, 400);
  }
  if (codigo_acceso.length < 8) {
    return json({ error: 'El código de acceso debe tener al menos 8 caracteres.' }, 400);
  }

  const { data: persona, error: errBuscarPersona } = await admin
    .from('personas')
    .select('id')
    .eq('id', persona_id)
    .single();
  if (errBuscarPersona || !persona) return json({ error: 'La persona no existe.' }, 404);

  const { data: yaTiene } = await admin
    .from('usuarios')
    .select('id')
    .eq('persona_id', persona_id)
    .maybeSingle();
  if (yaTiene) return json({ error: 'Esa persona ya tiene una cuenta de acceso.' }, 409);

  const { data: nuevoUsuario, error: errCrear } = await admin.auth.admin.createUser({
    email: correo,
    password: codigo_acceso,
    email_confirm: true,
  });
  if (errCrear || !nuevoUsuario?.user) {
    return json({ error: errCrear?.message || 'No se pudo crear la cuenta.' }, 400);
  }

  const { error: errEnlace } = await admin
    .from('usuarios')
    .insert({ id: nuevoUsuario.user.id, persona_id, es_super_admin: false });

  if (errEnlace) {
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return json({ error: errEnlace.message }, 400);
  }

  await admin.from('bitacora').insert({
    tabla: 'usuarios',
    registro_id: nuevoUsuario.user.id,
    accion: 'cuenta_creada',
    cargo_id: cargoLlamador?.id ?? null,
    detalle: { persona_id, correo },
  });

  return json({ ok: true, user_id: nuevoUsuario.user.id });
});

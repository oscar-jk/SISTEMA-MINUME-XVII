// Borra las fotos de evidencia ya revisadas (ventana rodante o rango
// manual): quita el objeto real de Storage y limpia foto_path en la
// tabla. reporte/estado/puntaje sobreviven — solo la imagen se purga.
// Solo super admin.
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
    return json({ error: 'Solo el super admin puede purgar evidencia.' }, 403);
  }

  const { data: cargoLlamador } = await admin
    .from('cargos')
    .select('id')
    .eq('persona_id', perfilLlamador.persona_id)
    .eq('activo', true)
    .maybeSingle();

  let cuerpo: { modo?: 'ventana' | 'rango'; desde?: string; hasta?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400);
  }

  let desde: string;
  const hasta = cuerpo.hasta || new Date().toISOString().slice(0, 10);

  if (cuerpo.modo === 'rango') {
    if (!cuerpo.desde) return json({ error: 'Falta la fecha de inicio del rango.' }, 400);
    desde = cuerpo.desde;
  } else {
    const { data: config } = await admin
      .from('configuracion_sistema')
      .select('valor')
      .eq('clave', 'evidencia_ventana_purga_dias')
      .single();
    const dias = Number(config?.valor ?? 90);
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dias);
    desde = fecha.toISOString().slice(0, 10);
  }

  const { data: candidatas, error: errBuscar } = await admin
    .from('evidencias')
    .select('id, foto_path')
    .not('foto_path', 'is', null)
    .gte('creada_en', `${desde}T00:00:00`)
    .lte('creada_en', `${hasta}T23:59:59`);

  if (errBuscar) return json({ error: errBuscar.message }, 400);
  if (!candidatas || candidatas.length === 0) return json({ ok: true, purgadas: 0 });

  const rutas = candidatas.map((e) => e.foto_path as string);
  const { error: errStorage } = await admin.storage.from('evidencias').remove(rutas);
  if (errStorage) return json({ error: errStorage.message }, 400);

  const ids = candidatas.map((e) => e.id);
  const { error: errUpdate } = await admin
    .from('evidencias')
    .update({ foto_path: null, purgada_en: new Date().toISOString() })
    .in('id', ids);
  if (errUpdate) return json({ error: errUpdate.message }, 400);

  await admin.from('bitacora').insert({
    tabla: 'evidencias',
    registro_id: null,
    accion: 'evidencia_purgada',
    cargo_id: cargoLlamador?.id ?? null,
    detalle: { desde, hasta, filas: ids.length },
  });

  return json({ ok: true, purgadas: ids.length });
});

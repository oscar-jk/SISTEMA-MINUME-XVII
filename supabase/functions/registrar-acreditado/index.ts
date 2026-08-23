// Registro público de acreditación (SIRIO-ACR) — la única ruta de todo
// el sistema que no exige sesión. Protecciones propias en vez de JWT:
// límite de intentos por IP (acreditacion_intentos, sin RLS accesible
// desde el cliente) y validación de campos en el servidor. Escribe con
// service_role, igual que crear-cuenta/alternar-cuenta/purgar-evidencia
// — la clave de servicio nunca sale de aquí.
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

const ROLES_VALIDOS = new Set([
  'delegado_nacional', 'mesa_directiva', 'tecnico_docente', 'secretaria_general',
  'subsecretaria', 'staff', 'equipo_logistico', 'prensa_clit', 'invitado_especial',
]);

// Sin 0/O, 1/I/L ni otros caracteres ambiguos — el código se lee a mano
// cuando el QR no escanea.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generarCodigoQr(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
}

async function hashIp(ip: string): Promise<string> {
  const datos = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Límite de tasa: máximo 5 envíos por IP cada 10 minutos.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconocida';
  const ipHash = await hashIp(ip);
  const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('acreditacion_intentos')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('creado_en', hace10min);
  if ((count ?? 0) >= 5) {
    return json({ error: 'Demasiados intentos desde esta conexión. Espera unos minutos e intenta de nuevo.' }, 429);
  }
  await admin.from('acreditacion_intentos').insert({ ip_hash: ipHash });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Formulario inválido.' }, 400);
  }

  const texto = (clave: string) => (form.get(clave)?.toString().trim() || null);

  const rol = texto('rol');
  const nombre = texto('nombre');
  const apellido = texto('apellido');
  if (!rol || !ROLES_VALIDOS.has(rol)) return json({ error: 'El rol no es válido.' }, 400);
  if (!nombre || !apellido) return json({ error: 'Falta nombre o apellido.' }, 400);

  const foto = form.get('foto');
  const certificado = form.get('certificado');
  if (!(certificado instanceof File) || certificado.size === 0) {
    return json({ error: 'El certificado médico es obligatorio para todos los roles.' }, 400);
  }
  if (certificado.size > 8 * 1024 * 1024) {
    return json({ error: 'El certificado médico no puede pesar más de 8MB.' }, 400);
  }

  const edadTexto = texto('edad');
  const edad = edadTexto ? Number(edadTexto) : null;
  if (edadTexto && (!Number.isFinite(edad) || (edad as number) < 0 || (edad as number) > 120)) {
    return json({ error: 'La edad no es válida.' }, 400);
  }

  let regionalId: string | null = null;
  const regionalCodigo = texto('regional');
  if (regionalCodigo && regionalCodigo !== 'N/A') {
    const { data: regional } = await admin.from('regionales').select('id').eq('codigo', regionalCodigo).maybeSingle();
    regionalId = regional?.id ?? null;
  }

  let codigoQr = generarCodigoQr();
  for (let intentos = 0; intentos < 5; intentos++) {
    const { data: existe } = await admin.from('acreditados').select('id').eq('codigo_qr', codigoQr).maybeSingle();
    if (!existe) break;
    codigoQr = generarCodigoQr();
  }

  const { data: acreditado, error: errInsert } = await admin.from('acreditados').insert({
    codigo_qr: codigoQr,
    rol,
    nombre,
    apellido,
    edad,
    telefono: texto('telefono'),
    correo: texto('correo'),
    regional_id: regionalId,
    centro_educativo: texto('centro_educativo'),
    numero_habitacion: texto('numero_habitacion'),
    companero_habitacion: texto('companero_habitacion'),
    lider_edificio: texto('lider_edificio'),
  }).select('id').single();

  if (errInsert || !acreditado) {
    return json({ error: errInsert?.message || 'No se pudo registrar. Intenta de nuevo.' }, 400);
  }

  async function deshacer() {
    await admin.storage.from('acreditacion').remove([`${acreditado!.id}/foto.jpg`, `${acreditado!.id}/certificado.pdf`]);
    await admin.from('acreditados').delete().eq('id', acreditado!.id);
  }

  let fotoSubida = false;
  if (foto instanceof File && foto.size > 0) {
    const { error: errFoto } = await admin.storage.from('acreditacion')
      .upload(`${acreditado.id}/foto.jpg`, foto, { contentType: foto.type || 'image/jpeg' });
    if (errFoto) { await deshacer(); return json({ error: 'No se pudo subir la foto.' }, 400); }
    fotoSubida = true;
  }

  const { error: errCert } = await admin.storage.from('acreditacion')
    .upload(`${acreditado.id}/certificado.pdf`, certificado, { contentType: 'application/pdf' });
  if (errCert) { await deshacer(); return json({ error: 'No se pudo subir el certificado médico.' }, 400); }

  const { error: errSalud } = await admin.from('acreditados_salud').insert({
    acreditado_id: acreditado.id,
    diagnostico: texto('diagnostico'),
    alergias: texto('alergias'),
    tratamiento: texto('tratamiento'),
    contacto_emergencia: texto('contacto_emergencia'),
    telefono_emergencia: texto('telefono_emergencia'),
  });
  if (errSalud) { await deshacer(); return json({ error: 'No se pudo guardar la información de salud.' }, 400); }

  await admin.from('acreditados').update({
    foto_path: fotoSubida ? `${acreditado.id}/foto.jpg` : null,
    certificado_medico_path: `${acreditado.id}/certificado.pdf`,
  }).eq('id', acreditado.id);

  return json({ ok: true, codigo_qr: codigoQr, acreditado_id: acreditado.id });
});

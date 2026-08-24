// Llamador genérico de Edge Functions — adjunta el token de la sesión
// actual como Bearer. Compartido por cualquier módulo que necesite tocar
// una función que use la clave de servicio (crear-cuenta,
// restablecer-contrasena, alternar-cuenta, purgar-evidencia...).
import { supabase } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export async function llamarFuncion(nombre, cuerpo) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(cuerpo),
  });
  const resultado = await resp.json();
  if (!resp.ok) throw new Error(resultado.error || 'No se pudo completar la operación.');
  return resultado;
}

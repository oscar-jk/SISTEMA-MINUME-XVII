// Cliente único de Supabase, compartido por toda la aplicación. Vendorizado
// en /js/vendor (ver README, "Actualizar supabase-js") — antes importaba
// desde esm.sh con la mayor fijada pero sin versión exacta ni integridad:
// una caída de esm.sh el día del evento tumbaba el sistema completo.
import { createClient } from '../vendor/supabase-js-2.112.3.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

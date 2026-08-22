// Configuración de conexión a Supabase.
// La clave publicable NO es secreta: está diseñada para viajar en el bundle
// del navegador y queda protegida por las políticas RLS de la base de datos,
// no por el secreto de esta clave. El secreto de servicio (service_role)
// nunca debe aparecer en este archivo ni en ningún código de frontend.
export const SUPABASE_URL = 'https://pnwodmktafqtijjtvihj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_K4eViOcBcjigX_gZOeFasw_loC5D_Cm';

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el navegador.
 * Nota: con RLS actual, el front sólo puede LEER su propia sesión si le
 * setea el header `x-session-token`. Toda escritura va por el server (service_role).
 */
export function supabaseBrowser(sessionToken?: string) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    sessionToken
      ? {
          global: {
            headers: { "x-session-token": sessionToken },
          },
        }
      : undefined,
  );
}

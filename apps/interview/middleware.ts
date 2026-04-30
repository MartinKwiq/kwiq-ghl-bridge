import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Middleware de Kwiq.
 *
 * Responsabilidades:
 *  0. Si faltan las env vars mínimas de Supabase, redirigir a `/admin/setup`
 *     (wizard no-code). Así la primera corrida de la app nunca crashea.
 *  1. Rehidratar la sesión de Supabase (cookies) — requisito del SSR.
 *  2. Proteger `/admin/*`: si no hay sesión → `/admin/login`.
 *     Si hay sesión pero el email no es @kwiq.io → `/admin/login?error=domain`.
 *  3. Proteger `/interview/*` (excepto `/interview/login` y
 *     `/interview/accept-invite`): si no hay sesión → `/interview/login`.
 *
 * La verificación de "es admin de verdad" (está en kwiq_admins) o "es cliente
 * invitado" (está en kwiq_interview_users) se hace en cada Server Component
 * (más barato que en Edge, donde no hay service_role).
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const pathname = req.nextUrl.pathname;
  const isSetupRoute =
    pathname === "/admin/setup" || pathname.startsWith("/api/admin/setup");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasMinimalEnv = Boolean(url && anon);

  // Sin env → mandar al wizard (salvo que ya estemos ahí).
  if (!hasMinimalEnv) {
    if (isSetupRoute) return res;
    return NextResponse.redirect(new URL("/admin/setup", req.url));
  }

  // Con env pero navegando al wizard → dejamos pasar (útil para reconfigurar).
  if (isSetupRoute) return res;

  const supabase = createServerClient(url!, anon!, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(
        toSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        toSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() refresca las cookies si están por vencer.
  let user: { email?: string | null } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    // Si Supabase no responde, preferimos dejar pasar y que la página explique.
    user = null;
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";
  const isAdminAcceptInvitePage = pathname === "/admin/accept-invite";
  // Rutas públicas dentro de /admin/* — no requieren sesión todavía. El
  // accept-invite recibe al admin después del magic link y le permite
  // establecer su primera contraseña.
  const isPublicAdminRoute = isLoginPage || isAdminAcceptInvitePage;

  if (isAdminRoute && !isPublicAdminRoute) {
    if (!user) {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (!user.email || !user.email.toLowerCase().endsWith("@kwiq.io")) {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("error", "domain");
      return NextResponse.redirect(loginUrl);
    }
  }

  // Si ya logueado y va a /admin/login, redirect al dashboard.
  if (isLoginPage && user && user.email?.toLowerCase().endsWith("@kwiq.io")) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // ---- Flow cliente /interview/* ----
  const isInterviewRoute = pathname.startsWith("/interview");
  const isClientLoginPage = pathname === "/interview/login";
  const isAcceptInvitePage = pathname === "/interview/accept-invite";
  const isPublicInterviewRoute = isClientLoginPage || isAcceptInvitePage;

  if (isInterviewRoute && !isPublicInterviewRoute) {
    if (!user) {
      const loginUrl = new URL("/interview/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // No chequeamos kwiq_interview_users acá (requiere service_role). Lo hace
    // el Server Component en /interview/page.tsx y los endpoints API.
  }

  // Si ya logueado y va a /interview/login, mandamos a la landing cliente.
  if (isClientLoginPage && user) {
    return NextResponse.redirect(new URL("/interview", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|kwiq-logo.svg|kwiq-mark.svg|kwiq-logo-full.svg|kwiq-logo-reverse.svg|api/chat|api/outputs|api/session).*)",
  ],
};

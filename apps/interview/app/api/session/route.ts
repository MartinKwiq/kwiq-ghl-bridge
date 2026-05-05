import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/session — DEPRECADO.
 *
 * Antes este endpoint creaba sesiones de entrevista anónimas (sin user_id
 * ni project_id). Eso ya no se permite — toda sesión nueva tiene que
 * arrancar por POST /api/interview/start, que exige cliente logueado y
 * vincula la sesión al kwiq_project correspondiente.
 *
 * Devolvemos 410 Gone con un mensaje accionable para que cualquier código
 * cliente que todavía llame esto (caché de service worker, bookmark, etc)
 * vea claro qué pasa.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "endpoint_deprecated",
      message:
        "El flow legacy anónimo está cerrado. Usá /api/interview/start con un cliente logueado.",
      next: "/interview/login",
    },
    { status: 410 },
  );
}

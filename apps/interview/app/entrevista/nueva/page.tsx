import { redirect } from "next/navigation";

/**
 * /entrevista/nueva — DEPRECADO (flow legacy anónimo).
 *
 * Antes esta página tenía un form que creaba sesiones sin auth ni vínculo
 * a un kwiq_project. Eso permitía que un cliente terminara una entrevista
 * que después no podíamos asociar a su proyecto (caso real: Porfirio /
 * Axioma — sus 11 respuestas quedaron huérfanas hasta que las re-vinculamos
 * a mano).
 *
 * Ahora redirigimos siempre al login cliente. Desde ahí el cliente entra
 * con magic link y aterriza en /interview, donde el botón "Empezar nueva
 * entrevista" llama a /api/interview/start (que SÍ vincula la sesión a
 * `user_id` y `project_id`).
 *
 * Mantenemos la ruta para no romper bookmarks viejos — solo redirige.
 */
export const dynamic = "force-dynamic";

export default function NuevaEntrevistaDeprecada() {
  redirect("/interview/login?reason=use_invite");
}

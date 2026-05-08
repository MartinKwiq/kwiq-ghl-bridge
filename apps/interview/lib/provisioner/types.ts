/**
 * Tipos compartidos del provisioner.
 *
 * El provisioner consume un `GhlAutoConfig` (producido por
 * `lib/generators/ghl-autoconfig.ts`) más el bundle de Conversation AI, y
 * aplica cada bloque al Location correspondiente en HighLevel de forma
 * **idempotente**: cada recurso tiene una `local_key` estable y un
 * `fingerprint` sha256 del payload. Si ya existe + fingerprint igual → skip.
 * Si ya existe + fingerprint distinto → PATCH. Si no existe → POST.
 *
 * Diseño: cada step es una función pura que recibe (ctx, input) y devuelve
 * un `StepResult` contando qué hizo. El orquestador en `run.ts` los cablea
 * en orden y persiste el `RunRecord` en `kwiq_provisioning_runs`.
 */
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";

/** Resultado de ejecutar un único step del provisioner. */
export interface StepResult {
  /** Identificador del step, ej. "custom_values". */
  step: string;
  /** "ok" si todos los writes salieron OK, "error" si alguno falló, "skipped" si no aplicaba. */
  status: "ok" | "error" | "skipped";
  /** Cuántos recursos creó (POST). */
  created: number;
  /** Cuántos actualizó (PATCH/PUT). */
  updated: number;
  /** Cuántos saltó por fingerprint idéntico. */
  skipped: number;
  /** Mensaje humanamente legible si falló. */
  error_message?: string;
  /** Duración en ms del step entero. */
  duration_ms: number;
  /** Detalle opcional por recurso — útil para debugging en el UI. */
  items?: Array<{
    local_key: string;
    action: "create" | "update" | "skip" | "error";
    external_id?: string;
    error?: string;
  }>;
}

/** Status agregado del run. Coincide con el enum `kwiq_provisioning_status`. */
export type RunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial";

/** Input normalizado que consumen los steps. */
export interface ProvisionInput {
  project_id: string;
  location_id: string;
  autoconfig: GhlAutoConfig;
  /** Bundle de Conversation AI (si se generó) — opcional para steps que no lo usan. */
  conversation_ai?: unknown;
  /** Modo: "dry_run" muestra qué haría pero no toca GHL. */
  mode: "dry_run" | "apply";
}

/** Contexto HTTP que reciben los steps — ya resuelto el PIT y el company_id.
 *
 * `company_id` es necesario para canjear el Agency PIT por un Location
 * Access Token (ver location-client.ts). Sin él no se puede escribir en
 * la sub-cuenta — GHL devuelve 401.
 */
export interface LocationContext {
  pit: string;
  location_id: string;
  company_id: string;
}

/** Resultado `ok | error` de una llamada HTTP a GHL desde el provisioner. */
export type HttpResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

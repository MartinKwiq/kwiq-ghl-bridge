"use client";

import { useState } from "react";

/**
 * <PitDiagnosticsCard /> — tarjeta en /admin/ajustes que "abre" el PIT
 * cargado y muestra qué permisos tiene grabados adentro + probes en vivo
 * contra los endpoints que nos importan.
 *
 * No usa el PIT en el cliente — lo que se ve acá es solo el resultado
 * devuelto por /api/admin/ajustes/pit-diagnose (metadata derivada, nunca
 * el token en sí).
 */

interface TokenMeta {
  issued_to_company_id: string | null;
  issued_to_location_id: string | null;
  auth_class: string | null;
  scopes: string[];
  issued_at: string | null;
  expires_at: string | null;
}

interface ProbeResult {
  resource: string;
  expected_scope: string;
  ok: boolean;
  status: number | null;
  message: string | null;
}

interface DiagResponse {
  token_format: "jwt" | "opaque";
  token_meta: TokenMeta | null;
  settings_company_id: string;
  company_mismatch: boolean;
  /**
   * Company ID real de la agencia, descubierto automáticamente leyendo
   * el campo `companyId` del primer location devuelto por GHL. Solo se
   * completa cuando la probe de `companies` falla pero la de `locations`
   * anda — ahí es cuando el admin necesita esta sugerencia.
   */
  discovered_company_id: string | null;
  probes: ProbeResult[];
}

type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: DiagResponse }
  | { kind: "error"; message: string };

/**
 * Lista de scopes que nuestra app necesita para operar (provisioner + panel
 * de snapshots). Se usa para mostrar qué le falta al token actual.
 */
const REQUIRED_SCOPES: Array<{ scope: string; usedBy: string }> = [
  { scope: "snapshots.readonly", usedBy: "Listar snapshots de la agencia" },
  { scope: "locations.readonly", usedBy: "Listar sub-cuentas" },
  { scope: "locations/customValues.readonly", usedBy: "Leer custom values" },
  { scope: "locations/customValues.write", usedBy: "Crear custom values" },
  { scope: "locations/customFields.readonly", usedBy: "Leer custom fields" },
  { scope: "locations/customFields.write", usedBy: "Crear custom fields" },
  { scope: "locations/tags.readonly", usedBy: "Leer tags" },
  { scope: "locations/tags.write", usedBy: "Crear tags" },
];

export function PitDiagnosticsCard() {
  const [state, setState] = useState<UiState>({ kind: "idle" });

  async function diagnose() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/ajustes/pit-diagnose", {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          missing?: string[];
          detail?: string;
        };
        const message =
          body.error === "not_configured"
            ? `Falta cargar en Ajustes: ${(body.missing ?? []).join(", ")}`
            : (body.detail ?? body.error ?? `Error ${res.status}`);
        setState({ kind: "error", message });
        return;
      }
      const data = (await res.json()) as DiagResponse;
      setState({ kind: "done", data });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-kwiq-border bg-kwiq-panel/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-kwiq-text">
            Diagnosticar la llave (PIT) de GoHighLevel
          </p>
          <p className="mt-1 text-xs text-kwiq-muted">
            Abre la llave que tenés cargada y te muestra qué permisos lleva
            grabados adentro, + prueba en vivo contra GHL. Si algún panel
            tira error 403, esto te dice exactamente qué está faltando.
          </p>
        </div>
        <button
          type="button"
          onClick={diagnose}
          disabled={state.kind === "loading"}
          className="shrink-0 rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-1.5 text-xs text-kwiq-text transition hover:border-kwiq-accent hover:text-kwiq-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.kind === "loading" ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Revisando…
            </span>
          ) : state.kind === "done" ? (
            "Revisar de nuevo"
          ) : (
            "Diagnosticar"
          )}
        </button>
      </div>

      {state.kind === "error" && (
        <p className="mt-3 rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-xs text-kwiq-text">
          {state.message}
        </p>
      )}

      {state.kind === "done" && <DiagResult data={state.data} />}
    </div>
  );
}

function DiagResult({ data }: { data: DiagResponse }) {
  const scopesInToken = new Set(data.token_meta?.scopes ?? []);
  const missingScopes = REQUIRED_SCOPES.filter(
    (s) => !scopesInToken.has(s.scope),
  );
  const snapshotsProbe = data.probes.find((p) => p.resource === "snapshots");
  const locationsProbe = data.probes.find((p) => p.resource === "locations");
  const companiesProbe = data.probes.find((p) => p.resource === "companies");
  const allProbesOk = data.probes.every((p) => p.ok);
  const someProbesFailed = data.probes.some((p) => !p.ok);
  const isLocationToken =
    data.token_meta?.auth_class?.toLowerCase() === "location";

  /**
   * Patrón "limitación PIT con snapshots":
   * snapshots rebota con 403 pero locations Y companies funcionan con el
   * MISMO companyId. Esto confirma que la companyId está bien y que el PIT
   * tiene acceso a la agencia; el único endpoint que rechaza es /snapshots/.
   * Es una limitación conocida: HighLevel muestra el checkbox
   * `snapshots.readonly` al crear la PIT pero el endpoint no lo honra.
   */
  const isPitSnapshotsLimitation = Boolean(
    snapshotsProbe &&
      !snapshotsProbe.ok &&
      snapshotsProbe.status === 403 &&
      locationsProbe?.ok &&
      companiesProbe?.ok,
  );

  /**
   * Si companies rebota, el companyId cargado no es válido para esta llave
   * — probablemente se pegó el ID de una sub-cuenta u otra agencia.
   */
  const isCompanyIdBroken = Boolean(
    companiesProbe && !companiesProbe.ok && companiesProbe.status === 403,
  );

  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      {/* Panel de alertas críticas arriba */}
      {isLocationToken && (
        <div className="rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 p-3 text-xs text-kwiq-text">
          <p className="font-medium">
            ⚠ Este PIT es de sub-cuenta, no de agencia
          </p>
          <p className="mt-1 text-kwiq-muted">
            Para ver snapshots y listar sub-cuentas necesitás un PIT creado a
            nivel <strong>Agencia</strong> (Company). El que tenés cargado es
            de una sub-cuenta específica. Creá uno nuevo desde el panel de la
            agencia (el nivel superior) en HighLevel → Settings → Private
            Integrations.
          </p>
        </div>
      )}

      {data.company_mismatch && (
        <div className="rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 p-3 text-xs text-kwiq-text">
          <p className="font-medium">
            ⚠ El PIT fue emitido para OTRA agencia
          </p>
          <p className="mt-1 text-kwiq-muted">
            La llave está a nombre de la agencia{" "}
            <code className="font-mono">
              {data.token_meta?.issued_to_company_id}
            </code>{" "}
            pero en Ajustes tenés cargado{" "}
            <code className="font-mono">{data.settings_company_id}</code>.
            Corregí uno de los dos para que coincidan.
          </p>
        </div>
      )}

      {isCompanyIdBroken && (
        <div className="rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 p-3 text-xs text-kwiq-text">
          <p className="font-medium">
            ⚠ El Company ID cargado no parece ser de tu agencia
          </p>
          <p className="mt-1 text-kwiq-muted">
            Probamos leer la agencia con ID{" "}
            <code className="font-mono">{data.settings_company_id}</code> y GHL
            la rechazó con el mismo error. Eso sugiere que ese ID no es de tu
            agencia — puede ser un ID de snapshot, de una sub-cuenta, o de
            otra cuenta.
          </p>
          {data.discovered_company_id ? (
            <div className="mt-3 rounded-md border border-kwiq-ok/40 bg-kwiq-ok/10 p-2.5">
              <p className="text-kwiq-text">
                <strong>Lo encontramos por vos.</strong> Miramos las sub-cuentas
                que GHL nos devolvió con tu llave, y todas apuntan a la misma
                agencia. El Company ID real de tu agencia es:
              </p>
              <p className="mt-2">
                <code className="inline-block rounded-md border border-kwiq-border bg-kwiq-bg/60 px-2 py-1 font-mono text-sm text-kwiq-text">
                  {data.discovered_company_id}
                </code>
              </p>
              <p className="mt-2 text-kwiq-muted">
                Copialo y pegalo abajo en{" "}
                <code className="font-mono">ghl.agency_company_id</code>{" "}
                (reemplazando el que está ahora), guardá, y volvé a tocar{" "}
                <strong>"Diagnosticar"</strong>. Con eso todo lo que depende del
                companyId debería quedar en verde.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-kwiq-muted">
              No pudimos descubrir el ID correcto automáticamente. En
              HighLevel, andá a <strong>Agency Settings → Company</strong> y
              copiá el <em>Company ID</em> que aparece ahí. Pegalo abajo en{" "}
              <code className="font-mono">ghl.agency_company_id</code>.
            </p>
          )}
        </div>
      )}

      {isPitSnapshotsLimitation && (
        <div className="rounded-lg border border-kwiq-warn/40 bg-kwiq-warn/10 p-3 text-xs text-kwiq-text">
          <p className="font-medium">
            ℹ Limitación conocida de GoHighLevel con snapshots
          </p>
          <p className="mt-1 text-kwiq-muted">
            Tu llave está sana: abre la agencia (ID{" "}
            <code className="font-mono">{data.settings_company_id}</code>),
            lista las sub-cuentas, y tiene los permisos correctos tildados.
            Pero el endpoint de <strong>snapshots</strong> de GHL rechaza todas
            las llaves tipo PIT aunque tengan el permiso marcado — es un
            problema documentado del lado de HighLevel, no de tu configuración.
            Regenerar la llave 100 veces no va a cambiar esto.
          </p>
          <p className="mt-2 text-kwiq-muted">
            <strong className="text-kwiq-text">Cómo convivir con esto:</strong>{" "}
            el panel de snapshots es solo "de descubrimiento" — sirve para ver
            cuáles tenés disponibles. Para aplicar un snapshot a una sub-cuenta
            nueva desde Kwiq, vas a pegar el ID del snapshot a mano en la
            configuración de cada proyecto. El endpoint de{" "}
            <em>aplicar snapshot</em> sí funciona con PIT — es solo el de{" "}
            <em>listar</em> el que no. Más adelante, si crece el uso, podemos
            registrar una Marketplace App de GHL (OAuth) para destrabar todos
            los endpoints "de agencia".
          </p>
        </div>
      )}

      {/* Sección 1: Pruebas en vivo */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-kwiq-muted">
          Pruebas en vivo (lo que GHL realmente deja hacer)
        </p>
        <ul className="divide-y divide-kwiq-border rounded-lg border border-kwiq-border bg-kwiq-bg/40">
          {data.probes.map((p) => (
            <li
              key={p.resource}
              className="flex flex-wrap items-start justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-kwiq-text">
                  <span className="mr-1">{p.ok ? "✅" : "❌"}</span>
                  <span className="font-medium">
                    {humanResource(p.resource)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-kwiq-muted">
                  Permiso que GHL pide:{" "}
                  <code className="font-mono">{p.expected_scope}</code>
                </p>
                {!p.ok && p.message && (
                  <p className="mt-1 text-xs text-kwiq-err">
                    GHL respondió{" "}
                    {p.status !== null && (
                      <span className="font-mono">{p.status}</span>
                    )}{" "}
                    — {p.message}
                  </p>
                )}
              </div>
              <span
                className={
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
                  (p.ok
                    ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
                    : "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err")
                }
              >
                {p.ok ? "funciona" : "bloqueado"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sección 2: Lo que dice el token por dentro */}
      {data.token_meta ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-kwiq-muted">
            Lo que dice el token por dentro
          </p>
          <div className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 p-3 text-xs text-kwiq-muted">
            <dl className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-[160px_1fr] sm:gap-x-3">
              <dt>Tipo de llave</dt>
              <dd className="text-kwiq-text">
                {data.token_meta.auth_class ?? "—"}{" "}
                {data.token_meta.auth_class && (
                  <span className="text-kwiq-muted">
                    (
                    {data.token_meta.auth_class.toLowerCase() === "company"
                      ? "de agencia — puede ver todas las sub-cuentas"
                      : data.token_meta.auth_class.toLowerCase() === "location"
                        ? "de sub-cuenta — solo esa"
                        : "tipo desconocido"}
                    )
                  </span>
                )}
              </dd>
              {data.token_meta.issued_to_company_id && (
                <>
                  <dt>Emitida para la agencia</dt>
                  <dd>
                    <code className="font-mono text-kwiq-text">
                      {data.token_meta.issued_to_company_id}
                    </code>
                  </dd>
                </>
              )}
              {data.token_meta.issued_to_location_id && (
                <>
                  <dt>Emitida para la sub-cuenta</dt>
                  <dd>
                    <code className="font-mono text-kwiq-text">
                      {data.token_meta.issued_to_location_id}
                    </code>
                  </dd>
                </>
              )}
              {data.token_meta.issued_at && (
                <>
                  <dt>Emitida el</dt>
                  <dd className="text-kwiq-text">
                    {new Date(data.token_meta.issued_at).toLocaleString(
                      "es-AR",
                    )}
                  </dd>
                </>
              )}
              {data.token_meta.expires_at && (
                <>
                  <dt>Expira</dt>
                  <dd className="text-kwiq-text">
                    {new Date(data.token_meta.expires_at).toLocaleString(
                      "es-AR",
                    )}
                  </dd>
                </>
              )}
            </dl>

            <p className="mt-3 text-kwiq-text">
              Permisos grabados dentro de la llave:
            </p>
            {data.token_meta.scopes.length === 0 ? (
              <p className="mt-1 text-kwiq-muted">
                No se encontró una lista explícita. Las pruebas de arriba son
                la fuente de verdad en este caso.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {data.token_meta.scopes.map((s) => (
                  <code
                    key={s}
                    className="rounded-full border border-kwiq-ok/40 bg-kwiq-ok/10 px-2 py-0.5 font-mono text-[11px] text-kwiq-ok"
                  >
                    {s}
                  </code>
                ))}
              </div>
            )}

            {missingScopes.length > 0 ? (
              <>
                <p className="mt-3 text-kwiq-text">
                  Permisos que Kwiq necesita y la llave NO trae:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {missingScopes.map((s) => (
                    <code
                      key={s.scope}
                      title={s.usedBy}
                      className="rounded-full border border-kwiq-err/40 bg-kwiq-err/10 px-2 py-0.5 font-mono text-[11px] text-kwiq-err"
                    >
                      {s.scope}
                    </code>
                  ))}
                </div>
              </>
            ) : (
              data.token_meta.scopes.length > 0 && (
                <p className="mt-3 text-kwiq-ok">
                  ✅ Tiene todos los permisos que Kwiq necesita.
                </p>
              )
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 p-3 text-xs text-kwiq-muted">
          Este token no se puede abrir para leer permisos (no está en formato
          JWT). En ese caso, las pruebas en vivo de arriba son lo único que
          nos dice con certeza qué funciona y qué no.
        </p>
      )}

      {/*
        Sección 3: Próximo paso accionable.
        Solo mostramos los pasos de "regenerar la llave" si hay algo que
        regenerar la llave puede arreglar. Si el único problema es la
        limitación conocida de GHL con /snapshots/ via PIT, regenerar no
        sirve — ese caso ya lo explica el banner de arriba.
      */}
      {(() => {
        // Si el token es opaco (no JWT), `missingScopes` mira una lista vacía
        // y termina marcando TODO como faltante aunque los endpoints
        // respondan OK. En ese caso las pruebas en vivo son la verdad — si
        // pasan todas, no hay nada que regenerar.
        const tokenScopesAreKnown = data.token_meta !== null;
        const missingScopesActuallyMissing =
          tokenScopesAreKnown && missingScopes.length > 0;
        const regenerateWouldHelp =
          isLocationToken ||
          data.company_mismatch ||
          missingScopesActuallyMissing ||
          (someProbesFailed && !isPitSnapshotsLimitation && !isCompanyIdBroken);
        if (!regenerateWouldHelp) return null;
        return (
          <div className="rounded-lg border border-kwiq-warn/40 bg-kwiq-warn/10 p-3 text-xs text-kwiq-text">
            <p className="font-medium">Próximo paso</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-kwiq-muted">
              <li>
                Abrí GoHighLevel →{" "}
                <strong>Agency Settings → Private Integrations</strong>.
                Importante: tiene que ser a nivel <em>agencia</em> (el panel
                superior), no una sub-cuenta específica.
              </li>
              {missingScopes.length > 0 && (
                <li>
                  Creá una llave nueva o editá la actual y tildá estos permisos
                  (los que faltan están marcados en rojo arriba):{" "}
                  {missingScopes.map((s, i) => (
                    <span key={s.scope}>
                      <code className="font-mono">{s.scope}</code>
                      {i < missingScopes.length - 1 ? ", " : ""}
                    </span>
                  ))}
                  .
                </li>
              )}
              <li>
                Hacé click en <strong>"Regenerate Token"</strong> (o creá una
                llave nueva desde cero). <strong>Atención:</strong> tildar los
                checkboxes y guardar <em>no</em> alcanza — los permisos se
                graban dentro del token solo al emitirlo. Si guardás sin
                regenerar, seguís teniendo la llave vieja.
              </li>
              <li>
                Copiá la llave nueva y pegala abajo en el campo{" "}
                <code className="font-mono">ghl.agency_pit</code>. Después
                volvé a tocar <strong>"Diagnosticar"</strong> para confirmar
                que quedó todo en verde.
              </li>
            </ol>
          </div>
        );
      })()}

      {allProbesOk && !isLocationToken && !data.company_mismatch && (
        <div className="rounded-lg border border-kwiq-ok/40 bg-kwiq-ok/10 p-3 text-xs text-kwiq-text">
          <p className="font-medium">✅ La llave está saludable</p>
          <p className="mt-1 text-kwiq-muted">
            Todas las pruebas pasaron y los permisos cubren lo que Kwiq
            necesita. Si algún otro endpoint sigue fallando, puede ser un
            tema del endpoint específico (plan de HighLevel, feature flags de
            la sub-cuenta, etc.) más que del token.
          </p>
        </div>
      )}

      {isPitSnapshotsLimitation &&
        !isLocationToken &&
        !data.company_mismatch &&
        missingScopes.length === 0 && (
          <div className="rounded-lg border border-kwiq-ok/40 bg-kwiq-ok/10 p-3 text-xs text-kwiq-text">
            <p className="font-medium">
              ✅ Tu llave está bien configurada — seguimos
            </p>
            <p className="mt-1 text-kwiq-muted">
              Todo lo que depende de tu llave funciona. El único bloqueo es la
              limitación de GHL con snapshots que se explica arriba, y eso no
              se arregla regenerando el token. Podemos avanzar con el resto
              del flujo sin problema.
            </p>
          </div>
        )}
    </div>
  );
}

function humanResource(resource: string): string {
  switch (resource) {
    case "snapshots":
      return "Listar snapshots de la agencia";
    case "locations":
      return "Listar sub-cuentas de la agencia";
    case "companies":
      return "Leer datos de la agencia (verifica companyId)";
    default:
      return resource;
  }
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

/**
 * Helpers de "match-and-diff" entre el autoconfig que la entrevista
 * generó y el inventario remoto que el snapshot trajo.
 *
 * Para cada recurso del autoconfig, decidimos:
 *  - "missing"  → no existe en GHL → hay que crearlo desde cero.
 *  - "matches"  → existe en GHL con el mismo nombre Y los mismos campos
 *                 críticos → no hace falta tocarlo.
 *  - "outdated" → existe en GHL con el mismo nombre PERO los campos
 *                 críticos difieren → hay que editarlo.
 *
 * Sale de esta lógica la base del "Kit de Configuración Manual": para
 * cada item, el kit muestra qué hacer ("crear / editar / dejar igual")
 * y el contenido sugerido.
 *
 * Match siempre por nombre normalizado (NFD + sin diacríticos + lowercase
 * + non-alfanumérico → _) — los snapshots no garantizan IDs estables
 * entre tenants pero sí nombres consistentes.
 */
import { normalizeName } from "./normalize";
import type { InventoryEntry } from "./inventory";

export type DiffStatus = "missing" | "matches" | "outdated";

export interface DiffItem<TLocal, TRemote = InventoryEntry> {
  /** Item del autoconfig (la "verdad" que vino de la entrevista). */
  local: TLocal;
  /** Item del inventario remoto que matcheó por nombre, si lo hay. */
  remote: TRemote | null;
  /** Resultado de la comparación. */
  status: DiffStatus;
  /** Lista de campos que difieren (vacío si status != "outdated"). */
  diffFields: string[];
  /** Nombre normalizado usado para matchear (debug). */
  normalizedKey: string;
}

export interface DiffReport<TLocal, TRemote = InventoryEntry> {
  /** Lista completa de comparaciones (un item por cada elemento del autoconfig). */
  items: Array<DiffItem<TLocal, TRemote>>;
  /** Contadores agregados — útil para mostrar resumen en la UI. */
  counts: {
    total: number;
    missing: number;
    matches: number;
    outdated: number;
  };
  /** Remotos que NO matchearon con nada del autoconfig. Útil para reportar
   *  "esto está en GHL pero el cliente no lo pidió — ¿lo dejamos o lo
   *  borramos?". */
  orphanRemotes: TRemote[];
}

/**
 * Compara una lista del autoconfig contra una lista del inventario
 * remoto. Match por nombre normalizado.
 *
 * @param locals - items del autoconfig
 * @param remotes - items del inventario remoto
 * @param nameOf - cómo extraer el nombre de un item local
 * @param remoteNameFields - en qué campos del remoto buscar el nombre
 * @param compareFields - qué campos comparar para decidir si están
 *                        "actualizados". Cada entrada es un par
 *                        [local→valor, remote→valor]. Si todos los pares
 *                        coinciden, status = "matches"; si no,
 *                        "outdated".
 */
export function computeDiff<TLocal, TRemote extends InventoryEntry>(
  locals: TLocal[],
  remotes: TRemote[],
  nameOf: (l: TLocal) => string,
  remoteNameFields: Array<keyof TRemote>,
  compareFields: Array<{
    label: string;
    fromLocal: (l: TLocal) => unknown;
    fromRemote: (r: TRemote) => unknown;
  }>,
): DiffReport<TLocal, TRemote> {
  // Index de remotos por nombre normalizado para lookup O(1).
  const remoteIndex = new Map<string, TRemote>();
  for (const r of remotes) {
    for (const field of remoteNameFields) {
      const v = r[field];
      if (typeof v === "string" && v.trim()) {
        const key = normalizeName(v);
        if (!remoteIndex.has(key)) remoteIndex.set(key, r);
      }
    }
  }

  const matchedRemoteIds = new Set<string>();
  const items: Array<DiffItem<TLocal, TRemote>> = [];

  for (const local of locals) {
    const name = nameOf(local);
    if (!name?.trim()) continue;
    const normalizedKey = normalizeName(name);
    const remote = remoteIndex.get(normalizedKey) ?? null;

    if (!remote) {
      items.push({
        local,
        remote: null,
        status: "missing",
        diffFields: [],
        normalizedKey,
      });
      continue;
    }

    matchedRemoteIds.add(remote.id);

    // Comparar cada campo crítico.
    const diffFields: string[] = [];
    for (const cmp of compareFields) {
      const lv = cmp.fromLocal(local);
      const rv = cmp.fromRemote(remote);
      if (!shallowEqual(lv, rv)) diffFields.push(cmp.label);
    }

    items.push({
      local,
      remote,
      status: diffFields.length === 0 ? "matches" : "outdated",
      diffFields,
      normalizedKey,
    });
  }

  const orphanRemotes = remotes.filter((r) => !matchedRemoteIds.has(r.id));

  return {
    items,
    counts: {
      total: items.length,
      missing: items.filter((i) => i.status === "missing").length,
      matches: items.filter((i) => i.status === "matches").length,
      outdated: items.filter((i) => i.status === "outdated").length,
    },
    orphanRemotes,
  };
}

/**
 * Comparación robusta para los tipos de datos que típicamente comparamos:
 * strings (con trim), numbers, booleans, null/undefined. Para objects o
 * arrays cae a JSON.stringify, que es suficiente para nuestros usos.
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  if (typeof a === "number" && typeof b === "number") {
    return a === b;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

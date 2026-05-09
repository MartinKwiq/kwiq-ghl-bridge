/**
 * Normalización de "natural keys" para matchear recursos del autoconfig
 * contra los que ya existen en una sub-cuenta GHL (recibidos vía
 * `last_inventory_jsonb`).
 *
 * Por qué lo necesitamos:
 *
 *  - GHL no devuelve un `key` machine-friendly en el GET de
 *    customValues — sólo `name`. Para matchear `mail_de_contacto`
 *    (autoconfig) contra `Mail de contacto` (snapshot) tenemos que
 *    normalizar ambos lados.
 *
 *  - Los snapshots traen recursos con casing y tildes inconsistentes
 *    (`Telefono De Contacto`, `Teléfono de contacto`, `Mail de
 *    contacto`). Si no normalizamos, creamos duplicados.
 *
 *  - Tags: GHL deduplica case-insensitive del lado del servidor, pero
 *    nosotros queremos matchear ANTES de hacer el POST para no llenar
 *    logs de "ya existe".
 */

/**
 * Normaliza un nombre / clave para comparación case-insensitive y
 * accent-insensitive. Reglas:
 *  - lowercase
 *  - quitar tildes (NFD + remove combining marks)
 *  - reemplazar todo lo que no sea [a-z0-9] por "_"
 *  - colapsar "_" repetidos
 *  - trim "_" inicial/final
 *
 * Ejemplos:
 *   "Mail de contacto"          → "mail_de_contacto"
 *   "Teléfono de contacto"      → "telefono_de_contacto"
 *   "Términos y Condiciones"    → "terminos_y_condiciones"
 *   "Reseña URL - Sucursal A"   → "resena_url_sucursal_a"
 *   "  -- Hola --  "            → "hola"
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Comparación normalizada — devuelve true si `a` y `b` representan el
 * mismo concepto a ojos del provisioner.
 */
export function namesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return normalizeName(a) === normalizeName(b);
}

/**
 * Encuentra el primer item de `items` cuyo `name` normalizado matchee
 * `targetName` normalizado. Devuelve `null` si no hay match.
 *
 * El segundo argumento `nameField` permite buscar en otra propiedad
 * (ej. `key` o `fieldKey`) si por algún tipo de recurso GHL devuelve
 * el identificador ahí en vez de en `name`.
 */
export function findByNormalizedName<
  T extends { name?: string | null; key?: string | null; fieldKey?: string | null },
>(
  items: T[] | null | undefined,
  targetName: string,
  options?: { fields?: Array<"name" | "key" | "fieldKey"> },
): T | null {
  if (!items || items.length === 0) return null;
  const normTarget = normalizeName(targetName);
  const fields = options?.fields ?? ["name"];
  for (const item of items) {
    for (const f of fields) {
      const v = item[f];
      if (v && normalizeName(v) === normTarget) return item;
    }
  }
  return null;
}

/**
 * Listas estáticas para el form de creación de proyectos.
 *
 * GHL no expone via API algunos catálogos (nichos, timezones), así que los
 * mantenemos hardcoded acá. Si en el futuro queremos sincronizarlos, este
 * archivo es el único lugar a tocar.
 */

/** Nichos típicos del catálogo de GHL para sub-cuentas. */
export const BUSINESS_NICHES: { value: string; label: string }[] = [
  { value: "agency", label: "Agencia" },
  { value: "auto", label: "Automotriz" },
  { value: "beauty", label: "Belleza y estética" },
  { value: "coaching", label: "Coaching" },
  { value: "construction", label: "Construcción" },
  { value: "dental", label: "Dental" },
  { value: "education", label: "Educación" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "events", label: "Eventos" },
  { value: "fitness", label: "Fitness / Gimnasio" },
  { value: "health", label: "Salud y medicina" },
  { value: "home_services", label: "Servicios para el hogar" },
  { value: "legal", label: "Legal" },
  { value: "marketing", label: "Marketing" },
  { value: "professional_services", label: "Servicios profesionales" },
  { value: "real_estate", label: "Inmobiliario" },
  { value: "restaurant", label: "Restaurante" },
  { value: "retail", label: "Retail / Tienda" },
  { value: "saas", label: "SaaS / Software" },
  { value: "spa", label: "Spa / Bienestar" },
  { value: "veterinary", label: "Veterinaria" },
  { value: "other", label: "Otro" },
];

/** Países más usuales con código ISO-3166-1 alpha-2. Ordenados por relevancia. */
export const COUNTRIES: { code: string; label: string }[] = [
  { code: "MX", label: "México" },
  { code: "AR", label: "Argentina" },
  { code: "CO", label: "Colombia" },
  { code: "CL", label: "Chile" },
  { code: "PE", label: "Perú" },
  { code: "ES", label: "España" },
  { code: "US", label: "Estados Unidos" },
  { code: "BR", label: "Brasil" },
  { code: "UY", label: "Uruguay" },
  { code: "EC", label: "Ecuador" },
  { code: "PY", label: "Paraguay" },
  { code: "BO", label: "Bolivia" },
  { code: "VE", label: "Venezuela" },
  { code: "GT", label: "Guatemala" },
  { code: "CR", label: "Costa Rica" },
  { code: "PA", label: "Panamá" },
  { code: "DO", label: "República Dominicana" },
  { code: "PR", label: "Puerto Rico" },
  { code: "CA", label: "Canadá" },
  { code: "CU", label: "Cuba" },
  { code: "HN", label: "Honduras" },
  { code: "SV", label: "El Salvador" },
  { code: "NI", label: "Nicaragua" },
];

/**
 * Timezones más comunes para Latam + España + US. Cada entry tiene
 * `value` (IANA tz, lo que GHL espera) y `label` (legible para el admin).
 *
 * También indicamos `defaultCountries` para sugerir la TZ correcta al
 * elegir un país en el form — UX nice-to-have.
 */
export const TIMEZONES: {
  value: string;
  label: string;
  defaultCountries?: string[];
}[] = [
  { value: "America/Mexico_City", label: "México (CDMX) — UTC-6", defaultCountries: ["MX"] },
  { value: "America/Tijuana", label: "México (Tijuana) — UTC-8" },
  { value: "America/Cancun", label: "México (Cancún) — UTC-5" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires) — UTC-3", defaultCountries: ["AR", "UY"] },
  { value: "America/Bogota", label: "Colombia (Bogotá) — UTC-5", defaultCountries: ["CO", "EC", "PA", "PE"] },
  { value: "America/Santiago", label: "Chile (Santiago) — UTC-4", defaultCountries: ["CL"] },
  { value: "America/Lima", label: "Perú (Lima) — UTC-5" },
  { value: "America/Caracas", label: "Venezuela (Caracas) — UTC-4", defaultCountries: ["VE"] },
  { value: "America/La_Paz", label: "Bolivia (La Paz) — UTC-4", defaultCountries: ["BO"] },
  { value: "America/Asuncion", label: "Paraguay (Asunción) — UTC-3", defaultCountries: ["PY"] },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo) — UTC-3", defaultCountries: ["BR"] },
  { value: "America/Guatemala", label: "Guatemala — UTC-6", defaultCountries: ["GT", "CR", "HN", "NI", "SV"] },
  { value: "America/Santo_Domingo", label: "República Dominicana — UTC-4", defaultCountries: ["DO", "PR", "CU"] },
  { value: "Europe/Madrid", label: "España (Madrid) — UTC+1/+2", defaultCountries: ["ES"] },
  { value: "America/New_York", label: "EE.UU. Este (New York) — UTC-5/-4", defaultCountries: ["US"] },
  { value: "America/Chicago", label: "EE.UU. Centro (Chicago) — UTC-6/-5" },
  { value: "America/Denver", label: "EE.UU. Montaña (Denver) — UTC-7/-6" },
  { value: "America/Los_Angeles", label: "EE.UU. Pacífico (Los Angeles) — UTC-8/-7" },
  { value: "America/Toronto", label: "Canadá (Toronto) — UTC-5/-4", defaultCountries: ["CA"] },
];

/**
 * Devuelve la timezone sugerida para un código de país. Si hay varias
 * timezones para el país, elige la primera (típicamente la más poblada).
 */
export function suggestTimezoneForCountry(countryCode: string | null): string | null {
  if (!countryCode) return null;
  const upper = countryCode.toUpperCase();
  const match = TIMEZONES.find((tz) =>
    tz.defaultCountries?.includes(upper),
  );
  return match?.value ?? null;
}

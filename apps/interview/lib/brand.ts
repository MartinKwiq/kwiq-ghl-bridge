/**
 * Brand central de Kwiq.
 *
 * Única fuente de verdad para nombre, tagline, paleta, fuentes y paths de
 * assets. Cambiar acá impacta landing, chat, metadata y prompts.
 *
 * Paleta oficial de Kwiq (marca registrada):
 *   - Verde petróleo profundo (dark)
 *   - Turquesa (accent principal)
 *   - Aqua (accent claro / hover)
 *   - Fucsia (accent secundario para highlights)
 *   - Rosa pastel (accent terciario)
 *
 * Tipografía oficial:
 *   - Antonio (display / headings, condensada)
 *   - Poppins (body / UI)
 *
 * Ver `docs/BRANDING.md` para reglas de uso y cómo hacer swaps.
 */

export const BRAND = {
  name: "Kwiq",
  tagline: "Onboarding conversacional para tu CRM.",
  // Texto corto que aparece en el header de la entrevista.
  productName: "Kwiq Onboarding",
  // Nombre que el agente IA usa por default si el cliente no elige uno.
  defaultAgentName: "Kiki",
  // Dominio/URL de marketing (solo para deep-links; no se usa para fetch).
  siteUrl: "https://kwiq.io",
} as const;

/**
 * Hex oficiales de Kwiq. Si cambian, actualizar también:
 *   - `tailwind.config.ts` → theme.extend.colors.kwiq
 *   - `app/layout.tsx`    → viewport.themeColor
 *   - `app/globals.css`   → body y gradientes de .bubble-user
 *   - SVGs en `public/`   → colores embebidos
 */
export const COLORS = {
  // Superficies (oscuro — el logo vive sobre negro).
  bg: "#0A0A0A",
  panel: "#0F2424",
  border: "#1F3A3A",
  deep: "#0A3838", // verde petróleo profundo (col. 1 paleta)
  muted: "#8AA0A0",
  text: "#FFFFFF",
  // Acentos Kwiq.
  accent: "#2DC4A0", // turquesa principal (col. 2 paleta)
  accentHover: "#8EEBD0", // aqua claro (col. 3 paleta)
  accent2: "#D96296", // fucsia (col. 4 paleta)
  accent2Light: "#E0A5C4", // rosa pastel (col. 5 paleta)
  // Semánticos.
  ok: "#2DC4A0",
  warn: "#F59E0B",
  err: "#EF4444",
} as const;

export const FONTS = {
  display: "Antonio", // titulares y eyebrows
  sans: "Poppins", // body y UI
} as const;

export const ASSETS = {
  logo: "/kwiq-logo.svg", // Wordmark horizontal (fallback estático para emails/OG).
  mark: "/kwiq-mark.svg", // Isotipo oficial (K) sobre fondo transparente.
  block: "/kwiq-logo-full.svg", // "Block" full con fondo petrol (hero / redes).
  blockReverse: "/kwiq-logo-reverse.svg", // Block con letras blancas (reverso).
  favicon: "/favicon.svg",
} as const;

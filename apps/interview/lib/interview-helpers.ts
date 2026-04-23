/**
 * Helpers contextuales para preguntas de la entrevista.
 *
 * Varias preguntas del schema piden datos que el cliente puede no saber
 * cómo obtener (URL de Google Maps, URL de reseña GMB, link de WhatsApp
 * Business, etc.). Este módulo expone instrucciones paso a paso, un
 * ejemplo del formato esperado, y — cuando aplica — un fallback para
 * cuando el cliente no tiene el recurso.
 *
 * Lo mantenemos separado de `interview-schema.ts` para:
 *  - No inflar el schema (que sigue siendo el contrato con GHL).
 *  - Permitir actualizar copy sin tocar la estructura de datos.
 *  - Facilitar un futuro pass i18n de los helpers.
 *
 * Uso:
 *   import { getHelper } from "@/lib/interview-helpers";
 *   const helper = getHelper("ubicacion_google_maps");
 *   if (helper) { ... renderizar en UI ... }
 */

export interface HelperDef {
  /** Título del drawer/modal. Pregunta frecuente del cliente. */
  title: string;
  /** Pasos numerados y cortos. Cada string es un paso. */
  steps: string[];
  /** Ejemplo del formato esperado (para pegar arriba del input). */
  example?: string;
  /** Screenshot relativa a /public (ej. "/helpers/google-maps-share.png"). */
  screenshot?: string;
  /** Frase para cuando el cliente no tiene el recurso. El bot la ofrece como
   *  fallback — típicamente "podés dejarlo vacío" o "Kwiq te lo arma". */
  fallback?: string;
}

/**
 * Mapa de helpers indexado por `QuestionDef.id`.
 *
 * Si una pregunta no aparece acá, la UI no muestra el botón "❓ Cómo obtengo
 * esto". Agregar un helper es seguro — no rompe nada.
 */
export const HELPERS: Record<string, HelperDef> = {
  // ─────────────────────────────────────────────────────────────────────
  // Sección: Información General
  // ─────────────────────────────────────────────────────────────────────

  pagina_web: {
    title: "¿Cómo te pasamos la URL de tu página web?",
    steps: [
      "Abrí tu sitio en el navegador.",
      "Copiá la dirección completa desde la barra de arriba.",
      "Pegala acá — tiene que empezar con https:// o http://.",
    ],
    example: "https://miempresa.com",
    fallback:
      "Si todavía no tenés página web, podés dejarlo en blanco. Kwiq puede armarte una landing o sitio completo — lo marcamos como oportunidad.",
  },

  aviso_privacidad: {
    title: "¿Cómo te pasamos tu aviso de privacidad?",
    steps: [
      "Si ya tenés uno publicado, copiá y pegá el link (ej. https://miempresa.com/privacidad).",
      "Si lo tenés como texto, pegá el texto completo acá.",
      "Si no tenés, escribí `no tengo` y seguimos — te pasamos una plantilla después.",
    ],
    example: "https://miempresa.com/politica-de-privacidad",
    fallback:
      "Si no tenés aviso de privacidad, te podemos armar uno genérico que cumple con LGPD/GDPR básico. Marcá que no tenés y seguimos.",
  },

  terminos_condiciones: {
    title: "¿Cómo te pasamos tus términos y condiciones?",
    steps: [
      "Si ya tenés unos publicados, copiá y pegá el link.",
      "Si los tenés como texto, pegalos completos.",
      "Si no tenés, escribí `no tengo` y te pasamos una plantilla base.",
    ],
    example: "https://miempresa.com/terminos",
    fallback:
      "Si no tenés T&C todavía, Kwiq te arma unos básicos partiendo de tu actividad. Decí que no tenés y seguimos.",
  },

  doctoralia: {
    title: "¿Cómo encuentro mi URL de Doctoralia?",
    steps: [
      "Entrá a doctoralia.com o doctoralia.com.mx (según el país).",
      "Buscá tu perfil profesional por nombre.",
      "Una vez adentro de tu perfil, copiá la URL del navegador.",
      "Pegala acá — tiene que ser del tipo `doctoralia.com/doctor/...`.",
    ],
    example: "https://www.doctoralia.com.mx/medico/juan-perez-ginecologo",
    fallback:
      "Si no tenés perfil en Doctoralia, dejalo vacío. No es obligatorio.",
  },

  facebook: {
    title: "¿Cómo obtengo la URL de mi página de Facebook?",
    steps: [
      "Entrá a facebook.com y buscá tu **página** (no tu perfil personal).",
      "Una vez en la página, copiá la URL completa del navegador.",
      "Pegala acá — tiene que ser `facebook.com/tu-pagina`, no `facebook.com/tu-perfil`.",
    ],
    example: "https://www.facebook.com/MiNegocioOficial",
    fallback:
      "Si todavía no creaste tu página de Facebook de negocio, podés dejarlo vacío. Kwiq te puede ayudar a crearla — marcalo como pendiente.",
  },

  instagram: {
    title: "¿Cómo obtengo mi URL de Instagram?",
    steps: [
      "Entrá a instagram.com desde una computadora.",
      "Andá a tu perfil (arriba a la derecha → tu foto).",
      "Copiá la URL del navegador.",
      "Tiene que ser `instagram.com/tu-usuario`, NO solo el @usuario.",
    ],
    example: "https://www.instagram.com/minegocio",
    fallback:
      "Si no tenés Instagram de negocio, dejalo vacío. Si tenés pero no recordás el @, buscalo en la app de Instagram primero.",
  },

  tiktok: {
    title: "¿Cómo obtengo la URL de mi TikTok?",
    steps: [
      "Abrí la app de TikTok o entrá a tiktok.com.",
      "Andá a tu perfil.",
      "Tocá los 3 puntos arriba a la derecha → `Compartir` → `Copiar link`.",
      "Pegá el link acá.",
    ],
    example: "https://www.tiktok.com/@minegocio",
    fallback: "Si no usás TikTok todavía, dejalo vacío. No es obligatorio.",
  },

  whatsapp_business: {
    title: "¿Cómo genero un link de WhatsApp Business?",
    steps: [
      "El link tiene que ser del tipo `wa.me/<numero>` — sin signos +, sin guiones, sin espacios.",
      "Ejemplo: si tu número es +52 1 55 1234 5678, el link sería `wa.me/5215512345678`.",
      "Podés probarlo pegándolo en otra pestaña del navegador: debería abrirse WhatsApp listo para mandarte mensaje.",
      "También podés usar **wa.me/message/** si ya lo configuraste en tu WhatsApp Business.",
    ],
    example: "https://wa.me/5215512345678",
    fallback:
      "Si todavía no tenés WhatsApp Business configurado, dejalo vacío. Kwiq te ayuda a instalarlo — lo vamos a marcar como oportunidad.",
  },

  // ─────────────────────────────────────────────────────────────────────
  // Sección: Branding
  // ─────────────────────────────────────────────────────────────────────

  marca_logo_asset: {
    title: "¿Qué archivo de logo te conviene subir?",
    steps: [
      "Lo ideal: un SVG vectorial (escalable, queda nítido en cualquier tamaño).",
      "Si no tenés SVG, un PNG con fondo transparente (mínimo 512×512 px).",
      "Si solo tenés el logo en un PDF, también sirve — lo extraemos nosotros.",
      "Arrastrá el archivo al chat o tocá el botón de adjuntar.",
    ],
    example: "logo-minegocio.svg (o .png transparente, o .pdf)",
    fallback:
      "Si no tenés logo diseñado, dejalo en blanco. Kwiq te puede crear uno — lo marcamos como oportunidad de branding.",
  },

  marca_colores_hex: {
    title: "¿Cómo te paso los códigos hex de mis colores?",
    steps: [
      "El formato hex empieza con `#` y tiene 6 caracteres (letras A-F y números). Ej: `#3B82F6`.",
      "Si tenés tu brandbook, los colores aparecen ahí con ese formato.",
      "Si no los sabés de memoria: subí una imagen de tu paleta en la siguiente pregunta y los extraemos.",
      "Pegá 3-5 colores: primario, secundario, acento(s).",
    ],
    example: "#0F172A (primario) · #3B82F6 (secundario) · #F97316 (acento)",
    fallback:
      "Si no sabés los hex, avanzamos con lo que subas como imagen de paleta. También podemos armártela desde cero.",
  },

  // ─────────────────────────────────────────────────────────────────────
  // Sección: Ubicaciones
  // ─────────────────────────────────────────────────────────────────────

  ubicacion_google_maps: {
    title: "¿Cómo obtengo mi URL de Google Maps?",
    steps: [
      "Entrá a Google Maps (maps.google.com) desde computadora o celular.",
      "Buscá tu negocio por nombre + ciudad.",
      "Cuando aparezca en el panel de la izquierda, tocá el botón **Compartir**.",
      "Elegí la solapa **Enviar un enlace** y tocá **Copiar enlace**.",
      "Pegá el link acá. Debería verse tipo `https://maps.app.goo.gl/...` o `https://goo.gl/maps/...`.",
    ],
    example: "https://maps.app.goo.gl/XyZaBcDeF123",
    fallback:
      "Si tu negocio todavía no está en Google Maps, tenés que crear un perfil de Google Business Profile primero (gratis). Kwiq te puede ayudar.",
  },

  ubicacion_resena: {
    title: "¿Cómo obtengo mi URL para que me dejen reseñas en Google?",
    steps: [
      "Entrá a tu Google Business Profile en business.google.com.",
      "Elegí la ubicación del negocio.",
      "En el menú buscá **Obtener más reseñas** (o `Leer reseñas` → `Compartir formulario`).",
      "Copiá el link corto que te muestra.",
      "Alternativa: buscá tu negocio en Google Maps, tocá **Escribir reseña**, y copiá la URL del navegador — termina en `/review` o con un `placeid=...`.",
    ],
    example: "https://g.page/r/CX1Y2Z3ABCdefg/review",
    fallback:
      "Si todavía no activaste Google Business Profile, lo podés hacer desde business.google.com (gratis, toma 10 min). Sin eso no hay link de reseña.",
  },

  // ─────────────────────────────────────────────────────────────────────
  // Sección: Activos digitales
  // ─────────────────────────────────────────────────────────────────────

  asset_password: {
    title: "Importante: cómo te manejamos las contraseñas",
    steps: [
      "La contraseña se guarda **cifrada** en nuestra base de datos (AES-256).",
      "Nadie del equipo Kwiq la ve en claro — solo se descifra en el momento exacto que la app la usa para configurar algo.",
      "Cuando terminamos la configuración, te recomendamos **cambiar todas las contraseñas** que nos pasaste.",
      "Si tu cuenta tiene 2FA, mejor usá la opción `Invitación a mi cuenta Kwiq` en lugar de pasarnos la contraseña.",
    ],
    fallback:
      "Si preferís no pasarnos la contraseña, elegí `Invitación a mi cuenta Kwiq` arriba — nos invitás con un usuario nuevo y al terminar lo eliminás.",
  },
};

/**
 * Devuelve el helper asociado a una pregunta, si existe.
 *
 * @param questionId - El `id` de la pregunta en `INTERVIEW.sections[*].questions[*].id`.
 */
export function getHelper(questionId: string): HelperDef | undefined {
  return HELPERS[questionId];
}

/**
 * Lista de IDs de preguntas que tienen helper configurado.
 * Útil para tests y para validar que no rompimos ninguno al renombrar.
 */
export function listQuestionsWithHelper(): string[] {
  return Object.keys(HELPERS);
}

/**
 * Frases comunes que el cliente usa cuando no sabe cómo responder.
 * El motor del chat las detecta en el mensaje del usuario y dispara
 * el helper correspondiente automáticamente.
 *
 * Mantener en lowercase — la detección hace `.toLowerCase()` antes.
 */
export const HELPER_TRIGGER_PHRASES: string[] = [
  "no sé",
  "no se",
  "no lo sé",
  "no lo se",
  "cómo hago",
  "como hago",
  "cómo obtengo",
  "como obtengo",
  "cómo consigo",
  "como consigo",
  "qué es eso",
  "que es eso",
  "no entiendo",
  "ayuda",
  "no tengo idea",
  "no sabría",
  "no sabria",
  "me podés ayudar",
  "me podes ayudar",
  "cómo lo saco",
  "como lo saco",
  "dónde lo encuentro",
  "donde lo encuentro",
  "explícame",
  "explicame",
];

/**
 * Chequea si el mensaje del usuario sugiere que no sabe cómo responder.
 * Se usa en el motor del chat para ofrecer el helper proactivamente.
 */
export function userIsAskingForHelp(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return HELPER_TRIGGER_PHRASES.some((phrase) => normalized.includes(phrase));
}

/**
 * Esquema canónico de la entrevista de onboarding Kwiq.
 *
 * Derivado 1:1 del xlsx "Solicitud de información - Actualizada".
 * Cada SECTION corresponde a una hoja y describe qué configuración de GHL
 * termina produciendo (custom_fields, custom_values, calendars, pipeline,
 * handoff_rules, etc.). El LLM usa `intent` y `description` como contexto
 * para conducir la conversación; el generador de outputs usa `outputs`
 * para mapear respuestas a payloads de la API de GHL.
 */

export type FieldType =
  | "text_short" // "Una sola línea"
  | "text_long" // "Varias líneas"
  | "number"
  | "date"
  | "datetime"
  | "time"
  | "currency"
  | "select_single" // "Menú desplegable único"
  | "select_multi"
  | "radio" // "Seleccionar botón de opción"
  | "checkbox"
  | "file"
  | "url"
  | "email"
  | "phone"
  | "boolean";

export type OutputTarget =
  | "ghl_custom_field_contact"
  | "ghl_custom_field_opportunity"
  | "ghl_custom_value"
  | "ghl_calendar"
  | "ghl_pipeline_stage"
  | "ghl_user"
  | "ghl_tag"
  | "ghl_service_product"
  | "ghl_workflow_handoff"
  | "ghl_smart_list"
  | "digital_asset_credential"
  | "branding_asset" // logo, paleta, tipografía, brandbook → Supabase Storage + tabla branding_assets
  | "context_note" // conocimiento del negocio para el system prompt del agente
  | "conversation_ai_prompt" // directamente inyectado al prompt
  | "upsell_flag"; // detección de oportunidades Kwiq (web, branding, dominio, hosting…) — la clave es el código del producto

export interface QuestionDef {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: string[]; // para select_*, radio, checkbox
  /** A dónde va la respuesta una vez contestada. */
  output: {
    target: OutputTarget;
    /** Nombre del custom field / custom value / clave de config en GHL. */
    key?: string;
    /** Folder/subfolder en GHL. */
    folder?: string;
    subfolder?: string;
  };
  /** Texto que Gemini usa para reformular y guiar al cliente. */
  guidance?: string;
  /**
   * `true` (default): pregunta crítica para el provisioning — el LLM la cubre
   *   sí o sí antes de cerrar la sección.
   * `false`: pregunta contextual u opcional. El LLM la salta por defecto y
   *   solo la cubre si el cliente quiere profundizar. Esto acorta la
   *   entrevista típica de ~150 preguntas a ~50 (~20 min vs. ~90).
   */
  essential?: boolean;
  /**
   * Sugerencias listas para responder. Si está seteado, la UI del chat
   * muestra chips clicables debajo del input cuando esta pregunta está
   * activa. Click en un chip llena el textarea con el valor sugerido
   * (no lo envía automáticamente — el usuario puede editar antes).
   *
   * Cada sugerencia trae `value` (lo que va al input) y `why` (la razón
   * creativa que vuelve la sugerencia memorable y vendible).
   */
  suggestions?: Array<{ value: string; why: string }>;
}

export interface SectionDef {
  id: string;
  title: string;
  /** Hoja original en el xlsx. */
  sourceSheet: string;
  description: string;
  /** Qué resultado de configuración GHL produce. */
  intent: string;
  /** Orden de presentación. */
  order: number;
  /** Si la sección produce registros dinámicos (ej. N servicios, M calendarios). */
  repeatable?: {
    unit: string; // "servicio", "calendario", "usuario"…
    min?: number;
    max?: number;
  };
  /**
   * Mensaje que el bot dice al entrar a la sección, antes de hacer la
   * primera pregunta. Explica QUÉ se va a configurar y POR QUÉ importa,
   * para que el cliente sepa para qué está respondiendo.
   *
   * Si no está seteado, el bot arranca derecho con la primera pregunta
   * (comportamiento previo).
   */
  narrative_intro?: string;
  questions: QuestionDef[];
}

export const INTERVIEW: { version: string; sections: SectionDef[] } = {
  version: "2026-04-18",
  sections: [
    {
      id: "contexto_general",
      title: "Contexto general del negocio",
      sourceSheet: "Contexto General",
      order: 10,
      intent:
        "Entender operación, capacidad, herramientas actuales, recurrencia de clientes, cancelaciones, temporadas, incentivos. Alimenta el system prompt del agente de IA y define defaults operativos.",
      description:
        "Ayúdenos a entender más sobre la situación actual de su negocio y la forma en que se administra hoy.",
      narrative_intro:
        "Empezamos conociendo cómo trabajas hoy: cuánta gente atiende, cómo manejas cancelaciones, qué herramientas usas. Esto nos sirve para que tu asistente virtual entienda el contexto de tu negocio y responda como lo haría alguien de tu equipo, no como un bot genérico.",
      questions: [
        // ── Esenciales: capturan la operación core para configurar el agente y los workflows.
        { id: "staff_atencion_dedicado", label: "¿Se cuenta con personal dedicado exclusivamente a la atención al cliente?", type: "text_long", output: { target: "context_note", key: "staff_atencion_dedicado" } },
        { id: "capacidad_max_dia", label: "¿Cuál es la capacidad máxima de citas que se pueden tener por día?", type: "number", output: { target: "context_note", key: "capacidad_max_dia" } },
        { id: "herramientas_actuales", label: "¿Qué herramientas o software utilizan actualmente para gestionar citas o clientes?", type: "text_long", output: { target: "context_note", key: "herramientas_actuales" } },
        { id: "manejo_cancelaciones", label: "¿Cómo se manejan las cancelaciones, reprogramaciones y no-shows?", type: "text_long", output: { target: "context_note", key: "manejo_cancelaciones" } },
        { id: "temporadas_alta_demanda", label: "¿Tienen temporadas de mayor demanda? ¿Cuáles son?", type: "text_long", output: { target: "context_note", key: "temporadas_alta_demanda" } },
        // ── Opcionales: el LLM las saltea por defecto. Si el cliente quiere profundizar, las cubre.
        { id: "citas_simultaneas", label: "¿Cuántas citas o servicios pueden gestionarse en simultáneo?", type: "number", essential: false, output: { target: "context_note", key: "citas_simultaneas" } },
        { id: "pct_digital", label: "¿Qué porcentaje de sus clientes agenda citas por medios digitales?", type: "number", essential: false, output: { target: "context_note", key: "pct_digital" } },
        { id: "pct_recurrentes", label: "¿Qué porcentaje de sus clientes es recurrente?", type: "number", essential: false, output: { target: "context_note", key: "pct_recurrentes" } },
        { id: "proceso_facturacion", label: "¿Cómo maneja los procesos de facturación y cobranza?", type: "text_long", essential: false, output: { target: "context_note", key: "proceso_facturacion" } },
        { id: "tiene_db_clientes", label: "¿Tienen una base de datos de clientes con email, nombre, teléfono y valor de compra?", type: "text_long", essential: false, output: { target: "context_note", key: "tiene_db_clientes" } },
        { id: "mejores_clientes", label: "¿Tiene identificados quiénes son sus mejores clientes? ¿Qué los hace diferentes?", type: "text_long", essential: false, output: { target: "context_note", key: "mejores_clientes" } },
        { id: "adopcion_software_staff", label: "¿Qué tan probable es que su equipo pueda aprender a usar una nueva plataforma?", type: "text_long", essential: false, output: { target: "context_note", key: "adopcion_software_staff" } },
        { id: "programa_fidelidad", label: "¿Tiene algún programa de fidelidad o recompensas para clientes recurrentes?", type: "text_long", essential: false, output: { target: "context_note", key: "programa_fidelidad" } },
        { id: "incentivar_retorno", label: "¿Cómo incentivan a sus clientes a regresar?", type: "text_long", essential: false, output: { target: "context_note", key: "incentivar_retorno" } },
        { id: "incentivar_referidos", label: "¿Cómo incentivan a sus clientes y empleados a recomendar sus servicios?", type: "text_long", essential: false, output: { target: "context_note", key: "incentivar_referidos" } },
        { id: "incentivos_vendedores", label: "¿Cuentan con incentivos o modelos de compensación para sus vendedores/agentes?", type: "text_long", essential: false, output: { target: "context_note", key: "incentivos_vendedores" } },
        { id: "incentivos_partners", label: "¿Sus proveedores y socios tienen incentivo de promover sus servicios? ¿Cuáles?", type: "text_long", essential: false, output: { target: "context_note", key: "incentivos_partners" } },
        { id: "frecuencia_capacitacion", label: "¿Qué tan frecuente es la capacitación de su personal de atención al cliente?", type: "text_long", essential: false, output: { target: "context_note", key: "frecuencia_capacitacion" } },
        { id: "servicios_subsecuentes", label: "¿Sus clientes agendan típicamente servicios subsecuentes?", type: "text_long", essential: false, output: { target: "context_note", key: "servicios_subsecuentes" } },
      ],
    },
    {
      id: "oportunidades_kwiq",
      title: "Oportunidades Kwiq",
      sourceSheet: "(derivado — detección de upsell)",
      order: 15,
      intent:
        "Detectar qué activos digitales le faltan al cliente para ofrecerlos como servicios adicionales de Kwiq (website, branding, dominio, hosting, línea WhatsApp Business, CRM). Cada pregunta booleana se enruta a `upsell_flag`: si el cliente NO tiene el activo, el generador agrega el código del producto al array `upsells` del autoconfig para que el admin lo vea como badge en /admin/proyectos/[slug].",
      description:
        "Antes de configurar GHL queremos entender qué ya tenés y qué podríamos ayudarte a construir. Respondé honestamente — si te falta algo, Kwiq lo puede armar.",
      narrative_intro:
        "Antes de configurar tu CRM queremos saber qué piezas ya tienes (web, branding, dominio, WhatsApp Business). No es para venderte nada de golpe — es para que el equipo Kwiq sepa si hay que armar algo desde cero o solo conectar lo que ya existe. Responde con calma.",
      questions: [
        {
          id: "tiene_website",
          label: "¿Tenés página web activa?",
          type: "boolean",
          output: { target: "upsell_flag", key: "website_build" },
          guidance:
            "Si responde que no, ofrece que Kwiq arme una landing o sitio completo. Si dice que sí pero 'está vieja' o 'no me gusta', marcar también como oportunidad de rediseño.",
        },
        {
          id: "tiene_branding",
          label: "¿Tenés branding definido (logo, paleta de colores, guidelines)?",
          type: "boolean",
          output: { target: "upsell_flag", key: "branding_build" },
          guidance:
            "Si no tiene branding, Kwiq puede construir identidad visual desde cero (logo + paleta + tipografía + brandbook básico).",
        },
        {
          id: "tiene_dominio",
          label: "¿Tenés dominio propio (ej. minegocio.com)?",
          type: "boolean",
          output: { target: "upsell_flag", key: "domain_purchase" },
          guidance:
            "Si no, Kwiq lo puede comprar y administrar. Si tiene pero no recuerda dónde, marcalo también (probable auditoría + migración).",
        },
        {
          id: "tiene_hosting",
          label: "¿Tenés hosting activo para tu web?",
          type: "boolean",
          output: { target: "upsell_flag", key: "hosting_setup" },
          guidance:
            "Si no, Kwiq ofrece hosting administrado. Si el sitio va a vivir en GHL, esta bandera también se usa para configurar el dominio dentro de GHL Sites.",
        },
        {
          id: "tiene_whatsapp_business",
          label: "¿Tenés línea de WhatsApp Business API (no la app gratis)?",
          type: "boolean",
          output: { target: "upsell_flag", key: "whatsapp_line" },
          guidance:
            "Aclarar: la app de WhatsApp Business normal NO sirve para el agente IA. Necesita WhatsApp Business API (vía Meta + LC Phone o Twilio). Si no la tiene, marcar como upsell crítico.",
        },
        {
          id: "tiene_crm_actual",
          label: "¿Usás algún CRM hoy (HubSpot, Pipedrive, Salesforce, GHL, otro)?",
          type: "text_short",
          output: { target: "upsell_flag", key: "crm_onboarding" },
          guidance:
            "Si responde 'no', marcar como upsell (onboarding completo a GHL). Si menciona otro CRM, capturarlo como texto y marcar para evaluar migración de datos.",
        },
      ],
    },
    {
      id: "informacion_general",
      title: "Información general del negocio",
      sourceSheet: "Información General",
      order: 20,
      intent:
        "Datos fijos que se repiten y terminan como Custom Values en la Location de GHL (email, teléfono, web, redes, ubicaciones, servicios).",
      description: "Datos fijos de tu negocio que se repiten siempre (dirección, teléfono, precios, servicios, redes).",
      narrative_intro:
        "Ahora vamos por la información que tu asistente virtual va a usar todo el día: nombre comercial, teléfono, dirección, web, redes sociales. Esto se guarda como variables reutilizables en tu CRM — cuando un cliente pregunte 'dónde están ubicados', el bot ya tiene la respuesta exacta sin inventar.",
      questions: [
        { id: "mail_contacto", label: "Mail de contacto", type: "email", output: { target: "ghl_custom_value", key: "mail_de_contacto", folder: "Contacto" } },
        { id: "pagina_web", label: "Página Web", type: "url", output: { target: "ghl_custom_value", key: "pagina_web", folder: "Contacto" } },
        { id: "telefono_contacto", label: "Teléfono de contacto", type: "phone", output: { target: "ghl_custom_value", key: "telefono_de_contacto", folder: "Contacto" } },
        { id: "nombre_ia", label: "Nombre de la IA (cómo se llamará el asistente)", type: "text_short", output: { target: "ghl_custom_value", key: "nombre_de_la_ia", folder: "Inteligencia Artificial" } },
        { id: "aviso_privacidad", label: "Aviso de privacidad (URL o texto)", type: "text_long", output: { target: "ghl_custom_value", key: "aviso_de_privacidad", folder: "Legal" } },
        { id: "terminos_condiciones", label: "Términos y Condiciones (URL o texto)", type: "text_long", output: { target: "ghl_custom_value", key: "terminos_y_condiciones", folder: "Legal" } },
        { id: "doctoralia", label: "Doctoralia (URL)", type: "url", required: false, essential: false, output: { target: "ghl_custom_value", key: "doctoralia", folder: "Redes Sociales" } },
        { id: "facebook", label: "Facebook (URL)", type: "url", required: false, essential: false, output: { target: "ghl_custom_value", key: "facebook", folder: "Redes Sociales" } },
        { id: "instagram", label: "Instagram (URL)", type: "url", required: false, essential: false, output: { target: "ghl_custom_value", key: "instagram", folder: "Redes Sociales" } },
        { id: "whatsapp_business", label: "WhatsApp Business (link)", type: "url", required: false, essential: false, output: { target: "ghl_custom_value", key: "whatsapp_business", folder: "Redes Sociales" } },
        { id: "tiktok", label: "TikTok (URL)", type: "url", required: false, essential: false, output: { target: "ghl_custom_value", key: "tiktok", folder: "Redes Sociales" } },
      ],
    },
    {
      id: "branding",
      title: "Identidad de marca",
      sourceSheet: "(derivado — captura de activos)",
      order: 22,
      intent:
        "Reunir los activos visuales del cliente (logo, paleta de colores, tipografías, manual de marca) para que el equipo Kwiq los use al configurar templates de emails, páginas, mensajes y material del agente IA. Los archivos se suben a Supabase Storage y se indexan en la tabla branding_assets; los valores de texto (hex de colores, nombre de tipografías) se guardan como context_note para el prompt del agente.",
      description:
        "Vamos a necesitar tus activos de marca — logo, paleta, tipografías. Si los tenés a mano, los podés arrastrar al chat. Si no, te damos un link para subirlos después.",
      narrative_intro:
        "Pasamos a tu identidad visual: logo, colores, tipografías. Los archivos los puedes arrastrar directo al chat. Esto se usa cuando armemos plantillas de correos, mensajes y material que tu asistente envía al cliente — para que todo se vea con tu marca, no con la de Kwiq.",
      questions: [
        {
          id: "marca_tiene_logo",
          label: "¿Tenés un logotipo oficial?",
          type: "boolean",
          output: { target: "context_note", key: "marca_tiene_logo" },
          guidance:
            "Si responde que sí, ofrecele explícitamente arrastrar el archivo (PNG, SVG, PDF) al chat. Aceptar también respuesta tipo 'te lo mando después'.",
        },
        {
          id: "marca_logo_asset",
          label: "Logo (arrastrá el archivo al chat)",
          type: "file",
          required: false,
          output: { target: "branding_asset", key: "logo" },
          hint: "PNG, SVG o PDF. Mejor si es vectorial (SVG).",
        },
        {
          id: "marca_tiene_paleta",
          label: "¿Tenés paleta de colores definida?",
          type: "boolean",
          output: { target: "context_note", key: "marca_tiene_paleta" },
        },
        {
          id: "marca_colores_hex",
          label: "Códigos de color (hex) — primario, secundario, acentos",
          type: "text_long",
          required: false,
          output: { target: "context_note", key: "marca_colores_hex" },
          guidance:
            "Si el cliente los conoce, capturalos en formato `#RRGGBB`. Si no los tiene de memoria, aceptá una imagen de referencia de la paleta.",
        },
        {
          id: "marca_paleta_asset",
          label: "Imagen/PDF de la paleta (opcional)",
          type: "file",
          required: false,
          output: { target: "branding_asset", key: "palette" },
        },
        {
          id: "marca_tiene_tipografia",
          label: "¿Tenés tipografías oficiales?",
          type: "boolean",
          output: { target: "context_note", key: "marca_tiene_tipografia" },
        },
        {
          id: "marca_tipografia_nombres",
          label: "Nombres de las tipografías (títulos + cuerpo)",
          type: "text_long",
          required: false,
          output: { target: "context_note", key: "marca_tipografia_nombres" },
          guidance:
            "Ej.: 'Antonio (títulos) + Poppins (body)'. Si el cliente tiene archivos propios (.woff, .ttf, .otf), ofrecele subirlos.",
        },
        {
          id: "marca_tipografia_asset",
          label: "Archivos de fuentes (.woff/.ttf/.otf)",
          type: "file",
          required: false,
          output: { target: "branding_asset", key: "font" },
        },
        {
          id: "marca_brandbook_asset",
          label: "Brandbook / manual de marca (PDF)",
          type: "file",
          required: false,
          output: { target: "branding_asset", key: "brandbook" },
        },
        {
          id: "marca_notas",
          label: "Notas adicionales de identidad (tono visual, referencias, 'qué NO usar')",
          type: "text_long",
          required: false,
          output: { target: "context_note", key: "marca_notas" },
        },
      ],
    },
    {
      id: "ubicaciones",
      title: "Ubicaciones físicas",
      sourceSheet: "Información General",
      order: 25,
      intent: "Por cada sucursal: nombre, dirección, Google Maps URL y URL de reseña. Van a Custom Values agrupados por letra (A, B, C…).",
      description: "Si tu negocio opera en varias sucursales, configuraremos una por cada una.",
      narrative_intro:
        "Si atiendes en más de un lugar (sucursales, sedes, oficinas), las cargamos aquí una por una con dirección, Google Maps y enlace de reseñas. El asistente las usa para responder ubicación, dar indicaciones de cómo llegar y enviar el enlace correcto al cliente que te elige por zona.",
      repeatable: { unit: "ubicación", min: 1 },
      questions: [
        { id: "ubicacion_nombre", label: "Nombre de la ubicación (ej. Sucursal Polanco)", type: "text_short", output: { target: "ghl_custom_value", folder: "Ubicaciones", key: "ubicacion" } },
        { id: "ubicacion_direccion", label: "Dirección completa", type: "text_long", output: { target: "ghl_custom_value", folder: "Ubicaciones", key: "direccion" } },
        { id: "ubicacion_google_maps", label: "URL de Google Maps", type: "url", output: { target: "ghl_custom_value", folder: "Ubicaciones", key: "google_maps_url" } },
        { id: "ubicacion_resena", label: "URL de reseña de GMB", type: "url", output: { target: "ghl_custom_value", folder: "Ubicaciones", key: "resena_url" } },
      ],
    },
    {
      id: "personal",
      title: "Personal clave",
      sourceSheet: "Personal",
      order: 30,
      intent: "Usuarios que van a operar la plataforma. Se crearán como GHL Users con roles y permisos.",
      description: "Agreguemos a las personas que estarán interactuando con la plataforma.",
      narrative_intro:
        "Toca cargar al equipo que va a usar el CRM: tu gente de atención, ventas o administración. Cada persona va a tener su propio acceso con permisos personalizados. Esto define quién puede ver qué (ejemplo: si quieres que ventas no vea ingresos, lo aclaras aquí).",
      repeatable: { unit: "persona", min: 1 },
      questions: [
        { id: "user_nombre", label: "Nombre completo", type: "text_short", output: { target: "ghl_user", key: "firstName+lastName" } },
        { id: "user_correo", label: "Correo electrónico", type: "email", output: { target: "ghl_user", key: "email" } },
        { id: "user_telefono", label: "Teléfono", type: "phone", output: { target: "ghl_user", key: "phone" } },
        { id: "user_rol", label: "Rol", type: "select_single", options: ["Admin", "User"], output: { target: "ghl_user", key: "role" } },
        { id: "user_restricciones", label: "Restricciones de permisos (ej. no ve ingresos, no ve contactos)", type: "text_long", required: false, output: { target: "ghl_user", key: "permissions" } },
      ],
    },
    {
      id: "servicios_productos",
      title: "Servicios y productos",
      sourceSheet: "ServiciosProductos",
      order: 40,
      intent: "Catálogo de servicios que la IA va a ofrecer. Va al prompt de Conversation AI y, si aplica, como productos en GHL.",
      description: "¿Cómo le presentas hoy a tus clientes tu oferta? Vamos uno por uno.",
      narrative_intro:
        "Llegamos al catálogo: los servicios o productos que ofreces. Cada uno con su nombre, precio público (si lo manejas abierto), duración. Esto es CRÍTICO porque tu asistente solo puede informar precios y reservar lo que está aquí cargado — todo lo que no esté cargado, lo va a derivar a una persona del equipo.",
      repeatable: { unit: "servicio", min: 1 },
      questions: [
        { id: "servicio_categoria", label: "Categoría del servicio", type: "text_short", output: { target: "ghl_service_product", key: "category" } },
        { id: "servicio_nombre", label: "Nombre", type: "text_short", output: { target: "ghl_service_product", key: "name" } },
        { id: "servicio_descripcion", label: "Descripción breve / qué incluye (cómo se lo explicarías a un cliente por mensaje)", type: "text_long", output: { target: "ghl_service_product", key: "description" } },
        { id: "servicio_politicas_agenda", label: "Políticas de agenda (anticipación, cancelación, etc.)", type: "text_long", output: { target: "ghl_service_product", key: "scheduling_policy" } },
        { id: "servicio_costo_interno", label: "Costo interno", type: "currency", required: false, output: { target: "ghl_service_product", key: "internal_cost" } },
        { id: "servicio_precio", label: "Precio público", type: "currency", output: { target: "ghl_service_product", key: "price" } },
        { id: "servicio_precio_descuento", label: "Precio con descuento", type: "currency", required: false, output: { target: "ghl_service_product", key: "discount_price" } },
        { id: "servicio_requiere_anticipo", label: "¿Requiere anticipo?", type: "boolean", output: { target: "ghl_service_product", key: "requires_deposit" } },
        { id: "servicio_duracion", label: "Tiempo por servicio (minutos)", type: "number", output: { target: "ghl_service_product", key: "duration_min" } },
        { id: "servicio_financiamiento", label: "Opciones de financiamiento (MSI, seguro, directo, etc.)", type: "text_long", required: false, output: { target: "ghl_service_product", key: "financing" } },
        { id: "servicio_audiencia", label: "Audiencia clave (a quién le sirve)", type: "text_long", output: { target: "ghl_service_product", key: "audience" } },
      ],
    },
    {
      id: "calendarios",
      title: "Calendarios",
      sourceSheet: "Calendarios",
      order: 50,
      intent: "Configuración de calendarios de GHL (Round Robin/Event/Service/Collective/Class).",
      description: "Configuremos cómo se organizan tus calendarios digitales.",
      narrative_intro:
        "Vamos a configurar tus calendarios en línea. Esto define qué horarios tiene cada servicio, quién atiende cuándo y de qué manera se reservan. Es lo que el asistente usa para mostrar al cliente los espacios reales disponibles — sin inventar horarios, sin doble reserva.",
      repeatable: { unit: "calendario", min: 1 },
      questions: [
        { id: "cal_sucursal", label: "Código de sucursal al que pertenece", type: "text_short", output: { target: "ghl_calendar", key: "location_ref" } },
        { id: "cal_nombre", label: "Nombre del calendario", type: "text_short", output: { target: "ghl_calendar", key: "name" } },
        { id: "cal_asignados", label: "Personas asignadas (nombres o IDs de la sección Personal)", type: "text_long", output: { target: "ghl_calendar", key: "assignedUserIds" } },
        { id: "cal_lugar_reunion", label: "Lugar de la reunión (presencial, Zoom, Google Meet, teléfono)", type: "select_single", options: ["Presencial", "Zoom", "Google Meet", "Teléfono", "Custom"], output: { target: "ghl_calendar", key: "meeting_location" } },
        { id: "cal_grupo", label: "Grupo de calendario (para agruparlos en GHL)", type: "text_short", required: false, output: { target: "ghl_calendar", key: "group" } },
        { id: "cal_sala", label: "Sala asignada", type: "text_short", required: false, output: { target: "ghl_calendar", key: "room" } },
        { id: "cal_equipamiento", label: "Equipamiento requerido", type: "text_long", required: false, output: { target: "ghl_calendar", key: "equipment" } },
        { id: "cal_horario_lun", label: "Horario disponible lunes (ej. 09:00-18:00)", type: "text_short", output: { target: "ghl_calendar", key: "weeklyAvailability.Mon" } },
        { id: "cal_horario_mar", label: "Horario disponible martes", type: "text_short", output: { target: "ghl_calendar", key: "weeklyAvailability.Tue" } },
        { id: "cal_horario_mie", label: "Horario disponible miércoles", type: "text_short", output: { target: "ghl_calendar", key: "weeklyAvailability.Wed" } },
        { id: "cal_horario_jue", label: "Horario disponible jueves", type: "text_short", output: { target: "ghl_calendar", key: "weeklyAvailability.Thu" } },
        { id: "cal_horario_vie", label: "Horario disponible viernes", type: "text_short", output: { target: "ghl_calendar", key: "weeklyAvailability.Fri" } },
        { id: "cal_horario_sab", label: "Horario disponible sábado", type: "text_short", required: false, essential: false, output: { target: "ghl_calendar", key: "weeklyAvailability.Sat" } },
        { id: "cal_horario_dom", label: "Horario disponible domingo", type: "text_short", required: false, essential: false, output: { target: "ghl_calendar", key: "weeklyAvailability.Sun" } },
        { id: "cal_timezone", label: "Huso horario", type: "text_short", output: { target: "ghl_calendar", key: "timezone" } },
        { id: "cal_exclusiones", label: "Exclusiones / fuera de horario (días feriados, cierres)", type: "text_long", required: false, essential: false, output: { target: "ghl_calendar", key: "dateSpecificHours" } },
        { id: "cal_ocupado_pct", label: "Porcentaje de bloque buffer (muéstrate ocupado %)", type: "number", required: false, essential: false, output: { target: "ghl_calendar", key: "busy_buffer_pct" } },
        { id: "cal_duracion", label: "Duración de la reunión (minutos)", type: "number", output: { target: "ghl_calendar", key: "slotDuration" } },
        { id: "cal_aviso_minimo", label: "Aviso mínimo de programación", type: "text_short", essential: false, output: { target: "ghl_calendar", key: "minSchedulingNotice" } },
        { id: "cal_max_dia", label: "Reservas máximas por día", type: "number", output: { target: "ghl_calendar", key: "maxBookingsPerDay" } },
        { id: "cal_max_slot", label: "Máximo de reservas por franja", type: "number", essential: false, output: { target: "ghl_calendar", key: "appointmentsPerSlot" } },
        { id: "cal_buffer_prep", label: "Margen de preparación (minutos)", type: "number", required: false, essential: false, output: { target: "ghl_calendar", key: "preBufferTime" } },
        { id: "cal_tiempo_cancelacion", label: "Tiempo permitido para cancelar/reprogramar", type: "text_short", essential: false, output: { target: "ghl_calendar", key: "cancellation_window" } },
      ],
    },
    {
      id: "info_contacto",
      title: "Preguntas al cliente al agendar",
      sourceSheet: "Información de Contacto",
      order: 55,
      intent: "Preguntas adicionales que se le hacen al cliente/paciente antes o al momento de agendar. Se convierten en Custom Fields de tipo Contact.",
      description: "¿Qué datos adicionales pides a tus pacientes/clientes antes de su cita?",
      narrative_intro:
        "Algunos negocios necesitan datos extra del cliente antes de la cita — por ejemplo seguro médico, talla, motivo de consulta, alergias. Cargamos cada pregunta que quieras hacer y el asistente las va a pedir en orden cuando alguien quiera agendar. Si no necesitas nada extra, puedes saltar esta sección.",
      repeatable: { unit: "pregunta" },
      questions: [
        { id: "pregunta_texto", label: "Pregunta exacta que quieres hacer", type: "text_long", output: { target: "ghl_custom_field_contact", key: "label" } },
        { id: "pregunta_tipo", label: "Tipo de respuesta esperada", type: "select_single", options: ["Texto corto", "Texto largo", "Número", "Opción única", "Opción múltiple", "Fecha"], output: { target: "ghl_custom_field_contact", key: "type" } },
        { id: "pregunta_opciones", label: "Si es opción única o múltiple, ¿cuáles son las opciones?", type: "text_long", required: false, output: { target: "ghl_custom_field_contact", key: "options" } },
      ],
    },
    {
      id: "pipeline",
      title: "Embudo de conversión",
      sourceSheet: "Embudo de conversión",
      order: 60,
      intent: "Pipeline de GHL con stages. Default sugerido viene cargado pero el cliente puede editar.",
      description: "Vamos a definir las etapas por las que pasa un lead. Ya tenemos una propuesta, podés ajustarla.",
      narrative_intro:
        "Ahora definimos las etapas por las que pasa un cliente potencial — desde 'nuevo prospecto' hasta 'venta cerrada'. Te traemos una propuesta base que funciona para la mayoría de negocios; la puedes ajustar al instante. Esto te va a permitir ver en un tablero visual dónde está cada oportunidad.",
      repeatable: { unit: "etapa", min: 1 },
      questions: [
        { id: "stage_nombre", label: "Nombre de la etapa", type: "text_short", output: { target: "ghl_pipeline_stage", key: "name" } },
        { id: "stage_descripcion", label: "Descripción de la etapa (cuándo entra un contacto acá)", type: "text_long", output: { target: "ghl_pipeline_stage", key: "description" } },
        { id: "stage_servicios", label: "Servicios asociados a esta etapa (si aplica)", type: "text_long", required: false, essential: false, output: { target: "ghl_pipeline_stage", key: "services_ref" } },
        { id: "stage_notif_email", label: "¿Notificar por correo al entrar a esta etapa?", type: "boolean", essential: false, output: { target: "ghl_pipeline_stage", key: "notify_email" } },
        { id: "stage_notif_wa", label: "¿Notificar por WhatsApp al entrar?", type: "boolean", essential: false, output: { target: "ghl_pipeline_stage", key: "notify_whatsapp" } },
        { id: "stage_seguimiento", label: "Seguimiento personalizado en esta etapa", type: "text_long", required: false, essential: false, output: { target: "ghl_pipeline_stage", key: "custom_followup" } },
      ],
    },
    {
      id: "listas_inteligentes",
      title: "Listas inteligentes (Tags)",
      sourceSheet: "Listas Inteligentes",
      order: 70,
      intent: "Tags especiales de GHL para segmentación. Vienen con un default sugerido.",
      description: "Etiquetas que queremos usar para segmentar contactos.",
      narrative_intro:
        "Las etiquetas son la forma de agrupar contactos en tu CRM — por ejemplo 'cliente VIP', 'interesado en blanqueamiento', 'paga con tarjeta'. Te permiten luego armar campañas específicas para cada grupo. Define qué grupos te interesa tener separados.",
      repeatable: { unit: "etiqueta" },
      questions: [
        { id: "tag_nombre", label: "Nombre de la lista/etiqueta", type: "text_short", output: { target: "ghl_tag", key: "name" } },
        { id: "tag_proposito", label: "Propósito de usar esta etiqueta", type: "text_long", output: { target: "ghl_tag", key: "purpose" } },
        { id: "tag_comentarios", label: "Comentarios adicionales", type: "text_long", required: false, output: { target: "ghl_tag", key: "notes" } },
      ],
    },
    {
      id: "handoff",
      title: "Transferencia a humano",
      sourceSheet: "Transferencia a Humano",
      order: 80,
      intent: "Reglas de cuándo y cómo transferir de la IA a un humano. Alimenta workflows de GHL y el prompt del agente.",
      description: "Cuándo la IA le pasa la conversación a alguien del equipo, y cómo se entera esa persona.",
      narrative_intro:
        "El asistente virtual no va a manejar todo: hay momentos en que tiene que pasarle la conversación a una persona real. Define aquí cuáles son esos disparadores (urgencias, reclamos, decisiones grandes) y cómo quieres que se avise al equipo (notificación en la app, correo, WhatsApp).",
      repeatable: { unit: "regla" },
      questions: [
        { id: "handoff_usuario", label: "Usuario asignado (de la sección Personal)", type: "text_short", output: { target: "ghl_workflow_handoff", key: "assignedUserId" } },
        { id: "handoff_activador", label: "Activador (ej. palabra clave, tag, intent)", type: "text_long", output: { target: "ghl_workflow_handoff", key: "trigger" } },
        { id: "handoff_notificacion", label: "Mensaje de notificación al asignado", type: "text_long", output: { target: "ghl_workflow_handoff", key: "notification_text" } },
        { id: "handoff_canal_app", label: "¿Notificar dentro de la app?", type: "boolean", essential: false, output: { target: "ghl_workflow_handoff", key: "notify_app" } },
        { id: "handoff_canal_email", label: "¿Notificar por correo?", type: "boolean", essential: false, output: { target: "ghl_workflow_handoff", key: "notify_email" } },
        { id: "handoff_canal_wa", label: "¿Notificar por WhatsApp?", type: "boolean", essential: false, output: { target: "ghl_workflow_handoff", key: "notify_whatsapp" } },
      ],
    },
    {
      id: "custom_fields_extra",
      title: "Campos personalizados adicionales",
      sourceSheet: "Custom Fields",
      order: 90,
      intent: "Custom Fields extra (más allá de los 52 default) que el negocio necesita para tracking propio.",
      description: "¿Qué información extra del cliente o de la oportunidad querés capturar?",
      narrative_intro:
        "Más allá de los campos estándar (nombre, correo, teléfono), a veces hay datos propios de tu negocio que quieres guardar — número de socio, seguro médico, tipo de vehículo, lo que sea. Carga aquí esos campos extra y los vamos a sumar al CRM.",
      repeatable: { unit: "campo" },
      questions: [
        { id: "cf_categoria", label: "Aplica a Contacto u Oportunidad", type: "select_single", options: ["Contacto", "Oportunidad"], output: { target: "ghl_custom_field_contact", key: "category" } },
        { id: "cf_nombre", label: "Nombre del campo", type: "text_short", output: { target: "ghl_custom_field_contact", key: "name" } },
        { id: "cf_tipo", label: "Tipo", type: "select_single", options: ["Una sola línea", "Varias líneas", "Menú desplegable único", "Seleccionar botón de opción", "Fecha", "Número", "Archivo"], output: { target: "ghl_custom_field_contact", key: "type" } },
        { id: "cf_carpeta", label: "Carpeta (folder) y subcarpeta", type: "text_short", required: false, output: { target: "ghl_custom_field_contact", key: "folder" } },
      ],
    },
    {
      id: "activos_digitales",
      title: "Redes sociales y activos digitales",
      sourceSheet: "Activos Digitales y Redes Socia",
      order: 100,
      intent:
        "Credenciales e invitaciones a cuentas externas para que el equipo Kwiq pueda configurar. Se guardan cifradas y se rotan al terminar.",
      description:
        "Necesitamos acceso temporal a tus cuentas. Al terminar salimos y vos actualizás contraseñas.",
      narrative_intro:
        "Para que el equipo Kwiq pueda conectar tus redes y cuentas (Instagram, Facebook, dominio, hosting, etc.) necesitamos acceso temporal. Las credenciales se guardan cifradas y, una vez que terminamos la configuración, tú cambias todas las contraseñas. Si prefieres invitarnos a tu cuenta en lugar de compartir usuario y contraseña, también está bien.",
      repeatable: { unit: "activo" },
      questions: [
        { id: "asset_nombre", label: "Activo digital (Facebook, Instagram, GMB, Hosting, Dominio…)", type: "text_short", output: { target: "digital_asset_credential", key: "name" } },
        { id: "asset_modo_acceso", label: "Modo de acceso", type: "select_single", options: ["Usuario y contraseña", "Invitación a mi cuenta Kwiq", "No aplica"], output: { target: "digital_asset_credential", key: "access_mode" } },
        { id: "asset_usuario", label: "Usuario (solo si aplica)", type: "text_short", required: false, output: { target: "digital_asset_credential", key: "username" } },
        { id: "asset_password", label: "Contraseña (se guarda cifrada)", type: "text_short", required: false, output: { target: "digital_asset_credential", key: "password" } },
        { id: "asset_2fa", label: "¿Tiene 2FA activado?", type: "boolean", output: { target: "digital_asset_credential", key: "has_2fa" } },
      ],
    },
    {
      id: "agente_ia",
      title: "Diseño del agente de IA",
      sourceSheet: "(derivado — no está en xlsx)",
      order: 110,
      intent: "Meta-sección que consolida toda la entrevista y produce el prompt final de Conversation AI.",
      description: "Definamos personalidad, límites y objetivos de tu asistente virtual.",
      narrative_intro:
        "Última parada — diseñamos a tu asistente virtual. Le ponemos nombre, definimos su tono (cercano, formal, técnico), qué objetivos persigue y en qué casos pasa la conversación a una persona real. Esto se traduce directamente en cómo te va a representar 24/7 ante tus clientes.",
      questions: [
        {
          id: "ia_nombre",
          label: "Nombre del asistente",
          type: "text_short",
          output: { target: "conversation_ai_prompt", key: "persona.name" },
          guidance:
            "Sugerí un nombre humano, fácil de pronunciar, que dé sensación de cercanía sin sonar a robot.",
          suggestions: [
            {
              value: "Sof.IA",
              why: "Juega con 'Sofía' (cálida, cercana) y resalta que es IA sin disfrazarlo. Funciona bien en español y se pronuncia natural en una llamada.",
            },
            {
              value: "Lía",
              why: "Corto, dulce, fácil de recordar. Suena humano pero las letras I-A guiñan que es un asistente inteligente.",
            },
            {
              value: "Tomás",
              why: "Nombre masculino clásico, da confianza profesional. Buena opción si tu negocio tiene un tono más formal o sectores como legal, finanzas, salud.",
            },
            {
              value: "Vera",
              why: "Significa 'verdad' en latín. Transmite confiabilidad y honestidad — ideal para asesores, coaches o servicios donde la transparencia vende.",
            },
            {
              value: "Nico",
              why: "Andrógino, juvenil, casual. Encaja con marcas frescas, gastronomía, fitness, lifestyle. Una opción si querés alejarte del formato 'recepcionista'.",
            },
            {
              value: "Aura",
              why: "Etéreo, evocador. Funciona para bienestar, estética, yoga, terapias holísticas. Genera identidad de marca, no solo 'asistente genérico'.",
            },
          ],
        },
        { id: "ia_tono", label: "Tono (formal, amistoso, experto, cercano…)", type: "text_short", output: { target: "conversation_ai_prompt", key: "persona.tone" } },
        { id: "ia_objetivo", label: "Objetivo principal (calificar leads, agendar citas, informar, soporte…)", type: "text_long", output: { target: "conversation_ai_prompt", key: "objective" } },
        { id: "ia_punto_corte", label: "¿Hasta dónde llega la IA? ¿En qué momento pasa a humano?", type: "text_long", output: { target: "conversation_ai_prompt", key: "handoff_criteria" } },
        { id: "ia_temas_prohibidos", label: "Temas que NO debe tocar", type: "text_long", required: false, output: { target: "conversation_ai_prompt", key: "forbidden_topics" } },
        {
          id: "ia_idioma",
          label: "¿En qué idioma debe responder el asistente?",
          type: "select_single",
          options: [
            "Español neutro",
            "Español de México",
            "Español rioplatense (Argentina/Uruguay)",
            "Español de Colombia",
            "Español de España",
            "Inglés",
            "Portugués",
            "Bilingüe (detectar el idioma del cliente y responder en el mismo)",
          ],
          output: { target: "conversation_ai_prompt", key: "language" },
        },
      ],
    },
  ],
};

export function getSectionById(id: string): SectionDef | undefined {
  return INTERVIEW.sections.find((s) => s.id === id);
}

export function sectionOrder(): SectionDef[] {
  return [...INTERVIEW.sections].sort((a, b) => a.order - b.order);
}

/**
 * Busca una pregunta por su id en todas las secciones. Útil para que la UI
 * del chat pueda mostrar sugerencias o helpers de la pregunta activa.
 */
export function getQuestionById(id: string): QuestionDef | undefined {
  for (const s of INTERVIEW.sections) {
    const q = s.questions.find((q) => q.id === id);
    if (q) return q;
  }
  return undefined;
}

import { INTERVIEW, type QuestionDef, type SectionDef } from "../interview-schema";

/** Forma del JSON de auto-configuración que consume el agente de provisioning de GHL. */
export interface GhlAutoConfig {
  version: string;
  generated_at: string;
  company: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
  };
  custom_fields: Array<{
    field_key: string;
    name: string;
    data_type: string; // "TEXT" | "LARGE_TEXT" | "NUMERICAL" | "DATE" | "PHONE" | "EMAIL" | "SINGLE_OPTIONS" | "MULTIPLE_OPTIONS" | "RADIO" | "CHECKBOX" | "FILE_UPLOAD" | "MONETORY"
    model: "contact" | "opportunity";
    options?: string[];
    /** Carpeta donde agruparlo en el panel GHL. Opcional. */
    folder?: string;
    /** Marker interno: agrupa respuestas por `record_index` cuando un
     *  custom_field se construye desde varias preguntas. Se descarta al
     *  serializar al provisioner. */
    __record?: number;
  }>;
  custom_values: Array<{ key: string; value: unknown }>;
  pipelines: Array<{
    name: string;
    stages: Array<{ name: string; position: number }>;
  }>;
  calendars: Array<{
    name: string;
    slug?: string;
    type?: string;
    duration_min?: number;
    buffer_before_min?: number;
    buffer_after_min?: number;
    timezone?: string;
    availability?: Record<string, { start: string; end: string }[]>;
    raw: Record<string, unknown>;
  }>;
  tags: Array<{ name: string }>;
  users: Array<{ name?: string; email?: string; role?: string; raw: Record<string, unknown> }>;
  services_products: Array<Record<string, unknown>>;
  handoff_rules: Array<Record<string, unknown>>;
  digital_assets: Array<{ platform: string; url?: string; credentials_ref?: string; raw: Record<string, unknown> }>;
  context_notes: Record<string, unknown>;
  /**
   * Oportunidades de upsell detectadas durante la entrevista.
   * Cada entry es el `key` declarado en el schema (website_build, branding_build,
   * domain_purchase, hosting_setup, whatsapp_line, crm_onboarding…). Solo se agrega
   * si el cliente respondió "no tengo" a la pregunta `upsell_flag`. El panel
   * /admin/proyectos/[slug] renderiza estos como badges "Oportunidad: …".
   */
  upsells: string[];
  raw_answers: Array<{ section_id: string; question_id: string; record_index: number; value: unknown; confidence: number }>;
}

/** Fila cruda tal como viene de `interview_answers` en Supabase. */
export interface AnswerRow {
  section_id: string;
  question_id: string;
  record_index: number;
  value: unknown;
  confidence: number | null;
}

/**
 * Construye el payload `ghl_autoconfig_json` a partir de las respuestas capturadas.
 * Es declarativo: recorre el schema, y para cada respuesta la envía al bucket
 * correcto según `question.output.target`.
 */
export function buildGhlAutoConfig(
  answers: AnswerRow[],
  companyHint?: { name?: string | null; email?: string | null },
): GhlAutoConfig {
  const byKey = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const k = `${a.section_id}:${a.question_id}`;
    const bucket = byKey.get(k) ?? [];
    bucket.push(a);
    byKey.set(k, bucket);
  }

  const out: GhlAutoConfig = {
    version: INTERVIEW.version,
    generated_at: new Date().toISOString(),
    company: {
      name: companyHint?.name ?? null,
      email: companyHint?.email ?? null,
      phone: null,
      website: null,
      address: null,
    },
    custom_fields: [],
    custom_values: [],
    pipelines: [],
    calendars: [],
    tags: [],
    users: [],
    services_products: [],
    handoff_rules: [],
    digital_assets: [],
    context_notes: {},
    upsells: [],
    raw_answers: answers.map((a) => ({
      section_id: a.section_id,
      question_id: a.question_id,
      record_index: a.record_index,
      value: a.value,
      confidence: a.confidence ?? 0,
    })),
  };

  // Pipeline: las respuestas con target ghl_pipeline_stage se agrupan en un pipeline.
  const pipelineStages: Array<{ name: string; position: number }> = [];

  for (const section of INTERVIEW.sections) {
    for (const q of section.questions) {
      const bucket = byKey.get(`${section.id}:${q.id}`) ?? [];
      for (const ans of bucket) {
        dispatchAnswer(out, section, q, ans, pipelineStages);
      }
    }
  }

  if (pipelineStages.length) {
    out.pipelines.push({
      name: "Embudo de conversión",
      stages: pipelineStages
        .sort((a, b) => a.position - b.position)
        .map((s, i) => ({ name: s.name, position: i + 1 })),
    });
  }

  // Limpieza final: descartamos custom_fields incompletos (sin nombre o
  // field_key) y removemos los marcadores internos `__record`.
  out.custom_fields = out.custom_fields
    .filter((cf) => cf.name && cf.field_key)
    .map(({ __record: _r, ...rest }) => rest);

  return out;
}

function dispatchAnswer(
  out: GhlAutoConfig,
  section: SectionDef,
  q: QuestionDef,
  ans: AnswerRow,
  pipelineStages: Array<{ name: string; position: number }>,
): void {
  const value = ans.value;
  switch (q.output.target) {
    case "ghl_custom_field_contact":
    case "ghl_custom_field_opportunity": {
      // Las preguntas de la sección "Campos personalizados adicionales"
      // comparten `record_index` y describen 4 atributos del mismo
      // custom_field: category (= model), name, type (= data_type),
      // folder. Agrupamos por record_index — si ya existe un cf con
      // ese record, le mergeamos los atributos en lugar de pushear
      // uno nuevo.
      const idx = ans.record_index ?? 0;
      const attrKey = q.output.key ?? q.id;
      let cf = out.custom_fields.find((c) => c.__record === idx);
      if (!cf) {
        cf = {
          field_key: "",
          name: "",
          data_type: "TEXT",
          model:
            q.output.target === "ghl_custom_field_opportunity"
              ? "opportunity"
              : "contact",
          __record: idx,
        };
        out.custom_fields.push(cf);
      }
      const valStr = typeof value === "string" ? value : String(value ?? "");
      switch (attrKey) {
        case "category": {
          // "Contacto" → contact ; "Oportunidad" → opportunity
          cf.model = /oportun/i.test(valStr) ? "opportunity" : "contact";
          break;
        }
        case "name": {
          cf.name = valStr.trim();
          // Derivamos un field_key estable a partir del nombre.
          // (snake_case sin tildes — patrón que GHL acepta).
          cf.field_key = valStr
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
          break;
        }
        case "type": {
          cf.data_type = mapHumanFieldTypeToGhlDataType(valStr);
          if (q.options) cf.options = q.options;
          break;
        }
        case "folder": {
          if (valStr.trim()) cf.folder = valStr.trim();
          break;
        }
        default: {
          // Caso legado: si no es una de las 4 keys conocidas, generar
          // un cf independiente (back-compat).
          out.custom_fields.push({
            field_key: attrKey,
            name: q.label,
            data_type: mapFieldTypeToGhlDataType(q),
            model:
              q.output.target === "ghl_custom_field_opportunity"
                ? "opportunity"
                : "contact",
            options: q.options,
          });
          break;
        }
      }
      break;
    }
    case "ghl_custom_value": {
      out.custom_values.push({ key: q.output.key ?? q.id, value });
      break;
    }
    case "ghl_pipeline_stage": {
      const name = typeof value === "string" ? value : q.label;
      pipelineStages.push({ name, position: ans.record_index });
      break;
    }
    case "ghl_calendar": {
      let calendar = out.calendars.find(
        (c) => (c.raw.__record_index as number | undefined) === ans.record_index,
      );
      if (!calendar) {
        calendar = {
          name: `Calendario ${ans.record_index + 1}`,
          raw: { __record_index: ans.record_index, __section: section.id },
        };
        out.calendars.push(calendar);
      }
      (calendar.raw as Record<string, unknown>)[q.output.key ?? q.id] = value;
      break;
    }
    case "ghl_tag": {
      if (typeof value === "string" && value.trim()) {
        const name = value.trim();
        // GHL acepta tags de hasta ~60 chars. Si la respuesta del LLM
        // trajo una oración entera (ej. la descripción del tag en lugar
        // del nombre), descartamos. El admin Kwiq puede crear el tag a
        // mano después si lo necesita.
        if (name.length > 60) break;
        // Tampoco aceptamos tags multi-línea.
        if (name.includes("\n")) break;
        out.tags.push({ name });
      }
      break;
    }
    case "ghl_user": {
      let user = out.users.find(
        (u) => (u.raw.__record_index as number | undefined) === ans.record_index,
      );
      if (!user) {
        user = { raw: { __record_index: ans.record_index } };
        out.users.push(user);
      }
      (user.raw as Record<string, unknown>)[q.output.key ?? q.id] = value;
      break;
    }
    case "ghl_service_product": {
      let svc = out.services_products.find(
        (s) => (s.__record_index as number | undefined) === ans.record_index,
      );
      if (!svc) {
        svc = { __record_index: ans.record_index };
        out.services_products.push(svc);
      }
      svc[q.output.key ?? q.id] = value;
      break;
    }
    case "ghl_workflow_handoff": {
      let rule = out.handoff_rules.find(
        (r) => (r.__record_index as number | undefined) === ans.record_index,
      );
      if (!rule) {
        rule = { __record_index: ans.record_index };
        out.handoff_rules.push(rule);
      }
      rule[q.output.key ?? q.id] = value;
      break;
    }
    case "digital_asset_credential": {
      let asset = out.digital_assets.find(
        (a) => (a.raw.__record_index as number | undefined) === ans.record_index,
      );
      if (!asset) {
        asset = { platform: q.output.key ?? q.id, raw: { __record_index: ans.record_index } };
        out.digital_assets.push(asset);
      }
      (asset.raw as Record<string, unknown>)[q.output.key ?? q.id] = value;
      break;
    }
    case "ghl_smart_list":
    case "context_note": {
      const key = q.output.key ?? q.id;
      (out.context_notes as Record<string, unknown>)[key] = value;
      break;
    }
    case "conversation_ai_prompt": {
      const key = q.output.key ?? q.id;
      // Lo guardamos en context_notes bajo prefijo "ai_" para que el generador de prompt lo use.
      (out.context_notes as Record<string, unknown>)[`ai_${key}`] = value;
      break;
    }
    case "upsell_flag": {
      const key = q.output.key ?? q.id;
      // Guardamos la respuesta cruda como contexto (útil para el prompt).
      (out.context_notes as Record<string, unknown>)[`upsell_${key}`] = value;
      // Si la respuesta indica ausencia del activo, marcamos la oportunidad.
      if (isNegativeAnswer(value)) {
        if (!out.upsells.includes(key)) out.upsells.push(key);
      }
      break;
    }
  }

  // Promociones especiales si el target "context_note" trae datos de empresa.
  if (q.output.target === "ghl_custom_value") {
    const k = q.output.key ?? q.id;
    if (k === "company_name" || k === "nombre_empresa") out.company.name = str(value);
    if (k === "company_email" || k === "email_empresa") out.company.email = str(value);
    if (k === "company_phone" || k === "telefono_empresa") out.company.phone = str(value);
    if (k === "company_website" || k === "web_empresa") out.company.website = str(value);
    if (k === "company_address" || k === "direccion_empresa") out.company.address = str(value);
  }
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : String(v);
}

/**
 * Devuelve true si la respuesta indica "no tengo eso" — para el dispatcher de
 * `upsell_flag`. Acepta booleans, y strings típicos en español/inglés:
 *   false, "false", "no", "nope", "aún no", "todavía no", "ninguno", "nada",
 *   "no tengo", "no cuento con", "none", "n/a", "na", "".
 *
 * Es deliberadamente generoso: es mejor marcar un upsell de más que de menos,
 * ya que el admin siempre puede ignorar un badge que no aplica.
 */
function isNegativeAnswer(v: unknown): boolean {
  if (v === false) return true;
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  if (s === "") return true;
  if (["false", "0", "n/a", "na", "none", "ninguno", "ninguna", "nada"].includes(s)) return true;
  // Frases típicas de negación en entrevistas.
  if (/^(no|nope|nah)\b/.test(s)) return true;
  if (/\b(a[úu]n no|todav[íi]a no|no tengo|no cuento con|no usamos?|sin\b)/.test(s)) return true;
  return false;
}

/** Mapea el `FieldType` del schema al `dataType` que espera la API de GHL. */
function mapFieldTypeToGhlDataType(q: QuestionDef): string {
  switch (q.type) {
    case "text_short":
      return "TEXT";
    case "text_long":
      return "LARGE_TEXT";
    case "number":
      return "NUMERICAL";
    case "date":
    case "datetime":
    case "time":
      return "DATE";
    case "currency":
      return "MONETORY";
    case "select_single":
      return "SINGLE_OPTIONS";
    case "select_multi":
      return "MULTIPLE_OPTIONS";
    case "radio":
      return "RADIO";
    case "checkbox":
      return "CHECKBOX";
    case "file":
      return "FILE_UPLOAD";
    case "url":
    case "email":
      return "EMAIL";
    case "phone":
      return "PHONE";
    case "boolean":
      return "CHECKBOX";
    default:
      return "TEXT";
  }
}

/**
 * Mapea las labels humanas que el cliente eligió en la entrevista
 * (ej. "Una sola línea", "Varias líneas", "Menú desplegable único") al
 * data_type que GHL espera en POST /customFields.
 */
function mapHumanFieldTypeToGhlDataType(human: string): string {
  const s = human.toLowerCase();
  if (s.includes("varias") || s.includes("largo")) return "LARGE_TEXT";
  if (s.includes("una sola") || s.includes("texto")) return "TEXT";
  if (s.includes("menú") || s.includes("menu") || s.includes("desplegable"))
    return "SINGLE_OPTIONS";
  if (s.includes("opción") || s.includes("opcion") || s.includes("radio"))
    return "RADIO";
  if (s.includes("fecha")) return "DATE";
  if (s.includes("número") || s.includes("numero") || s.includes("cantidad"))
    return "NUMERICAL";
  if (s.includes("archivo") || s.includes("file")) return "FILE_UPLOAD";
  if (s.includes("checkbox")) return "CHECKBOX";
  return "TEXT";
}

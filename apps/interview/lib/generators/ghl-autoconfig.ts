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
      out.custom_fields.push({
        field_key: q.output.key ?? q.id,
        name: q.label,
        data_type: mapFieldTypeToGhlDataType(q),
        model: q.output.target === "ghl_custom_field_opportunity" ? "opportunity" : "contact",
        options: q.options,
      });
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
        out.tags.push({ name: value.trim() });
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

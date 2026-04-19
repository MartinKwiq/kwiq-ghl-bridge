/**
 * Cifrado simétrico de credenciales (AES-256-GCM).
 *
 * USO:
 *   const blob = encryptSecret("pit_xxxxxxxx");
 *   const plain = decryptSecret(blob);
 *
 * Formato del blob (base64url):
 *   version:1 | iv:12B | authTag:16B | ciphertext:N
 *
 * Clave maestra: `INTERVIEW_ENCRYPTION_KEY` — 32 bytes codificados en base64
 * (se genera una vez con `openssl rand -base64 32`). Rotación: re-encriptar
 * todos los secretos con la nueva clave (migración manual).
 *
 * Este módulo es SERVER-SIDE ONLY. No importar desde Client Components.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const raw = process.env.INTERVIEW_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTERVIEW_ENCRYPTION_KEY no está seteada. Generá una con `openssl rand -base64 32`.",
    );
  }
  // Aceptamos base64 (preferido) o hex (64 chars). Si mide distinto, hacemos
  // SHA-256 del string para derivar 32 bytes — no ideal en prod pero evita
  // errores fatales en dev cuando alguien pone una clave corta.
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch {
    /* fall through */
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  // Fallback dev-only: derivamos con SHA-256 y avisamos.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[crypto] INTERVIEW_ENCRYPTION_KEY no tiene 32 bytes; derivando con SHA-256 (solo dev).",
    );
    return createHash("sha256").update(raw).digest();
  }
  throw new Error(
    "INTERVIEW_ENCRYPTION_KEY debe ser 32 bytes en base64 o 64 chars hex.",
  );
}

export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext vacío");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([Buffer.from([VERSION]), iv, tag, ct]);
  return blob.toString("base64url");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 1 + IV_BYTES + TAG_BYTES + 1) {
    throw new Error("decryptSecret: blob inválido (demasiado corto)");
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`decryptSecret: versión no soportada (${version})`);
  }
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(1 + IV_BYTES + TAG_BYTES);
  const key = loadKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Devuelve solo los últimos 4 chars de un secreto, enmascarando el resto.
 * Útil para mostrar en UI sin exponer la credencial (ej: "•••• ••••  ••••  ab12").
 */
export function maskSecretTail(plaintext: string, visible = 4): string {
  if (!plaintext) return "";
  if (plaintext.length <= visible) return "•".repeat(plaintext.length);
  return "•".repeat(Math.max(4, plaintext.length - visible)) + plaintext.slice(-visible);
}

/**
 * Helper de dev: generar una clave maestra nueva.
 *   `node -e "console.log(require('./lib/crypto').generateMasterKey())"`
 */
export function generateMasterKey(): string {
  return randomBytes(32).toString("base64");
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases de Tailwind respetando precedencia (last-write-wins).
 * Uso: `cn("p-2 bg-red-500", condicion && "bg-blue-500")`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Token opaco corto para identificar sesiones de entrevista en la URL.
 * Formato: 24 hex chars (crypto-seguro en runtime node/edge).
 */
export function newSessionToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Pequeño helper de `assertNever` para exhaustive checks en switches.
 */
export function assertNever(value: never): never {
  throw new Error(`Unreachable: received ${JSON.stringify(value)}`);
}

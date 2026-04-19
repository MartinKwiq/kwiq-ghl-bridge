import { ChatDemo } from "@/components/chat-demo";

export const dynamic = "force-static";

/**
 * Ruta /demo
 *
 * Walkthrough interactivo de la entrevista sin tocar Gemini ni Supabase.
 * Pensado para mostrar el flujo en 1 click apenas se levanta el dev server.
 */
export default function DemoPage() {
  return <ChatDemo />;
}

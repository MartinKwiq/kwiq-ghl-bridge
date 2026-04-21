"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Cierra la sesión del cliente autenticado y manda a /interview/login.
 * Usa el cliente SSR del browser, que limpia las cookies de Supabase.
 */
export function LogoutButton({
  className,
  label = "Salir",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/interview/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      className={
        className ??
        "rounded-lg border border-kwiq-border bg-kwiq-panel px-3 py-1.5 text-xs text-kwiq-muted hover:bg-kwiq-bg hover:text-kwiq-text"
      }
    >
      {loading ? "Saliendo…" : label}
    </button>
  );
}

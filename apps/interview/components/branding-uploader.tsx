"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AssetKind = "logo" | "palette" | "font" | "brandbook" | "other";

interface UploadedAsset {
  id: string;
  kind: AssetKind;
  file_path: string;
  mime_type: string | null;
  original_name: string | null;
  size_bytes: number | null;
}

const KIND_LABELS: Record<AssetKind, string> = {
  logo: "Logo",
  palette: "Paleta",
  font: "Tipografía",
  brandbook: "Brandbook",
  other: "Otro",
};

const KIND_HINTS: Record<AssetKind, string> = {
  logo: "PNG, SVG o PDF · vectorial de preferencia",
  palette: "Imagen de la paleta o PDF de referencia",
  font: ".woff, .woff2, .ttf o .otf",
  brandbook: "PDF del manual de marca",
  other: "Cualquier otro archivo de identidad",
};

function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Zona de subida drag-and-drop que aparece durante la sección de branding
 * del chat. Cada kind tiene su propio dropzone.
 */
export function BrandingUploader({
  token,
  onUploaded,
}: {
  token: string;
  onUploaded?: (asset: UploadedAsset) => void;
}) {
  const [uploaded, setUploaded] = useState<UploadedAsset[]>([]);
  const [busyKind, setBusyKind] = useState<AssetKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (kind: AssetKind, file: File) => {
      if (!file) return;
      setError(null);
      setBusyKind(kind);
      try {
        const fd = new FormData();
        fd.append("token", token);
        fd.append("kind", kind);
        fd.append("file", file);
        const res = await fetch("/api/interview/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            details?: string;
            error?: string;
          };
          throw new Error(body.details || body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { asset: UploadedAsset };
        setUploaded((prev) => [...prev, data.asset]);
        onUploaded?.(data.asset);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyKind(null);
      }
    },
    [token, onUploaded],
  );

  const kinds = useMemo<AssetKind[]>(
    () => ["logo", "palette", "font", "brandbook"],
    [],
  );

  return (
    <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
          Archivos de marca
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-kwiq-muted">
          Arrastrá o hacé clic
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((kind) => (
          <Dropzone
            key={kind}
            kind={kind}
            busy={busyKind === kind}
            onFile={(f) => handleUpload(kind, f)}
          />
        ))}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-xs text-kwiq-err">
          {error}
        </div>
      )}

      {uploaded.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-kwiq-muted">
            Subidos
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {uploaded.map((a) => (
              <li
                key={a.id}
                className="flex max-w-full items-center gap-2 rounded-full border border-kwiq-ok/40 bg-kwiq-ok/10 px-3 py-1 text-xs text-kwiq-ok"
              >
                <span className="font-medium">{KIND_LABELS[a.kind]}</span>
                <span className="truncate">
                  {a.original_name ?? a.file_path.split("/").pop()}
                </span>
                {a.size_bytes && (
                  <span className="text-kwiq-muted">
                    · {formatBytes(a.size_bytes)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Dropzone({
  kind,
  busy,
  onFile,
}: {
  kind: AssetKind;
  busy: boolean;
  onFile: (f: File) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className={cn(
        "group relative flex cursor-pointer flex-col items-start justify-between gap-2 rounded-xl border border-dashed border-kwiq-border bg-kwiq-bg/40 px-4 py-3 text-left text-sm transition hover:border-kwiq-accent",
        isOver && "border-kwiq-accent bg-kwiq-accent/5",
        busy && "pointer-events-none opacity-60",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="font-display uppercase tracking-wide">
          {KIND_LABELS[kind]}
        </span>
        {busy && (
          <span className="text-[10px] uppercase tracking-widest text-kwiq-accent">
            Subiendo…
          </span>
        )}
      </div>
      <span className="text-xs text-kwiq-muted">{KIND_HINTS[kind]}</span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // reset para permitir subir el mismo archivo dos veces
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * Zona de subida drag-and-drop para la sección de branding.
 *
 * Características UX:
 *  - Hidrata el estado de archivos ya subidos desde DB al montar (GET).
 *  - Cada Dropzone muestra estado VACÍO o LLENO:
 *      · Vacío: placeholder con tipo + hint, drag & drop activo.
 *      · Lleno: nombre del archivo + check verde + botón "X" para borrar.
 *  - Al clickear "X" aparece confirmación inline ("¿Eliminar este archivo?").
 *  - El cliente puede reemplazar un archivo arrastrando uno nuevo sobre
 *    el dropzone lleno (el componente borra el viejo y sube el nuevo).
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 1) Hidratar lista de archivos ya subidos al montar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/interview/upload?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          assets?: UploadedAsset[];
        };
        if (cancelled) return;
        if (Array.isArray(data.assets)) {
          setUploaded(data.assets);
        }
      } catch {
        /* noop — si falla, simplemente arrancamos con uploaded vacío */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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

  const handleDelete = useCallback(
    async (assetId: string) => {
      setError(null);
      try {
        const res = await fetch(
          `/api/interview/upload?token=${encodeURIComponent(token)}&assetId=${encodeURIComponent(assetId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            details?: string;
            error?: string;
          };
          throw new Error(body.details || body.error || `HTTP ${res.status}`);
        }
        setUploaded((prev) => prev.filter((a) => a.id !== assetId));
        setConfirmDeleteId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token],
  );

  const kinds = useMemo<AssetKind[]>(
    () => ["logo", "palette", "font", "brandbook"],
    [],
  );

  // Index por kind → asset (último subido si hay varios).
  const byKind = useMemo(() => {
    const map = new Map<AssetKind, UploadedAsset>();
    for (const a of uploaded) map.set(a.kind, a);
    return map;
  }, [uploaded]);

  return (
    <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
          Archivos de marca
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-kwiq-muted">
          Arrastra o haz clic
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((kind) => {
          const asset = byKind.get(kind);
          return (
            <Dropzone
              key={kind}
              kind={kind}
              busy={busyKind === kind}
              asset={asset}
              confirmDelete={
                asset && confirmDeleteId === asset.id ? true : false
              }
              onAskDelete={() => asset && setConfirmDeleteId(asset.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onConfirmDelete={() => asset && void handleDelete(asset.id)}
              onFile={(f) => handleUpload(kind, f)}
            />
          );
        })}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-xs text-kwiq-err">
          {error}
        </div>
      )}
    </div>
  );
}

function Dropzone({
  kind,
  busy,
  asset,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onFile,
}: {
  kind: AssetKind;
  busy: boolean;
  asset: UploadedAsset | undefined;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onFile: (f: File) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFile = !!asset;

  // ── Estado LLENO: muestra el archivo con check + X ─────────────
  if (hasFile && asset) {
    return (
      <div
        className={cn(
          "relative flex flex-col gap-2 rounded-xl border bg-kwiq-ok/5 px-4 py-3 text-sm transition",
          "border-kwiq-ok/50",
        )}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-display uppercase tracking-wide text-kwiq-ok">
            <CheckIcon /> {KIND_LABELS[kind]} cargado
          </span>
          {!confirmDelete && (
            <button
              type="button"
              onClick={onAskDelete}
              aria-label="Eliminar este archivo"
              title="Eliminar este archivo"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-kwiq-border bg-kwiq-bg/60 text-xs text-kwiq-muted hover:border-kwiq-err hover:text-kwiq-err"
            >
              ×
            </button>
          )}
        </div>

        {!confirmDelete && (
          <>
            <span className="break-all text-xs text-kwiq-text">
              {asset.original_name ?? asset.file_path.split("/").pop()}
            </span>
            <span className="text-[10px] text-kwiq-muted">
              {formatBytes(asset.size_bytes)} ·{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="underline hover:text-kwiq-accent"
              >
                Reemplazar archivo
              </button>
            </span>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.currentTarget.value = "";
              }}
            />
          </>
        )}

        {confirmDelete && (
          <div className="flex flex-col gap-2 rounded-md border border-kwiq-err/40 bg-kwiq-err/5 p-2">
            <p className="text-xs text-kwiq-err">
              ¿Eliminar este archivo? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirmDelete}
                className="rounded-md bg-kwiq-err px-2 py-1 text-xs font-medium text-kwiq-bg hover:opacity-90"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="rounded-md border border-kwiq-border px-2 py-1 text-xs text-kwiq-muted hover:text-kwiq-text"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Estado VACÍO: dropzone normal ──────────────────────────────
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
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

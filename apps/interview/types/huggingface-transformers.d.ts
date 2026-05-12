/**
 * Type shim mínimo para @huggingface/transformers.
 *
 * La librería completa trae tipos propios cuando se instala vía npm en
 * Vercel. En la sandbox de desarrollo a veces no está disponible y
 * queremos que `tsc --noEmit` siga pasando limpio. Este declare module
 * tipea solo lo que usamos en `voice-input-button.tsx`; el día que
 * extendamos el uso, agregar más signatures acá.
 */
declare module "@huggingface/transformers" {
  export interface ProgressData {
    status: string;
    progress?: number;
    file?: string;
    name?: string;
    loaded?: number;
    total?: number;
  }

  export interface PipelineOptions {
    device?: "wasm" | "webgpu" | "cpu" | "auto";
    dtype?: string;
    progress_callback?: (data: ProgressData) => void;
    [key: string]: unknown;
  }

  export interface PipelineCallOptions {
    language?: string;
    task?: string;
    chunk_length_s?: number;
    stride_length_s?: number;
    return_timestamps?: boolean;
    [key: string]: unknown;
  }

  export type PipelineFn = (
    input: Float32Array | string | Blob,
    options?: PipelineCallOptions,
  ) => Promise<unknown>;

  export function pipeline(
    task: string,
    model?: string,
    options?: PipelineOptions,
  ): Promise<PipelineFn>;

  export const env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    useBrowserCache: boolean;
    useFSCache: boolean;
    backends: Record<string, unknown>;
    [key: string]: unknown;
  };
}

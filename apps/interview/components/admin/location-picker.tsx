"use client";

/**
 * Picker de ubicación con mapa interactivo.
 *
 * Estado actual (Sprint 1B): infrastructure preparada pero el mapa real
 * está deshabilitado hasta que carguemos el SDK de Mapbox y la env var
 * `NEXT_PUBLIC_MAPBOX_TOKEN`. Por ahora muestra un placeholder explicativo;
 * el form principal sigue funcionando 100% con campos de texto sin mapa.
 *
 * Cuando se active:
 *  - El SDK se carga dinámicamente vía import() para no inflar el bundle
 *    cuando el token no está.
 *  - El admin tipea una dirección, el geocoder devuelve coordenadas, el
 *    pin se posiciona, y autocompletamos el form principal con calle,
 *    ciudad, estado, CP.
 *  - Drag del pin permite ajustar la posición exacta.
 *
 * Activación pendiente:
 *   1. Agregar `mapbox-gl` y `@mapbox/mapbox-gl-geocoder` al package.json.
 *   2. Crear cuenta Mapbox y generar token público.
 *   3. Cargar `NEXT_PUBLIC_MAPBOX_TOKEN` en Vercel.
 *   4. Cambiar el componente para hacer el render real (commit aparte).
 */
export interface LocationPickerProps {
  country: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  onPick: (data: {
    lat: number;
    lng: number;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }) => void;
}

export function LocationPicker(_props: LocationPickerProps) {
  const token =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      : undefined;

  if (!token) {
    return (
      <div className="rounded-lg border border-dashed border-kwiq-border bg-kwiq-bg/30 px-4 py-3 text-xs text-kwiq-muted">
        <p>
          <strong className="text-kwiq-text">Mapa interactivo deshabilitado.</strong>{" "}
          Cuando esté disponible, vas a poder buscar la dirección y arrastrar
          un pin para fijar la ubicación exacta. Mientras tanto, completá los
          campos de arriba a mano — GHL hace su propia geocodificación cuando
          le pasamos la dirección.
        </p>
        <p className="mt-2 text-kwiq-muted/70">
          Para activarlo: cargá la env var{" "}
          <code className="text-kwiq-text">NEXT_PUBLIC_MAPBOX_TOKEN</code> en
          Vercel y avisame para shippear el render real (un commit chico).
        </p>
      </div>
    );
  }

  // El mapa real se va a montar en un commit posterior cuando estén las
  // deps de Mapbox en package.json. Por ahora solo confirmamos que el
  // token está y mostramos el mismo placeholder con un mensaje distinto.
  return (
    <div className="rounded-lg border border-kwiq-accent/40 bg-kwiq-accent/5 px-4 py-3 text-xs text-kwiq-muted">
      <p>
        <strong className="text-kwiq-text">Token de Mapbox detectado ✓.</strong>{" "}
        El mapa real se activa en el próximo deploy una vez que sumemos
        `mapbox-gl` a las dependencias. Por ahora completá la dirección a
        mano arriba.
      </p>
    </div>
  );
}

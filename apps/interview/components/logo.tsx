import Image from "next/image";
import { ASSETS, BRAND } from "@/lib/brand";

/**
 * Logo de Kwiq.
 *
 * - `variant="wordmark"` (default) → lockup horizontal: isotipo oficial +
 *   palabra "Kwiq" en Antonio. Se compone en runtime para aprovechar la
 *   tipografía cargada vía next/font; sin depender de un SVG rasterizado.
 *
 * - `variant="mark"` → solo el isotipo oficial (kwiq-mark.svg).
 *
 * - `variant="block"` → el "block" full con fondo petrol (kwiq-logo-full.svg),
 *   para hero, open graph, redes.
 *
 * Los assets viven en `/public`; se pueden swapear sin tocar este componente.
 */
export function Logo({
  variant = "wordmark",
  className,
  size,
}: {
  variant?: "wordmark" | "mark" | "block";
  className?: string;
  size?: number;
}) {
  if (variant === "mark") {
    const px = size ?? 32;
    return (
      <Image
        src={ASSETS.mark}
        alt={BRAND.name}
        width={px}
        height={px}
        className={className}
        priority
      />
    );
  }

  if (variant === "block") {
    const px = size ?? 180;
    return (
      <Image
        src={ASSETS.block}
        alt={BRAND.name}
        width={px}
        height={px}
        className={className}
        priority
      />
    );
  }

  // wordmark = isotipo + "Kwiq" en Antonio (lockup horizontal)
  const iso = size ?? 36;
  const cls = ["inline-flex items-center gap-2 leading-none", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} aria-label={BRAND.name}>
      <Image
        src={ASSETS.mark}
        alt=""
        width={iso}
        height={iso}
        priority
        aria-hidden="true"
      />
      <span
        className="font-display font-semibold tracking-tight text-kwiq-text"
        style={{ fontSize: Math.round(iso * 0.92) }}
      >
        {BRAND.name}
      </span>
    </span>
  );
}

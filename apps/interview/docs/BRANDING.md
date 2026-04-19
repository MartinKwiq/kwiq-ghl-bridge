# Branding y look-and-feel de Kwiq

Guía rápida para mantener el producto consistente con la marca Kwiq sin
mencionar a GoHighLevel / LeadConnector en nada de lo que ve el cliente.

---

## 1. Regla de oro

> **El cliente compra Kwiq. Nunca ve la palabra "GoHighLevel" ni
> "LeadConnector" en la UI, en emails, en archivos descargados ni en el
> prompt del agente IA.**

Qué sí puede seguir mencionando LC/GHL:

- Código interno (`lib/generators/ghl-autoconfig.ts`, names de campos en el
  JSON interno).
- Schemas de Supabase (nombres de tablas, columnas).
- Documentación del equipo (`docs/*.md`).
- Variables de entorno.

Qué **nunca** debe mencionar LC/GHL:

- Copy de `/`, `/demo`, `/entrevista/*`.
- Mensajes del asistente IA (incluye el system prompt).
- Nombres de archivos descargados por el cliente (`kwiq-config.json`,
  `kwiq-agent-prompt.txt`).
- Emails transaccionales, notificaciones push, títulos de tab.

Si algún copy se cuela, podemos grepearlo:

```bash
cd apps/interview
rg -i 'gohighlevel|goHigh|leadconnector|lead-connector|\bghl\b' \
   app components public lib/prompts.ts lib/demo README.md
```

Lo que matchea dentro de `lib/generators/*` o `supabase/*` está OK (es
interno). Lo que matchea dentro de `app/`, `components/`, `public/`, o en
prompts para el cliente hay que renombrar.

---

## 2. Dónde vive el branding

Todo el branding pasa por **un solo archivo**:
[`apps/interview/lib/brand.ts`](../lib/brand.ts).

```ts
BRAND.name                 // → "Kwiq"
BRAND.tagline              // → tagline público
BRAND.productName          // → "Kwiq Onboarding"
BRAND.defaultAgentName     // → "Kiki"  (si el cliente no nombra su agente)
BRAND.siteUrl              // → "https://kwiq.io"

COLORS.accent              // → "#2DC4A0"  (turquesa oficial)
COLORS.bg / panel / deep / ...

FONTS.display              // → "Antonio"  (titulares)
FONTS.sans                 // → "Poppins"  (body / UI)

ASSETS.logo                // → "/kwiq-logo.svg"   wordmark horizontal
ASSETS.mark                // → "/kwiq-mark.svg"   isotipo cuadrado
ASSETS.favicon             // → "/favicon.svg"
```

`tailwind.config.ts` usa los mismos hex bajo la clave `kwiq.*`. Si cambiás
un hex, cambialo **en los dos lugares** (o migramos Tailwind a leer desde
`brand.ts` — ver TODO abajo).

---

## 3. Paleta oficial Kwiq

| Token                | Hex        | Uso                                       |
| -------------------- | ---------- | ----------------------------------------- |
| `kwiq.bg`            | `#0A0A0A`  | Fondo base (negro, matchea fondo del logo) |
| `kwiq.panel`         | `#0F2424`  | Tarjetas, cajas de contenido              |
| `kwiq.deep`          | `#0A3838`  | Verde petróleo profundo (col. 1 paleta)   |
| `kwiq.border`        | `#1F3A3A`  | Bordes y divisores                        |
| `kwiq.muted`         | `#8AA0A0`  | Texto secundario, placeholders            |
| `kwiq.text`          | `#FFFFFF`  | Texto principal                           |
| **`kwiq.accent`**    | `#2DC4A0`  | **Turquesa** — CTAs, links, highlights    |
| `kwiq.accentHover`   | `#8EEBD0`  | Aqua claro — hover de CTAs                |
| `kwiq.accent2`       | `#D96296`  | Fucsia — highlights secundarios, tags     |
| `kwiq.accent2Light`  | `#E0A5C4`  | Rosa pastel — fondos suaves               |
| `kwiq.ok`            | `#2DC4A0`  | Estados OK (reusa turquesa)               |
| `kwiq.warn`          | `#F59E0B`  | Warnings                                  |
| `kwiq.err`           | `#EF4444`  | Errores                                   |

**Regla de contraste**: el turquesa es un color claro → los textos sobre
`bg-kwiq-accent` van en `text-kwiq-bg` (negro), NO `text-white`.

### Cambiar la paleta

1. Edit `lib/brand.ts` → `COLORS`.
2. Edit `tailwind.config.ts` → `theme.extend.colors.kwiq`.
3. Edit `app/layout.tsx` → `viewport.themeColor` (debe matchear `COLORS.bg`).
4. Edit `app/globals.css` → el bloque `body { background: ...; color: ...; }`
   y los gradientes de `.bubble-user`.
5. Revisá que los SVG (`public/kwiq-logo.svg`, `public/kwiq-mark.svg`,
   `public/favicon.svg`) usen hex consistentes.

### TODO: Tailwind como single-source-of-truth

```ts
// tailwind.config.ts
import { COLORS } from "./lib/brand";
// ...
kwiq: COLORS,
```

Se queda pendiente para evitar duplicar hex — ya tenemos la paleta estable
así que la migración es segura. Lo hacemos cuando alguien tenga 5 min.

---

## 4. Logos

Los logos viven en `public/`:

- `kwiq-logo.svg` — wordmark horizontal (220×64). Usar en landing y header amplio.
- `kwiq-mark.svg` — isotipo cuadrado (64×64). Usar en headers angostos, favicon,
  avatar del asistente.
- `favicon.svg` — 32×32.

### Placeholder vs oficial

Los archivos actualmente committeados son **placeholders tipográficos** que
usan Poppins Black Italic en turquesa Kwiq. **No es el logo hand-lettered
oficial.**

**Para swapear al logo oficial (lo que tenés en el brand kit):**

Opción A — **SVG vectorizado** (recomendado, escala infinito):
1. Exportá el logo desde Figma/Illustrator como SVG con `viewBox` limpio.
2. Pegalo sobre `public/kwiq-logo.svg` (wordmark) y `public/kwiq-mark.svg`
   (isotipo), respetando los nombres. El componente `<Logo>` lo levanta
   automático.
3. Si cambia el aspect ratio, ajustá `components/logo.tsx` → el cálculo
   `size * (64 / 220)` asume la proporción original del wordmark.

Opción B — **PNG de alta resolución** (si no tenés SVG):
1. Guardalo como `public/kwiq-logo.png` + `public/kwiq-mark.png`
   (mínimo 2x la resolución usada en pantalla, ej. 440×128 para el wordmark).
2. Actualizá `lib/brand.ts` → `ASSETS.logo = "/kwiq-logo.png"` y
   `ASSETS.mark = "/kwiq-mark.png"`.
3. `next/image` se encarga del resto (optimización, WebP).

**Fondo del logo**: ambos logos están diseñados sobre **negro puro (#0A0A0A)**,
que es exactamente `kwiq.bg`. No necesitás recortar fondo — el logo se
funde con el fondo de la app.

Si el logo oficial viene con el fondo incluido (como la imagen de brand kit),
dos opciones:
- Dejarlo así (queda como un "block" negro embebido, funciona sobre `kwiq.bg`).
- Editar el SVG para eliminar el rect negro y dejar las letras solas con
  fondo transparente (más versátil si en el futuro usamos el logo sobre otros
  fondos, ej. imágenes en emails).

### Favicon

Para generar un favicon más completo (multi-tamaño, Apple touch, etc.):

```bash
# En public/, con el SVG oficial:
npx @resvg/resvg-js-cli kwiq-mark.svg -w 180 -h 180 apple-touch-icon.png
npx @resvg/resvg-js-cli kwiq-mark.svg -w 512 -h 512 icon-512.png
```

Después referencialos en `app/layout.tsx` → `metadata.icons`.

---

## 5. Tipografía

Usamos **dos familias oficiales de Kwiq**, ambas cargadas via `next/font/google`:

| Familia    | Uso                                     | Pesos cargados            |
| ---------- | --------------------------------------- | ------------------------- |
| **Antonio** | Títulos, H1–H3, eyebrows, display copy | 400, 500, 600, 700        |
| **Poppins** | Body, UI, botones, párrafos, inputs    | 300, 400, 500, 600, 700   |

Ambas están declaradas en [`app/layout.tsx`](../app/layout.tsx) y expuestas
como variables CSS (`--font-antonio`, `--font-poppins`) que Tailwind consume:

```ts
// tailwind.config.ts
fontFamily: {
  sans:    ["var(--font-poppins)", ...fallbacks],  // default
  display: ["var(--font-antonio)", ...fallbacks],  // titulares
}
```

**Cómo usar en componentes**:

```tsx
<p>body en Poppins</p>                                 // default, sin clase
<h1 className="font-display">TITULAR EN ANTONIO</h1>   // usa Antonio
```

Antonio es condensada + se ve muy bien en uppercase → usala con `uppercase`
para titulares impactantes. Poppins es redonda + amigable → ideal para
texto conversacional (el chat).

### Cambiar tipografía

Editá `app/layout.tsx` → reemplazá el import de `Antonio`/`Poppins` por la
fuente nueva, y actualizá `tailwind.config.ts` si cambia el nombre de la
variable CSS.

Si la tipografía oficial no está en Google Fonts (ej. tipografía custom):

```tsx
// app/layout.tsx
import localFont from "next/font/local";
const kwiqSans = localFont({
  src: "./fonts/KwiqSans-Variable.woff2",
  variable: "--font-poppins",   // mantener el nombre de variable
});
```

---

## 6. Tono de voz

La voz de Kwiq:

- **Rioplatense neutro.** Usamos "vos", "acá", "planilla". Evitamos
  "tú", "ahora mismo", "booking".
- **Cálido y breve.** Frases cortas. Sin wall-of-text. Una idea por turno.
- **Sin jerga técnica.** Nada de "API", "webhook", "opportunity", "custom field".
  Traducir a palabras del negocio: "tu CRM", "los datos de tus clientes",
  "las etiquetas".
- **Sin saludar en cada turno.** El asistente saluda una vez al iniciar
  la conversación, después entra directo a la próxima pregunta.
- **Sin emoji** a menos que el usuario los use primero.

Esta voz está codificada en `lib/prompts.ts::buildSectionSystemPrompt`.

---

## 7. Cosas que no son Kwiq (evitar)

- Modales gigantes con muchos botones.
- Mensajes tipo "¡Buenísimo!" repetidos en cada turno (una vez está bien).
- Spinners genéricos. Preferimos el typing-dots de la burbuja.
- Copy en inglés. Todo en español rioplatense.
- Menciones a marcas de terceros (GHL, Stripe, Twilio, Meta) en la UI
  pública. Si hay que mencionar un servicio, usar verbos: "conectá tu
  calendario", "sincronizá tu teléfono", "verificá tu dominio".
- Mezclar las dos tipografías en el mismo bloque (Antonio para titular,
  Poppins para body — no al revés).
- Texto blanco sobre turquesa (`bg-kwiq-accent` → siempre `text-kwiq-bg`).

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta oficial Kwiq. Mantener sincronizada con `lib/brand.ts` > COLORS.
        kwiq: {
          bg: "#0A0A0A",
          panel: "#0F2424",
          border: "#1F3A3A",
          deep: "#0A3838",
          muted: "#8AA0A0",
          text: "#FFFFFF",
          accent: "#2DC4A0",
          accentHover: "#8EEBD0",
          accent2: "#D96296",
          accent2Light: "#E0A5C4",
          ok: "#2DC4A0",
          warn: "#F59E0B",
          err: "#EF4444",
        },
      },
      fontFamily: {
        // Body / UI → Poppins (via next/font en app/layout.tsx).
        sans: [
          "var(--font-poppins)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "Roboto",
          "sans-serif",
        ],
        // Display / titulares → Antonio (condensada).
        display: [
          "var(--font-antonio)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl2: "1rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "blink": "blink 1s infinite",
      },
    },
  },
  plugins: [],
};

export default config;

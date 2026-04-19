import type { Metadata, Viewport } from "next";
import { Antonio, Poppins } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// Tipografía oficial Kwiq: Antonio (display) + Poppins (body).
// Las variables CSS se exponen en <html> y Tailwind las consume en fontFamily.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const antonio = Antonio({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-antonio",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.name} · Onboarding`,
  description:
    "Configurá tu cuenta Kwiq conversando, sin planillas. En una charla dejamos lista tu CRM y tu agente de IA.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${poppins.variable} ${antonio.variable}`}>
      <body className="min-h-screen bg-kwiq-bg font-sans text-kwiq-text antialiased">
        {children}
      </body>
    </html>
  );
}

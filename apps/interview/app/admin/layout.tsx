/**
 * Layout transparente de /admin/*.
 *
 * No aplica chrome ni auth check — eso vive en `app/admin/(protected)/layout.tsx`
 * para las rutas protegidas, y `app/admin/login/page.tsx` queda sin chrome.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

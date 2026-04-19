# Kwiq Interview — Deploy

Guía corta para subir `apps/interview` a GitHub y a Vercel.

## 1. Local — probar que arranca

```bash
cd apps/interview
npm install
npm run dev
# abre http://localhost:3001
```

Lo único que falta es pegar **SUPABASE_SERVICE_ROLE_KEY** en `.env.local`:

1. Entrá a https://supabase.com/dashboard/project/fljbdgaqkvkzdkypgcpk/settings/api-keys
2. Copiá la **service_role secret** (empieza con `eyJ...`).
3. Pegala en `apps/interview/.env.local` en la línea `SUPABASE_SERVICE_ROLE_KEY=`.
4. Reiniciá `npm run dev`.
5. Abrí `http://localhost:3001/admin/login` → `martin@kwiq.io` / `Kwiq!Admin-2026#bootstrap` → cambiá la contraseña en **Ajustes**.

Todo lo demás (PIT de GHL, API key de Gemini, Marketplace, etc.) se carga desde **Ajustes** — no se edita ningún archivo.

## 2. GitHub

```bash
cd /ruta/al/monorepo/kwiq-ghl-bridge
git init
git add .
git commit -m "Kwiq Interview — initial working app"
gh repo create kwiq-ghl-bridge --private --source=. --push
```

O si ya tenés el repo creado:

```bash
git remote add origin git@github.com:<tu-usuario>/kwiq-ghl-bridge.git
git branch -M main
git push -u origin main
```

> ⚠ `.env.local` está en `.gitignore` — **no se sube**. Bien.

## 3. Vercel

### 3.1 Importar el repo

1. https://vercel.com/new → "Import Git Repository" → elegí `kwiq-ghl-bridge`.
2. **Root Directory**: `apps/interview`.
3. **Framework Preset**: Next.js (detecta solo).
4. **Build Command**: `npm run build` (default).
5. **Output Directory**: `.next` (default).
6. **Install Command**: `npm install` (default).

### 3.2 Environment Variables (Production + Preview)

Pegá estas 4 en **Project Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://fljbdgaqkvkzdkypgcpk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<el mismo anon key que tenés en .env.local>
SUPABASE_SERVICE_ROLE_KEY=<el service_role del dashboard Supabase>
INTERVIEW_ENCRYPTION_KEY=<el mismo valor que tenés en .env.local>
```

> 💡 La `INTERVIEW_ENCRYPTION_KEY` **tiene que ser la misma** que usás en local
> si querés que los secretos guardados en la DB sigan descifrándose. Si la
> cambiás, tenés que volver a cargar cada secreto en /admin/ajustes.

Opcionalmente:
```
NEXT_PUBLIC_APP_URL=https://interview.kwiq.io
NEXT_PUBLIC_SITE_URL=https://interview.kwiq.io
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
```

### 3.3 Dominio custom (opcional)

**Project Settings → Domains** → agregá `interview.kwiq.io` y seguí las instrucciones de DNS.

### 3.4 Primer deploy

Vercel redeploya automáticamente en cada push a `main`. El primer deploy tarda ~1.5 min.

## 4. Supabase — config adicional

Después del primer deploy, entrá a Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://interview.kwiq.io` (o el dominio Vercel `.vercel.app` mientras tanto).
- **Redirect URLs**: agregar `https://interview.kwiq.io/admin/login`.

Eso es todo. El resto lo hacés desde el panel admin.

# Publicar `kwiq-ghl-bridge` en GitHub

> **Contexto** — el sandbox de Claude no puede llegar a `github.com` (proxy bloqueado).
> Por eso el commit inicial ya está hecho en tu máquina, pero el `gh repo create` y el
> `git push` los tienes que correr tú. Son tres comandos.

## Estado actual del repo local

```
Branch: main
Commit: 04e2e58  Initial commit: kwiq-ghl-bridge monorepo (apps/interview MVP)
User:   Martín López <martin@kwiq.io>
```

94 archivos versionados, ningún `.env*`, ningún `node_modules`, ningún build artifact.
`.gitignore` raíz ya excluye lo sensible.

## Opción A — con GitHub CLI (recomendada)

Desde tu terminal local, parada en `~/Proyectos/kwiq-ghl-bridge` (o donde tengas el repo):

```bash
# 1. Verifica que gh está autenticado. Si no, corre `gh auth login --web`.
gh auth status

# 2. Crea el repo privado en tu cuenta y pushea main en un solo paso.
gh repo create kwiq-ghl-bridge \
  --private \
  --source=. \
  --remote=origin \
  --push \
  --description "Middleware Kwiq ↔ GoHighLevel — onboarding interview + auto-provisioning"
```

Eso deja la URL `https://github.com/<tu-user>/kwiq-ghl-bridge` privada, con `main` como
default branch y el remoto `origin` apuntando a ella.

## Opción B — sin `gh`, sólo con `git`

1. En GitHub UI: **New repository** → nombre `kwiq-ghl-bridge` → **Private** → **Create repository**.
   No tildes "Initialize with README" (ya tenemos uno).
2. En tu terminal local:
   ```bash
   git remote add origin https://github.com/<tu-user>/kwiq-ghl-bridge.git
   git push -u origin main
   ```

## Después del primer push

- Protege la rama `main`: Settings → Branches → Add rule → `main` → *Require pull request
  before merging*.
- Conecta Vercel al repo: importar desde GitHub → seleccionar `apps/interview` como root
  directory → copiar las env vars de `apps/interview/DEPLOY.md`.
- Añade el repo como origen en tu `~/.ssh/config` si prefieres SSH antes que HTTPS.

## Si algo sale mal

- "refusing to merge unrelated histories" → nunca inicializaste en GitHub, ignorá.
- "Permission denied (publickey)" → cambia el remote a HTTPS o añade tu llave SSH a
  GitHub.
- "Authentication failed" con HTTPS → genera un PAT en
  `https://github.com/settings/tokens` y úsalo como password.

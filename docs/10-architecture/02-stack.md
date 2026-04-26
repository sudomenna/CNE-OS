# 02 — Stack técnica

Versões pinadas, justificativa e setup. Alternativas proibidas sem ADR aprovado ([`90-meta/04-decision-log.md`](../90-meta/04-decision-log.md)).

---

## 1. Tabela canônica

| Camada | Tecnologia | Versão alvo | Justificativa | ADR |
|---|---|---|---|---|
| Framework web | Next.js (App Router, RSC, Server Actions) | `15.x` | RSC + Server Actions eliminam API intermediária; streaming; cache granular | — |
| Linguagem | TypeScript estrito | `5.6+` | Tipagem = contrato executável | — |
| Runtime | Node.js | `20 LTS` | Suporte Vercel + Inngest | — |
| Package manager | pnpm | `9.x` | Workspaces + cache determinístico | — |
| UI primitivos | Radix UI + shadcn/ui CLI | latest | Acessibilidade AA + componentes ejetáveis | — |
| Estilização | Tailwind CSS | `3.4+` | Utility-first + tokens do design system | — |
| Auth | Supabase Auth (email+senha, magic link, TOTP) | latest | Integrado ao DB e RLS; ver `@supabase/ssr` | ADR-04 |
| Banco de dados | Postgres (Supabase) | `15+` | Relacional denso, jsonb, RLS, pgvector | ADR-04 |
| ORM / query builder | Drizzle ORM + drizzle-kit | latest | SQL-first, controle fino de migrations e jsonb | ADR-08 |
| Realtime | Supabase Realtime (Postgres CDC) | latest | Push de mudanças sem polling | ADR-04 |
| Storage (anexos) | Supabase Storage | latest | Buckets privados + signed URL | ADR-04 |
| Jobs, webhooks, crons | Inngest | latest | Retries, idempotência, DLQ, observabilidade | ADR-09 |
| Validação de input | Zod | `3.x` | Parsing tipado em fronteiras | — |
| Testes unit/integration | Vitest | `1.x+` | ESM nativo, rápido, compatível com TS | — |
| Testes E2E | Playwright | `1.x+` | Multi-browser, estável em CI | — |
| Observabilidade — erros | Sentry | latest | Browser + Node + sourcemaps | — |
| Observabilidade — logs/métricas | Axiom | latest | Logs estruturados JSON, dashboards SQL | — |
| Observabilidade — Web Vitals | Vercel Analytics | latest | Integrado ao deploy | — |
| Hospedagem front | Vercel | — | Edge Network + Server Actions nativo | — |
| Hospedagem back | Supabase | — | Gerenciado, backups, PITR | ADR-04 |
| Lint | ESLint + eslint-config-next | latest | Lint + regras custom de boundary | — |
| Formatação | Prettier | `3.x` | Zero-config via projeto | — |
| Git hooks | Husky + lint-staged | latest | Pré-commit lint e typecheck parcial | — |

**Proibido sem ADR:** Prisma, tRPC, Convex, Zustand no servidor, Redux, Firebase, MongoDB, Sequelize, TypeORM, Remix, Vite front.

---

## 2. Convenções TypeScript

Configuração obrigatória em `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "paths": { "@/*": ["./*"] }
  }
}
```

Regras:

1. **Zero `any`.** Usar `unknown` + narrowing.
2. **Zero `as X`** (type assertion) exceto pós-parse Zod ou em testes.
3. **Tipos nomeados** para entradas/saídas de função pública. Nunca inline em interface de módulo.
4. **Branded types** para IDs sensíveis (`ContactId`, `TransactionId`) quando confusão é plausível.
5. **`InferSelectModel` / `InferInsertModel`** do Drizzle como fonte de tipos de DB.

---

## 3. Estrutura de pastas

```
/app
  /(auth)/                          # login, recuperação, 2FA
  /(app)/                           # área autenticada
    /contacts, /inbox, /funnels, /offers, /transactions,
    /analytics, /settings
  /api/webhooks/<provider>/route.ts # Route Handlers de entrada
/lib
  /db
    /schema/                        # 1 arquivo por agregado
      _helpers.ts                   # set_updated_at, append_only, etc.
      _relations/                   # relations Drizzle (anti-circular)
      index.ts                      # export central
    /migrations/                    # NNNN_<kebab>.sql
    client.ts                       # singleton Drizzle + DbTx type
    soft-delete.ts                  # withoutDeleted()
  /auth
    session.ts                      # requireSession
    rbac/matrix.ts                  # RBAC_MATRIX + can()
    rbac/require.ts                 # requirePermission
  /domain/<module>/                 # regras puras
    index.ts                        # interface pública
    schemas.ts                      # zod compartilhado
  /integrations/<provider>/
    handler.ts                      # wrapper do Route Handler
    signature.ts                    # verifySignature
    mapper.ts                       # mapToInternal (puro)
    processor.ts                    # Inngest function
    fixtures/                       # payloads reais anonimizados
  /timeline/emit.ts                 # emitTimelineEvent (único ponto de escrita)
  /audit/log.ts                     # audit (único ponto de escrita)
  /actions/result.ts                # ActionResult, toActionResult
  /observability/
    sentry.ts                       # init + tags
    log.ts                          # logger estruturado (Axiom)
/components
  /ui                               # shadcn (gerado via CLI)
  /<module>                         # componentes de domínio
/inngest
  client.ts                         # inngest client singleton
  functions/                        # uma function por fluxo
/tests
  /unit                             # vitest, sem DB
  /integration                      # vitest + Postgres efêmero
  /e2e                              # Playwright
  /fixtures                         # payloads reais anonimizados
/docs                               # spec canônica (esta pasta)
```

Propósito:

| Path | Pode editar? | Regra |
|---|---|---|
| `/app/(app)/<mod>` | Módulo `<mod>` | UI consome apenas Server Actions |
| `/lib/domain/<mod>` | Módulo `<mod>` | Funções puras; sem I/O |
| `/lib/integrations/<p>` | Time integração | Sem conhecimento de domínio vazado |
| `/lib/db/schema/<mod>.ts` | Módulo dono | Escrita exclusiva do dono |
| `/lib/timeline`, `/lib/audit` | Serial (PR dedicado) | Core compartilhado |
| `/components/ui` | CLI shadcn | Nunca editar manualmente |

---

## 4. `package.json` sketch

```jsonc
{
  "name": "cne-os",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "inngest:dev": "npx inngest-cli@latest dev"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "drizzle-orm": "^0.35.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "inngest": "^3.22.0",
    "@sentry/nextjs": "^8.0.0",
    "@axiomhq/js": "^1.0.0",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-dialog": "latest",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "drizzle-kit": "^0.27.0",
    "vitest": "^2.1.0",
    "@playwright/test": "^1.48.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.3.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

Versões exatas vão no `pnpm-lock.yaml`. Atualização de major em qualquer `dependencies` crítica exige ADR.

---

## 5. Setup local — comandos

```bash
# 1. Instalar Node 20 e pnpm 9
nvm use 20
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 2. Dependências
pnpm install

# 3. Variáveis de ambiente
cp .env.example .env.local      # preencher chaves Supabase, Inngest, Sentry

# 4. Supabase local (opcional — usar projeto dev remoto é aceitável)
supabase start                  # opcional, CLI Supabase

# 5. Migrations
pnpm db:migrate                 # aplica migrations pendentes

# 6. Gerar tipos + schema sincronizado
pnpm db:generate                # após mudar schema Drizzle

# 7. Dev
pnpm dev                        # Next.js + RSC
pnpm inngest:dev                # worker Inngest local (outra aba)

# 8. Verificação antes de commit
pnpm typecheck && pnpm lint && pnpm test
```

Variáveis obrigatórias em `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgres://...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
SENTRY_DSN=...
AXIOM_TOKEN=...
DIGITAL_GURU_WEBHOOK_SECRET=...
BREVO_WEBHOOK_SECRET=...
WHATSAPP_APP_SECRET=...
NOTAZZ_WEBHOOK_TOKEN=...
```

Nunca commitar `.env.local`. `.env.example` mantém keys com valores vazios.

---

## 6. CI mínima

Workflow GitHub Actions por PR:

```yaml
- pnpm install --frozen-lockfile
- pnpm typecheck
- pnpm lint
- pnpm test                     # unit + integration
- pnpm build                    # sanity
```

E2E Playwright roda em `main` pré-deploy (ver [`10-testing-strategy.md`](./10-testing-strategy.md)).

---

## 7. shadcn/ui — CLI e Registry de Temas

### Instalar componente shadcn padrão

```bash
pnpm dlx shadcn@latest add <component-name>
# ex: pnpm dlx shadcn@latest add button dialog table
```

Componentes são ejetados em `/components/ui`. **Nunca editar manualmente** — re-instale via CLI se precisar de upgrade.

### Aplicar tema do shadcn/studio (@ss-themes)

**Não use `pnpm dlx shadcn@latest add @ss-themes/...` diretamente.** Os temas do shadcn/studio usam variáveis em formato OKLCH, incompatível com o `tailwind.config.ts` deste projeto (Tailwind v3 usa `hsl(var(--...))`). Aplicar via CLI quebraria todas as cores silenciosamente.

Use a skill `/apply-theme` que faz a conversão OKLCH→HSL automaticamente:

```
/apply-theme material-design
/apply-theme spotify
/apply-theme @ss-themes/claude
```

A skill:
1. Baixa o JSON do tema em `https://shadcnstudio.com/r/themes/{nome}.json`
2. Converte cada valor OKLCH → HSL via Node.js (matemática exata)
3. Reescreve apenas o bloco de variáveis em `app/globals.css`, preservando diretivas e CSS customizado
4. Roda `pnpm typecheck` para confirmar que nada quebrou

O registry está configurado em `components.json` para referência:

```json
{
  "registries": {
    "@ss-themes": "https://shadcnstudio.com/r/themes/{name}.json"
  }
}
```

### Descobrir temas disponíveis

- Catálogo visual: https://shadcnstudio.com/theme-generator
- Testar JSON de um tema: `https://shadcnstudio.com/r/themes/<nome>.json`

### Por que não usar `shadcn init --preset`

Os presets do shadcn `init` (ex: `--preset b1JouLfnb0`) geram estilos como `radix-mira` que dependem de Tailwind v4 (`@import "shadcn/tailwind.css"`, `@theme inline`). Migrar para Tailwind v4 requer ADR aprovado — não fazer sem decisão explícita.

### Regra

Toda mudança de tema que altere `app/globals.css` deve garantir que os tokens estão em HSL puro (sem `oklch()`) e que `pnpm typecheck` passa limpo.

---

## 8. Versionamento

- Stack upgrades via PR dedicado com ADR quando muda major.
- `drizzle-kit`, `next`, `react` major bump = ADR.
- Dependências transitórias de segurança (Dependabot) entram sem ADR quando patch.

---

## 9. Open Questions

- `OQ-STACK-01`: adotar Turbopack como dev default (Next 15 beta estável)?
- `OQ-STACK-02`: usar `pg-boss` em paralelo ao Inngest para cron puro ultra-barato?
- `OQ-STACK-03`: gerar tipos do Supabase via `supabase gen types` além do Drizzle?

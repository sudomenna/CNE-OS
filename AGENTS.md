# AGENTS.md — Instruções para agentes codificadores

Este arquivo é o contrato operacional entre **você (agente)** e este repositório. Leia-o inteiro antes de editar qualquer coisa. Instruções específicas do Claude Code estão em `CLAUDE.md`.

## 1. Missão em 3 linhas

Construir o Sistema Operacional da CNE Educação: CRM multi-marca com motor comercial de ofertas, snapshots imutáveis de venda e inbox omnichannel. O produto substitui ferramentas externas fragmentadas e vira a fonte única da verdade de contatos, vendas e atendimento. Arquitetura modular, spec-driven, evolutiva.

## 2. Stack canônica (não substituir sem decisão explícita)

| Camada | Tecnologia | Versão alvo |
|---|---|---|
| Framework | Next.js (App Router, Server Actions, RSC) | 15.x |
| Linguagem | TypeScript estrito | 5.x |
| UI | shadcn/ui + Tailwind + Radix | latest |
| Auth | Supabase Auth (email+senha, magic link, TOTP 2FA) | — |
| DB | Postgres gerenciado via Supabase | 15+ |
| ORM | Drizzle | latest |
| Realtime | Supabase Realtime (Postgres CDC) | — |
| Storage | Supabase Storage | — |
| Jobs / webhooks | Inngest | latest |
| Testes | Vitest (unit/domain) + Playwright (E2E) | latest |
| Observabilidade | Sentry + Axiom + Vercel Analytics | — |
| Deploy | Vercel (front) + Supabase (back) | — |

Alternativas (Prisma, Convex, tRPC, etc.) estão **proibidas** sem ADR aprovado em `docs/90-meta/04-decision-log.md`.

## 3. Convenções de repositório

### 3.1. Layout

```
/app                              # rotas Next.js (App Router)
  /(auth)/                        # login, recuperação
  /(app)/                         # área autenticada
    /contacts, /inbox, /funnels, /offers, /transactions, /analytics, /settings
/lib
  /db
    /schema/                      # Drizzle schemas por agregado (1 arquivo = 1 agregado)
    /migrations/
    client.ts                     # singleton Drizzle + RLS helpers
  /auth                           # Supabase Auth + RBAC helpers
  /domain/<module>/               # funções puras de domínio, testáveis
  /integrations/<provider>/       # adaptadores, idempotência, DLQ
  /timeline/                      # emissor de timeline_event
/components
  /ui                             # shadcn (não editar manualmente, usar CLI)
  /<module>                       # componentes de domínio
/inngest                          # jobs e handlers de webhook
/tests
  /unit                           # regras de domínio puras
  /integration                    # webhooks, merge, snapshot, DB
  /e2e                            # fluxos críticos (Playwright)
/docs                             # specs — leia antes de codar
```

### 3.2. Naming

- Tabelas Postgres: `snake_case`, singular (`contact`, `offer_condition`).
- Colunas: `snake_case`.
- Enums Postgres e TS: declarados em `docs/30-contracts/01-enums.md`, gerados por Drizzle.
- IDs de negócio: UUID v7 (`gen_random_uuid()` ou `uuid_generate_v7`).
- Tipos TS: `PascalCase`. Zod schemas: `camelCaseSchema`.
- Arquivos de spec: `kebab-case.md`.

### 3.3. Camadas

- **Domínio puro** (`/lib/domain/*`): funções sem I/O, testáveis com vitest. Toda BR que tem contrato de função vive aqui.
- **Server Actions** (`/app/**/actions.ts`): orquestram I/O, validam com zod, chamam domínio puro, emitem eventos de timeline.
- **Integrações** (`/lib/integrations/*`): recebem payloads externos, mapeiam para o modelo canônico, invocam domínio.
- **UI** (`/app/(app)/*`): consome Server Actions, nunca fala com DB direto.

## 4. Protocolo de trabalho

### 4.1. Antes de editar

1. Identifique o **módulo** da tarefa (agregado em `docs/20-domain/`). Cada módulo tem seção de **Ownership** listando o que ele possui e o que lê.
2. Edite **apenas** arquivos dentro do Ownership do módulo da tarefa. Se precisar mudar algo fora, **pare e registre** em `docs/90-meta/03-open-questions-log.md`.
3. Carregue o contexto **nesta ordem**:
   1. `docs/README.md`
   2. Este arquivo ou `CLAUDE.md`
   3. `docs/20-domain/<módulo>.md`
   4. BRs referenciadas pelo módulo (em `docs/50-business-rules/`)
   5. Enums e interfaces em `docs/30-contracts/01-enums.md` e `07-module-interfaces.md`
   6. Tarefa do sprint em `docs/80-roadmap/*`

Nunca abra os arquivos em `docs/90-meta/archive/` para decidir regra — eles são históricos. A fonte canônica é o `docs/50-business-rules/`.

### 4.2. Como adicionar um novo agregado

1. Copiar template de `docs/90-meta/01-doc-conventions.md#agregado` e criar `docs/20-domain/<nn>-<nome>.md`.
2. Registrar enums novos em `docs/30-contracts/01-enums.md` (tarefa serializada, nunca em paralelo).
3. Registrar BRs novas em `docs/50-business-rules/` e indexar em `README.md`.
4. Criar schema Drizzle em `lib/db/schema/<nome>.ts`.
5. Rodar `pnpm drizzle-kit generate` e versionar migration.
6. Escrever funções de domínio puras em `lib/domain/<nome>/`.
7. Escrever Server Actions em `app/(app)/<nome>/actions.ts`.
8. Escrever UI.
9. Escrever testes (vitest unit + playwright E2E para fluxos críticos).

### 4.3. Como citar regra em código

Apenas quando o WHY não é óbvio do nome da função ou da assinatura:

```ts
// BR-OFFER-DECISION: desempate por score de vantagem, nunca alfabético
```

Não cite BR-ID se o código já se explica sozinho. Nunca reproduza o enunciado da regra dentro do código — linka pelo ID.

## 5. Regras de ouro ("não faça")

1. **Não modifique `transaction_snapshot` após criado.** É append-only imutável (BR-SNAPSHOT-IMMUTABILITY). Mudanças futuras = novo snapshot via nova transação.
2. **Não faça merge destrutivo de contato.** Merge aponta registros para `contact_principal`; contato antigo permanece como histórico (BR-MERGE).
3. **Não invente enum.** Enum fora de `docs/30-contracts/01-enums.md` = bug. Registrar antes de usar.
4. **Não edite arquivos fora do Ownership do módulo da tarefa.** Se precisar, pare e escale.
5. **Não use Prisma, tRPC, Convex, Zustand no servidor.** Stack é a da §2.
6. **Não faça `git push --force`, `git reset --hard`, `drizzle-kit drop`, `supabase db reset` sem aprovação explícita.**
7. **Não skippe hooks** (`--no-verify`) nem desabilite CI.
8. **Não crie arquivos `.md` de documentação fora de `/docs/`** (exceto `README.md`, `AGENTS.md`, `CLAUDE.md` na raiz).
9. **Não resolva ambiguidade inventando.** Registre em `docs/90-meta/03-open-questions-log.md` e peça decisão.
10. **Não commite `.env`, secrets, snapshots reais de clientes.**
11. **Não consuma integração externa sem idempotência** (`webhook_log.external_event_id` UNIQUE) — ver BR-INTEGRATION-IDEMPOTENCY.
12. **Não quebre RLS.** Queries que atravessam marcas precisam justificativa e teste.

## 6. Onde encontrar o quê

| Pergunta | Arquivo |
|---|---|
| Qual o enum de `contact_status`? | `docs/30-contracts/01-enums.md` |
| Como decidir qual condição comercial aplicar? | `docs/50-business-rules/BR-OFFER-DECISION.md` |
| Como mapear webhook do Digital Guru? | `docs/40-integrations/01-digital-guru.md` |
| Fluxo completo de reembolso? | `docs/60-flows/07-refund-end-to-end.md` |
| Quem pode executar reembolso? | `docs/50-business-rules/BR-RBAC.md` + `docs/00-product/03-personas-rbac-matrix.md` |
| O que emitir na timeline quando uma venda é aprovada? | `docs/30-contracts/03-timeline-event-catalog.md` |
| Convenções de migration / naming? | `docs/30-contracts/02-db-schema-conventions.md` |
| Estratégia de testes? | `docs/10-architecture/10-testing-strategy.md` |
| Sprint atual e tarefas paralelizáveis? | `docs/80-roadmap/` |

## 7. Protocolo de ambiguidade

Se a spec não cobre o caso:

1. **Pare de codar.**
2. Abra `docs/90-meta/03-open-questions-log.md`.
3. Adicione entrada no formato:
   ```
   ### OQ-<nn> — <título curto>
   - Origem: <módulo/arquivo>
   - Contexto: <o que você estava fazendo>
   - Pergunta: <a dúvida em forma imperativa>
   - Impacto se decidir errado: <qual BR/fluxo é afetado>
   - Status: aberta
   ```
4. Retorne controle ao orquestrador humano.

Não avance assumindo.

## 8. Critério de "pronto" por tarefa

Uma tarefa só está `completed` quando:

- [ ] Código compila (`pnpm typecheck`)
- [ ] Lint limpo (`pnpm lint`)
- [ ] Testes da tarefa escritos e passando (`pnpm test -- <escopo>`)
- [ ] Migration (se houver) aplicada em ambiente local limpo
- [ ] Critério de aceite da tarefa no sprint atendido
- [ ] Open Questions do módulo não aumentaram silenciosamente

Abrir PR ≠ pronto. Merge verde com CI passando = pronto.

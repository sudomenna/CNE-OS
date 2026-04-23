# TESTING.md — Guia prático de testes do CNE-OS

Referência operacional para desenvolvedores e subagents. Para a estratégia arquitetural completa, ver [`docs/10-architecture/10-testing-strategy.md`](docs/10-architecture/10-testing-strategy.md). Para o mapa de **quais** testes existem por sprint, ver [`docs/80-roadmap/98-test-matrix-by-sprint.md`](docs/80-roadmap/98-test-matrix-by-sprint.md).

---

## Comandos rápidos

```bash
# Verificação completa (obrigatória antes de merge)
bash scripts/verify-wave.sh

# Loop de desenvolvimento (rápido)
bash scripts/verify-wave.sh --fast

# Camadas individuais
pnpm typecheck              # tsc --noEmit
pnpm lint                   # eslint
pnpm test                   # vitest (unit + integration)
pnpm test --watch           # modo watch
pnpm test tests/unit/contact/identity.test.ts  # arquivo específico
pnpm test:e2e               # playwright (todos os fluxos)
pnpm test:e2e --grep "FLOW-02"  # fluxo específico
```

---

## Pirâmide

```
                  +-----------------------+
                  |   E2E (Playwright)    |   ~15 fluxos críticos
                  |   multi-browser       |   roda pré-deploy em main
                  +----------+------------+
                             |
                  +----------+-----------+
                  |  Integration (Vitest) |   ~150 casos
                  |  DB real (ephemeral)  |   roda em cada PR
                  +----------+-----------+
                             |
              +--------------+--------------+
              |       Unit (Vitest)          |   ~400-600 casos
              |       sem I/O, puro          |   roda em cada PR
              +------------------------------+
```

---

## Camada 1 — Unit

**Escopo:** funções puras em `lib/domain/*`, mappers em `lib/integrations/*/mapper.ts`, RBAC, helpers, Zod validators.

**Regras:**
- Zero I/O, zero DB, zero mocks de `fetch`.
- Nome: `describe('BR-<ID>', () => { it('given X, when Y, then Z', ...) })`.
- Arquivo de fixture centralizado em `tests/fixtures/index.ts`.

**Estrutura:**
```
tests/
  unit/
    contact/
      identity.test.ts      # 8 casos BR-IDENTITY
      merge.test.ts
      normalize.test.ts
    offer/
      eligibility.test.ts
      decision.test.ts
    auth/
      rbac.test.ts          # 100% da matriz
    ...
  fixtures/
    index.ts                # makeContact(), makeBrand(), makeOffer(), ...
    offer/conditions.fixture.ts
    contact/contacts.fixture.ts
```

**Cobertura alvo:**

| Camada | Alvo |
|---|---|
| `lib/domain/*` | ≥ 90% linhas |
| `lib/integrations/*/mapper.ts` | ≥ 95% linhas |
| `lib/auth/rbac/*` | 100% da matriz |
| `lib/actions/result.ts` | 100% |

---

## Camada 2 — Integration

**Escopo:** Server Actions, Inngest handlers, triggers SQL, RLS, webhooks com HMAC real, seeds.

**Regras críticas:**
- **Zero mock de DB.** DB sempre real (Postgres efêmero via Supabase branch ou Docker).
- **HMAC sempre calculado** com o secret de teste — nunca mocke `verifySignature`.
- **Fixtures via factory**, nunca `INSERT` manual.
- Cada teste começa limpo: `beforeEach(() => truncate(['contact', 'conversation', ...]))`.

**Estrutura:**
```
tests/
  integration/
    schema/
      contact.test.ts       # triggers, constraints, RLS
    actions/
      contact.test.ts       # Server Actions com DB real
    integrations/
      digital-guru.test.ts  # webhook idempotência, HMAC, mapping
    inngest/
      subscription-cycle.test.ts
  helpers/
    db.ts                   # setup/teardown de DB efêmero
    tx.ts                   # withTransaction para testes de domínio
    auth.ts                 # asUser(role) — simula sessão autenticada
    seed.ts                 # seedMinimal(), seedSprintN()
```

**Padrão de teste de trigger:**
```ts
it('append-only: audit_log rejeita UPDATE', async () => {
  const { id } = await db.insert(s.auditLog).values(entry).returning();
  await expect(
    db.update(s.auditLog).set({ action: 'tampered' }).where(eq(s.auditLog.id, id))
  ).rejects.toThrow('append_only_violation');
});
```

**Padrão de teste de webhook idempotência:**
```ts
it('3× o mesmo evento DG = 1 transação', async () => {
  const payload = loadFixture('digitalguru/sale-approved.json');
  const sig = computeHmac(payload, process.env.DG_WEBHOOK_SECRET_TEST!);

  // Enviar 3 vezes
  for (let i = 0; i < 3; i++) {
    const res = await POST('/api/webhooks/digitalguru', payload, sig);
    expect(res.status).toBe(200);
  }

  const transactions = await db.select().from(s.transaction)
    .where(eq(s.transaction.externalId, 'digitalguru:evt_abc123'));
  expect(transactions).toHaveLength(1);  // idempotente
});
```

---

## Camada 3 — E2E (Playwright)

**Escopo:** jornadas críticas de usuário end-to-end no browser.

**Fluxos implementados por sprint:**

| Sprint | FLOW-ID | Jornada |
|---|---|---|
| 0 | FLOW-00 | Login + 2FA TOTP + logout |
| 1–2 | FLOW-01 | Criar contato → ver timeline |
| 1–2 | FLOW-08 | Duplicata detectada → merge → desfazer merge |
| 3–4 | FLOW-02 | Inbox: receber WA → responder → abrir ticket |
| 5 | FLOW-03 | Criar campanha → link rastreável → contato com UTM |
| 6–7 | FLOW-05 | Vendedor: abrir contato → motor sugere oferta → checkout |
| 8 | FLOW-07 | Abrir reembolso → aprovar → entitlement revogado |
| 9 | FLOW-09 | Inadimplência → dunning → pagamento → ativo |
| 10 | FLOW-10 | Dashboard carrega com dados reais |
| 11 | FLOW-11 | Criar automação visual → disparar → verificar execução |

**Estrutura:**
```
tests/
  e2e/
    flow-00-auth.spec.ts
    flow-01-contact.spec.ts
    flow-02-inbox.spec.ts
    flow-05-checkout.spec.ts
    flow-07-refund.spec.ts
    flow-08-merge.spec.ts
    ...
  e2e-fixtures/
    seed-e2e.ts             # seed mínimo para cada fluxo
```

**Regras:**
- `beforeEach`: seed limpo e específico do fluxo.
- Rodar em Chromium (padrão) + WebKit (mobile inbox) na CI.
- Asserções em comportamento visível, não em HTML interno.
- Screenshots automáticas em falha (configurar `use: { screenshot: 'only-on-failure' }` no `playwright.config.ts`).

**Executar localmente:**
```bash
pnpm test:e2e                        # todos os fluxos
pnpm test:e2e --project=chromium     # só Chromium
pnpm test:e2e flow-07-refund.spec.ts # fluxo específico
npx playwright show-report           # abrir relatório HTML
```

---

## O que testar em cada sprint

Resumo rápido. Versão completa com casos específicos: [`docs/80-roadmap/98-test-matrix-by-sprint.md`](docs/80-roadmap/98-test-matrix-by-sprint.md).

| Sprint | Foco principal | Unit obrigatório | Integration obrigatório | E2E obrigatório |
|---|---|---|---|---|
| 0 | Fundações | `rbac.test.ts` | triggers append-only, RLS marca A vs B | FLOW-00 login+2FA |
| 1–2 | CRM | `identity.test.ts` (8 casos), `merge.test.ts` | contato duplicado, merge+undo, timeline consolidada | FLOW-01, FLOW-08 |
| 3–4 | Inbox + Tickets | `channel-mappers.test.ts`, `sla.test.ts` | webhook WA → inbox → timeline | FLOW-02 |
| 5 | Marketing + Funis | `utm-parse.test.ts`, `score.test.ts` | UTM persiste, estágio gera TE | FLOW-03 |
| 6–7 | Motor de ofertas | `eligibility.test.ts`, `decision.test.ts` | motor com 3 ofertas, cupom inválido | FLOW-05 |
| 8 | Snapshot + Reembolso | `snapshot/build.test.ts`, `refund/approve.test.ts` | DG idempotência, snapshot imutável | FLOW-07 |
| 9 | Assinaturas | `dunning/retry.test.ts`, `installment/split.test.ts` | ciclo falha → retry → dunning | FLOW-09 |
| 10 | Analytics | helpers de agregação, materialized view SQL | refresh MV, <500ms | FLOW-10 |
| 11 | Automações | `trigger-match.test.ts`, `executor/step.test.ts` | trigger real → automação | FLOW-11 |

---

## Definition of Done (testes)

Um T-ID só é `completed` quando:

1. ✅ Testes da camada exigida pelo tipo de tarefa passam (ver acima).
2. ✅ Todos os ramos da BR cobertos — não apenas o happy path.
3. ✅ `pnpm typecheck && pnpm lint && pnpm test` verde localmente.
4. ✅ E2E verde para o FLOW correspondente (quando aplicável).
5. ✅ Nenhum `console.error` em teste (indica problema não tratado).

---

## Setup de DB para integration

### Opção A — Supabase Branch (recomendado em time)

Cada PR cria uma branch de DB isolada via Supabase Branching. Migrations rodam automaticamente. Teardown automático quando o PR fecha.

```bash
supabase link --project-ref <project-id>
supabase db branch create feat/my-feature
# Migrations aplicadas automaticamente
```

### Opção B — Docker local (solo dev)

```bash
docker run --rm -p 5432:5432 \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=cne_test \
  postgres:15-alpine

DATABASE_URL=postgres://postgres:test@localhost:5432/cne_test pnpm db:migrate
pnpm test
```

### Opção C — Supabase local CLI

```bash
supabase start          # sobe Postgres + Auth local
pnpm db:migrate         # aplica migrations
pnpm test               # roda com .env.test apontando para localhost
```

---

## CI

Workflow GitHub Actions por PR:

```yaml
jobs:
  verify:
    steps:
      - pnpm install --frozen-lockfile
      - pnpm typecheck
      - pnpm lint
      - pnpm test          # unit + integration (DB efêmero)
      - pnpm build         # sanity

  e2e:                     # roda em merge para main, não em PR
    steps:
      - pnpm test:e2e
```

E2E não bloqueia PR (roda em `main` pré-deploy) para manter feedback rápido no ciclo de review.

---

## Troubleshooting comum

| Sintoma | Causa provável | Ação |
|---|---|---|
| Teste de integration falha com `relation does not exist` | Migrations não aplicadas no DB de teste | `pnpm db:migrate` no DB de teste |
| Webhook test `401 Invalid signature` | HMAC calculado com secret errado | Checar `.env.test` — secret deve ser o de teste, não de prod |
| E2E `Timeout waiting for selector` | Seed não foi executado ou tela tem loading longo | Verificar `beforeEach` seed + adicionar `waitFor` explícito |
| Vitest `Cannot find module @/lib/db/client` | Path alias não configurado no `vitest.config.ts` | Adicionar `resolve.alias` apontando para `./` |
| Trigger não dispara em teste | Trigger foi criado em migration mas não aplicado no DB de teste | `pnpm db:migrate` no DB de teste |

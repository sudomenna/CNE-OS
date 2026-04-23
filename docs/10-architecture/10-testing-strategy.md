# 10 — Estratégia de testes

Pirâmide, ferramentas, fixtures, CI. Toda tarefa fecha com `typecheck + test` verde ([`AGENTS.md §8`](../../AGENTS.md)).

---

## 1. Pirâmide

```
                 +------------------+
                 |   E2E (Playwright)|   fluxos críticos ponta a ponta
                 |     ~15 fluxos    |
                 +--------+----------+
                          |
               +----------+------------+
               |   Integration (vitest) |   DB real + transações
               |    ~150 casos         |
               +----------+------------+
                          |
        +-----------------+----------------+
        |        Unit (vitest)             |   domínio puro, mappers
        |          ~400-600 casos           |
        +----------------------------------+
```

Rule of thumb:

- **Cobertura do valor.** Um teste de integração vale mais do que cinco de unidade redundantes.
- **Domínio puro 90% cobertura.** Função de decisão não coberta = bug esperando acontecer.
- **E2E apenas fluxos críticos.** Não re-testar CRUD simples — quem valida UI é a Server Action testada.

---

## 2. Unit — Vitest

### 2.1. Escopo

- Funções puras em `lib/domain/<mod>/` (regras de negócio).
- Funções puras em `lib/integrations/<p>/mapper.ts` (tradução externa -> canônico).
- Helpers: `rbac.can()`, `consolidateEntitlement()`, `generateUtm()`, `normalizeEmail/phone/cpf`.
- Validadores Zod.

### 2.2. Regras

1. **Sem DB.** Unit puro, zero I/O, zero mocks de `fetch`.
2. **Um arquivo de teste por arquivo de código** quando possível (`foo.test.ts` ao lado de `foo.ts` OU em `tests/unit/<path>`).
3. **Nome do teste = BR-ID quando aplicável.**
   - Arquivo: `tests/unit/offer/decision.test.ts`.
   - Descrição: `describe('BR-OFFER-DECISION', () => { it('CT-OFFER-01: desempate por score', ...) })`.
4. **Fixtures em `tests/fixtures/`** compartilhadas entre unit e integration quando fizer sentido.

### 2.3. Exemplo

```ts
// tests/unit/offer/decision.test.ts
import { describe, it, expect } from 'vitest';
import { rankConditions } from '@/lib/domain/offer/decision';
import { conditions } from '../../fixtures/offer/conditions.fixture';

describe('BR-OFFER-DECISION', () => {
  it('CT-OFFER-01 — escolhe condição de maior score', () => {
    const result = rankConditions(conditions, { channel: 'whatsapp', now: new Date('2026-04-21') });
    expect(result[0].reason).toBe('channel_match');
  });
});
```

### 2.4. Cobertura alvo

| Camada | Cobertura alvo |
|---|---|
| `lib/domain/*` | 90% linhas |
| `lib/integrations/*/mapper.ts` | 95% linhas (casos reais) |
| `lib/auth/rbac/*` | 100% da matriz |
| `lib/actions/result.ts` | 100% |
| `lib/audit/*` | 90% |

Cobertura agregada alvo: 80% sobre `lib/`.

---

## 3. Integration — Vitest + Postgres real

### 3.1. Escopo

- Server Actions (orquestração completa).
- Funções de domínio que mutam (`approveTransaction`, `mergeContacts`, `refundRefund`).
- Inngest processors (webhook handlers) com DB real.
- Triggers SQL (append-only, set_updated_at).
- RLS policies (quando Fase 2).

### 3.2. DB de teste

Duas opções (escolha do módulo):

**A) Postgres testcontainer** (recomendado default):

```ts
// tests/integration/setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let pg: StartedTestContainer;

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:15').withDatabase('cne_test').start();
  process.env.DATABASE_URL = pg.getConnectionUri();
  await runMigrations();
});

afterAll(() => pg.stop());
```

**B) Schema efêmero em Supabase de teste:** cada run cria schema `test_<uuid>`, aplica migrations, dropa ao final. Mais rápido em CI com docker-in-docker instável, mais lento local.

### 3.3. Isolamento por teste

- Cada teste roda dentro de `BEGIN; ... ROLLBACK`.
- Helper `withTx(fn)` abre transação, roda o teste, rollback ao final.
- Para testes que precisam de commit (ex.: trigger append-only em UPDATE), usar schema efêmero e truncate entre testes.

### 3.4. Domínios cobertos obrigatoriamente

| Fluxo | Teste integration |
|---|---|
| Identidade & upsert | `tests/integration/contact/identity.test.ts` |
| Merge & unmerge | `tests/integration/contact/merge.test.ts` |
| Snapshot imutável | `tests/integration/transaction/snapshot.test.ts` |
| Decision engine de oferta | `tests/integration/offer/decision.test.ts` |
| Entitlement consolidation | `tests/integration/entitlement/consolidate.test.ts` |
| Refund end-to-end (revoga + flag) | `tests/integration/refund/approve.test.ts` |
| Subscription cycle advance | `tests/integration/billing/cycle.test.ts` |
| Webhook idempotência Digital Guru | `tests/integration/integrations/digital-guru/idempotency.test.ts` |
| Audit append-only | `tests/integration/audit/append-only.test.ts` |
| Timeline emitter + filtros | `tests/integration/timeline/emit.test.ts` |
| RBAC can() × Server Action | `tests/integration/auth/actions-guarded.test.ts` |

### 3.5. **Mocks proibidos em integration**

- DB: sempre real (testcontainer ou schema efêmero).
- Assinatura HMAC de webhook: sempre computada de verdade com secret dummy.
- Inngest: usar servidor local (`inngest-cli dev`) ou harness oficial — não mockar step.
- Supabase Storage: mockar apenas quando teste não valida upload (stub explícito).

Fazer "mock tudo" em integration = teste de integração falso.

---

## 4. E2E — Playwright

### 4.1. Escopo (apenas fluxos críticos)

| Fluxo | ID | Arquivo |
|---|---|---|
| FLOW-02 — Inbox omnichannel | `tests/e2e/inbox-omnichannel.spec.ts` | Recebe WhatsApp, responde, anexo, timeline atualiza |
| FLOW-05 — Checkout ingestion | `tests/e2e/checkout-ingestion.spec.ts` | Webhook Digital Guru -> contato criado + entitlement |
| FLOW-07 — Refund | `tests/e2e/refund.spec.ts` | Abrir, aprovar, entitlement revogado, snapshot flagged |
| FLOW-08 — Merge | `tests/e2e/contact-merge.spec.ts` | Merge, histórico preservado, timeline mergeada |
| FLOW-10 — Subscription renovação | `tests/e2e/subscription-renew.spec.ts` | Cron avança, timeline registra |
| FLOW-12 — Webhook reprocess | `tests/e2e/webhook-reprocess.spec.ts` | DLQ -> reprocessa -> sucesso |

Fluxos não-críticos: cobertos por integration no nível Action.

### 4.2. Ambiente

- Banco: schema efêmero criado antes do run (Playwright `globalSetup`).
- Inngest: `inngest-cli dev` rodando (start no globalSetup, stop no globalTeardown).
- Webhooks externos: simulados via `fetch` direto para `/api/webhooks/<p>` com HMAC válido.
- Usuário de teste: seed em migration de test (`seed_users_test.sql`).

### 4.3. Boas práticas

- **Seletores semânticos:** `getByRole`, `getByLabel`. Evitar CSS frágil.
- **Esperar o resultado, não o timeout.** Usar `expect(locator).toBeVisible()` com assertions automáticas.
- **Dado de teste determinístico:** fixture por spec, reset entre specs.
- **Retry = 2** em CI para reduzir flakiness de rede.

---

## 5. Fixtures

### 5.1. Organização

```
tests/fixtures/
  contacts/
    brazilian-person.ts
    edge-cases.ts
  offer/
    conditions.ts
    offer-with-limit.ts
  transactions/
    approved-pix.ts
    refunded.ts
  integrations/
    digital-guru/
      transaction-approved.json
      transaction-refunded.json
      subscription-renewed.json
    brevo/
      email-delivered.json
      email-bounced.json
    whatsapp/
      inbound-text.json
      status-delivered.json
    notazz/
      invoice-issued.json
```

### 5.2. Fixtures reais anonimizados

Regras:

1. **CPF:** `12345678901` (dummy válido). **Nunca** CPF real.
2. **Email:** `fixture-<slug>@example.com`.
3. **Phone:** `+5511999999999`.
4. **Name:** `Fulano de Tal`, `Fulana Silva`, etc.
5. **IDs externos:** UUIDs fixos ou strings marcadas (`guru_fixture_001`).
6. **Proibido commitar** payload real de cliente.

Fixtures vivem **também** em `lib/integrations/<p>/fixtures/` (usados pelo app em dev) — mesmos dados, aliases symlinkados para testes.

---

## 6. CI — GitHub Actions

### 6.1. Por PR

```yaml
name: pr-checks
on: [pull_request]

jobs:
  checks:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test                 # unit + integration
      - run: pnpm build                # smoke
```

Bloqueia merge se qualquer step falha.

### 6.2. Em `main` pré-deploy

```yaml
name: e2e
on:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - ... setup ...
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
```

### 6.3. Noturno

- Rodar full suite (unit + integration + e2e) contra branch `main` mais recente.
- Emitir alerta Slack em falha.

---

## 7. Cobertura — geração e cobrança

```bash
pnpm test -- --coverage
```

Gera relatório em `coverage/` (HTML + lcov). CI compara com threshold mínimo:

```jsonc
// vitest.config.ts
coverage: {
  thresholds: {
    lines: 80, branches: 75, functions: 80, statements: 80,
    // overrides por path:
    'lib/domain/offer/**': { lines: 90, branches: 85 },
    'lib/auth/rbac/**':    { lines: 100, functions: 100 },
  }
}
```

---

## 8. Tipos de teste por camada

| Camada | Tipo | Ferramenta |
|---|---|---|
| Domínio puro | Unit | Vitest |
| Mapper de integração | Unit | Vitest + fixtures JSON |
| Server Action | Integration | Vitest + DB real |
| Inngest processor | Integration | Vitest + DB + inngest harness |
| Trigger SQL / constraint | Integration | Vitest + DB |
| UI componente isolado | Unit | Vitest + @testing-library/react |
| Fluxo ponta a ponta | E2E | Playwright |
| Performance micro | Benchmark | `vitest bench` (opcional) |
| Acessibilidade | E2E | Playwright + `@axe-core/playwright` |

---

## 9. Nomenclatura

| Item | Padrão |
|---|---|
| Arquivo de teste unit | `<nome>.test.ts` ao lado ou `tests/unit/<path>/<nome>.test.ts` |
| Arquivo de teste integration | `tests/integration/<mod>/<feature>.test.ts` |
| Arquivo de teste E2E | `tests/e2e/<flow>.spec.ts` |
| Describe | BR-ID ou nome do componente (`describe('BR-REFUND')`) |
| It | `CT-<ID>` + descrição (`it('CT-REFUND-03: revoga entitlement')`) |

Permite rastreabilidade bidirecional: BR -> teste e vice-versa.

---

## 10. Rastreabilidade

Cada BR tem seção `Rastreabilidade` apontando para o teste esperado (ex.: `tests/unit/offer/decision.test.ts`). O CI pode opcionalmente validar que todo BR-ID referenciado em docs tem arquivo de teste correspondente (verificador a adicionar).

---

## 11. Anti-padrões

| Anti-padrão | Por que evitar | Fazer em vez |
|---|---|---|
| Mockar `db` em integration | Falso positivo | Usar testcontainer |
| Testes com `setTimeout` arbitrário | Flaky | Usar Playwright auto-wait ou `waitFor` |
| Teste que depende de ordem | Impossível paralelizar | Isolar com transação + rollback |
| Teste acoplado a texto de UI específico | Quebra em refactor visual | `getByRole` + `accessibleName` |
| Fixture enorme inline em teste | Ilegível | Extrair para `tests/fixtures/` |
| Um `describe` com dezenas de `it` | Setup compartilhado escondido | Quebrar por regra |

---

## 12. Ferramentas auxiliares

| Ferramenta | Uso |
|---|---|
| `@testing-library/react` | Componentes UI |
| `@axe-core/playwright` | Acessibilidade em E2E |
| `msw` | Mocks de fetch quando inevitável em unit (ex.: SDK externo) |
| `fast-check` | Property-based em funções puras críticas (normalização CPF/phone) |
| `vitest-mock-extended` | Mocks tipados de interfaces em unit |

---

## 13. Open Questions

- `OQ-TEST-01`: Postgres testcontainer vs schema efêmero — padronizar em um único?
- `OQ-TEST-02`: Property-based tests para BR-OFFER-DECISION (fuzzing de desempate) valem o investimento?
- `OQ-TEST-03`: rodar E2E em cada PR ou apenas pré-merge em `main`? (custo vs feedback)
- `OQ-TEST-04`: gerar relatório de "BR sem teste correspondente" em CI?

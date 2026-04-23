# 09 — Boundaries de módulos

Regras de ownership, interfaces públicas e proibições. Operacionaliza o princípio de paralelização ([`AGENTS.md §4`](../../AGENTS.md), [`90-meta/05-subagent-playbook.md`](../90-meta/05-subagent-playbook.md)).

---

## 1. Princípio

> Cada módulo (`MOD-*`) é dono de um conjunto fechado de arquivos. Outros módulos **consomem** via interface pública declarada em [`30-contracts/07-module-interfaces.md`](../30-contracts/07-module-interfaces.md). Leitura e escrita cross-module passam pela interface — **nunca** SELECT/INSERT/UPDATE direto em tabela alheia.

Três garantias:

1. **Isolamento:** mudanças internas a um módulo não quebram outros se a interface pública não mudar.
2. **Paralelização:** agentes trabalhando em módulos distintos não editam os mesmos arquivos.
3. **Auditoria por módulo:** toda operação pode ser atribuída a um `MOD-*` emissor.

---

## 2. Declaração de ownership

Cada doc `/20-domain/<nn>-<mod>.md` tem seção `## 2. Ownership` com:

- **Arquivos que POSSUI** (edição exclusiva).
- **Arquivos que LÊ** (read-only, via interface).
- **Interfaces públicas expostas.**

Quando uma tarefa precisa editar arquivo fora de sua ownership: **parar e escalar** ([OQ](../90-meta/03-open-questions-log.md)).

---

## 3. Tabela consolidada — módulo × paths

| Módulo | Paths owned (escrita exclusiva) | Paths read (via interface) |
|---|---|---|
| MOD-ORG | `lib/db/schema/organization.ts`, `lib/domain/organization/*`, `app/(app)/settings/brand/*` | — |
| MOD-CONTACT | `lib/db/schema/contact.ts`, `lib/db/schema/contact_*.ts` (phone/email/doc), `lib/domain/contact/*`, `app/(app)/contacts/*` (CRUD) | MOD-ORG (brand) |
| MOD-MERGE | `lib/db/schema/contact_merge.ts`, `lib/domain/contact-merge/*`, `app/(app)/contacts/merge/*` | MOD-CONTACT |
| MOD-TIMELINE | `lib/db/schema/timeline_event.ts`, `lib/timeline/*` (emissor único), `app/(app)/contacts/[id]/timeline/*` | Todos (leitura) |
| MOD-INBOX | `lib/db/schema/conversation.ts`, `lib/db/schema/message.ts`, `lib/domain/inbox/*`, `app/(app)/inbox/*` | MOD-CONTACT, MOD-TIMELINE |
| MOD-TICKET | `lib/db/schema/ticket.ts`, `lib/domain/ticket/*`, `app/(app)/tickets/*` | MOD-CONTACT, MOD-TIMELINE |
| MOD-CAMPAIGN | `lib/db/schema/campaign.ts`, `lib/db/schema/creative.ts`, `lib/db/schema/trackable_link.ts`, `lib/domain/campaign/*`, `app/(app)/campaigns/*` | MOD-CONTACT (classificação) |
| MOD-FUNNEL | `lib/db/schema/funnel.ts`, `lib/db/schema/funnel_*.ts`, `lib/domain/funnel/*`, `app/(app)/funnels/*` | MOD-CONTACT, MOD-CAMPAIGN, MOD-TRANSACTION (leitura de won/lost) |
| MOD-CATALOG | `lib/db/schema/product.ts`, `lib/db/schema/commercial_benefit.ts`, `lib/domain/catalog/*`, `app/(app)/catalog/*` | MOD-ORG |
| MOD-OFFER | `lib/db/schema/offer.ts`, `lib/db/schema/offer_condition.ts`, `lib/domain/offer/*`, `app/(app)/offers/*` | MOD-CATALOG, MOD-CAMPAIGN (para decisão) |
| MOD-TRANSACTION | `lib/db/schema/transaction.ts`, `lib/db/schema/transaction_snapshot.ts`, `lib/domain/transaction/*`, `app/(app)/transactions/*` | MOD-CONTACT, MOD-OFFER, MOD-CATALOG, MOD-ORG |
| MOD-ENTITLEMENT | `lib/db/schema/entitlement.ts`, `lib/domain/entitlement/*`, `app/(app)/contacts/[id]/entitlements/*` | MOD-CONTACT, MOD-CATALOG, MOD-TRANSACTION |
| MOD-BILLING | `lib/db/schema/subscription.ts`, `lib/db/schema/installment.ts`, `lib/domain/billing/*`, `app/(app)/billing/*`, `inngest/functions/subscription-cycle.ts`, `inngest/functions/dunning-retry.ts` | MOD-TRANSACTION, MOD-ENTITLEMENT |
| MOD-REFUND | `lib/db/schema/refund.ts`, `lib/domain/refund/*`, `app/(app)/refunds/*` | MOD-TRANSACTION, MOD-ENTITLEMENT |
| MOD-AUTOMATION | `lib/db/schema/automation.ts`, `lib/db/schema/automation_execution.ts`, `lib/domain/automation/*`, `app/(app)/automations/*`, `inngest/functions/automation-executor.ts` | Todos (leitura via interfaces para condições/ações) |
| MOD-AUDIT | `lib/db/schema/audit_log.ts`, `lib/audit/*`, `app/(app)/settings/audit/*` | Todos (escrita via helper único) |
| MOD-AUTH-RBAC | `lib/db/schema/role.ts`, `lib/db/schema/permission.ts`, `lib/db/schema/user_account.ts`, `lib/auth/*`, `app/(app)/settings/users/*`, `app/(auth)/*` | — |
| MOD-INTEGRATION | `lib/integrations/*`, `lib/db/schema/webhook_log.ts`, `app/api/webhooks/*`, `app/(app)/settings/integrations/*`, `inngest/functions/webhook-*.ts`, `inngest/functions/outbound-*.ts` | Todos (via interfaces públicas) |

Notas:

- Schemas compartilhados (`audit_log`, `timeline_event`, `webhook_log`, `user_account`) têm donos dedicados; outros módulos **escrevem apenas via helper**.
- `lib/db/schema/_helpers.ts` e `lib/db/schema/index.ts` são **serial** (PR dedicado).
- `docs/30-contracts/*` é **serial** sempre.

---

## 3.1. Mapa visual de dependências (quem depende de quem)

Uma seta `A → B` significa "A lê ou consome a interface pública de B". Leitura é sempre unidirecional aqui; nunca há ciclos.

```
                          ┌────────────────┐
                          │   MOD-AUTH-RBAC│  (raiz — ninguém depende dele em domínio)
                          └────────────────┘
                                   ▲
                                   │ (login, RBAC em Server Actions — técnico, não de domínio)
                                   │
              ┌────────────────────┴─────────────────────┐
              │                                          │
              ▼                                          ▼
       ┌──────────┐                              ┌──────────────┐
       │ MOD-ORG  │◀─────────────────┐           │  MOD-AUDIT   │◀── escrito por todos
       └────┬─────┘                  │           └──────────────┘    via helper único
            │                        │
            ▼                        │
     ┌─────────────┐                 │
     │ MOD-CONTACT │◀────┐           │
     └─────┬───────┘     │           │
           │             │           │
           │ ┌───────────┼───────────┼───────────────────────┐
           │ │           │           │                       │
           ▼ ▼           │           │                       │
    ┌──────────────┐     │     ┌─────┴──────┐         ┌──────┴──────┐
    │ MOD-TIMELINE │     │     │ MOD-INBOX  │         │ MOD-TICKET  │
    │ (lê tudo)    │     │     └─────┬──────┘         └──────┬──────┘
    └──────────────┘     │           │                       │
                         │           └──────────┬────────────┘
     ┌─────────────┐     │                      │
     │MOD-CAMPAIGN │─────┤                      ▼
     └──────┬──────┘     │                ┌──────────┐
            │            │                │   (contato é leitura comum)
            ▼            │                └──────────┘
     ┌─────────────┐     │
     │ MOD-FUNNEL  │─────┘
     └─────────────┘

     ┌──────────────┐
     │ MOD-CATALOG  │◀──────┐
     └──────┬───────┘       │
            │               │
            ▼               │
     ┌──────────────┐       │
     │  MOD-OFFER   │───────┤ (lê catálogo + contato + campaign)
     └──────┬───────┘       │
            │               │
            ▼               │
     ┌──────────────────┐   │
     │ MOD-TRANSACTION  │───┘ (lê contato, offer, catalog, org)
     │ + snapshot       │
     └────┬─────────────┘
          │
          ├────────────┐
          ▼            ▼
  ┌────────────────┐ ┌──────────────┐
  │ MOD-ENTITLEMENT│ │  MOD-REFUND  │
  └────────┬───────┘ └──────┬───────┘
           │                │
           │                └─► revoga entitlement
           ▼
     ┌──────────────┐
     │ MOD-BILLING  │ (assinatura, parcela, dunning)
     └──────────────┘

     ┌─────────────────┐
     │ MOD-AUTOMATION  │  lê timeline_event (matching), chama interfaces de todos via ações
     └─────────────────┘

     ┌───────────────────┐
     │  MOD-INTEGRATION  │  entra por webhook → chama domínio via interface do módulo-alvo
     └───────────────────┘
```

**Leituras-chave:**
- `MOD-TIMELINE` é **consumido por todos** (UI da timeline) e **escrito só via `emitTimelineEvent`**.
- `MOD-AUDIT` é **escrito por todos** via `audit()` — nunca acesso direto.
- `MOD-CONTACT` é o centro gravitacional do grafo: quase tudo lê contato, nada depende do ciclo dele.
- `MOD-TRANSACTION` depende de 4 módulos a montante — ordem de entrega no roadmap respeita isso (catálogo → oferta → transação).
- `MOD-AUTOMATION` e `MOD-INTEGRATION` **orquestram** chamadas para todos os outros, mas só via interface pública.

**Implicação para paralelização:**
- Módulos em mesmo "anel" (ex: CAMPAIGN, INBOX, TICKET) são paralelizáveis entre si (paths disjuntos + dependem dos mesmos módulos a montante já entregues).
- Módulos em camadas (OFFER depende de CATALOG) só paralelizam dentro da mesma camada.

---

## 4. Interfaces públicas — onde estão

Cada módulo exporta sua interface em:

```
lib/domain/<mod>/index.ts       # funções públicas, tipos nomeados
```

Contrato completo em [`30-contracts/07-module-interfaces.md`](../30-contracts/07-module-interfaces.md).

Regras:

1. **Assinatura TypeScript é o contrato.** Mudar assinatura = PR serial em `07-module-interfaces.md`.
2. **Tipos de retorno são nomeados** (não inline).
3. **Funções mutativas recebem `tx: DbTx`** para compor com transação da chamadora.
4. **Funções puras** (sem I/O) vivem em arquivos separados e não recebem `tx`.

---

## 5. Proibições

### 5.1. SELECT direto cross-module

**Proibido:**

```ts
// ❌ Em MOD-TRANSACTION
const contato = await db.select().from(s.contact).where(eq(s.contact.id, id));
```

**Correto:**

```ts
// ✅ Via interface pública de MOD-CONTACT
import { upsertContact, getContactSummary } from '@/lib/domain/contact';
const contato = await getContactSummary(id);
```

Se a interface não existe, **parar** e propor extensão serial.

### 5.2. INSERT/UPDATE em tabela alheia

Nunca. Mesmo regra da §5.1 para escrita — obrigatório ir pela interface do dono.

### 5.3. Bypass do emissor único

- `timeline_event`: apenas via `emitTimelineEvent`.
- `audit_log`: apenas via `audit()`.
- `webhook_log`: apenas via `ingestWebhook` (entrada) e `markProcessed`/`markFailed` (saída).

### 5.4. Edição cruzada durante paralelização

Durante onda paralela, **zero overlap de paths owned**. Se tarefa A e B precisam editar `lib/timeline/emit.ts`, elas são seriais.

---

## 6. Exemplo — MOD-TRANSACTION precisa dados do contato

Caso: ao processar webhook Digital Guru, MOD-TRANSACTION precisa do `contactId` associado aos dados de identidade (cpf/email/phone).

### ❌ Errado

```ts
// Em lib/domain/transaction/ingest.ts
const existing = await tx.select().from(s.contact)
  .where(eq(s.contact.cpf, canonical.cpf));
```

Quebra boundary: escrita futura em `contact` ainda fica em MOD-CONTACT, mas a leitura desacopla-se do modelo e sofre com mudanças silenciosas.

### ✅ Correto

```ts
// Em lib/domain/transaction/ingest.ts
import { upsertContact } from '@/lib/domain/contact';

const contact = await upsertContact(tx, {
  brandId: canonical.brandId,
  name: canonical.contactInput.name,
  email: canonical.contactInput.email,
  phone: canonical.contactInput.phone,
  cpf: canonical.contactInput.cpf,
  origin: 'checkout',
  sourceRef: canonical.externalRef,
});
```

A interface `upsertContact` encapsula identidade, merge-candidate, normalização — tudo que MOD-CONTACT garante via [BR-IDENTITY](../50-business-rules/BR-IDENTITY.md).

---

## 7. Enforcement

### 7.1. Fase 1 — revisão de código

Revisores checam em cada PR:

1. Path editado está dentro do ownership declarado na tarefa?
2. Há `SELECT`/`INSERT`/`UPDATE` em tabela de outro módulo? (grep rápido por nomes de tabela alheios)
3. Interface pública respeitada? (consulta a `07-module-interfaces.md`)
4. Mudou contrato? (-> vira PR serial dedicado)

Checklist embutido em template de PR.

### 7.2. Fase 2 — ESLint rule custom

Regra `no-cross-module-db` (a implementar em Sprint 10+):

```
Erro: import de `@/lib/db/schema/<other-module>` fora do módulo dono.
Permitido apenas em:
  - lib/domain/<dono>/*
  - lib/db/schema/_relations/* (relations)
  - tests/**
Exceção explícita via // eslint-disable-next-line no-cross-module-db
  com justificativa.
```

Complementar: regra `no-direct-timeline-write` bloqueia import de `timeline_event` fora de `lib/timeline/`.

---

## 8. Pares compatíveis para paralelização

Módulos com paths **disjuntos** podem ser editados em paralelo na mesma onda:

| Par | Disjuntos? | Observação |
|---|:-:|---|
| MOD-CAMPAIGN × MOD-TICKET | ✅ | paths totalmente separados |
| MOD-FUNNEL × MOD-CATALOG | ✅ | — |
| MOD-INBOX × MOD-OFFER | ✅ | — |
| MOD-CONTACT × MOD-MERGE | ❌ | MOD-MERGE lê `contact`; coordena via interface, mas schema raramente muda junto |
| MOD-TRANSACTION × MOD-ENTITLEMENT | ❌ | `approveTransaction` chama `grantEntitlement` — emparelhar tarefa |
| MOD-BILLING × MOD-TRANSACTION | ❌ | `advanceSubscription` cria `installment` relacionado a `transaction` |
| MOD-OFFER × MOD-TRANSACTION | ❌ | `selectCondition` lido por `createTransaction` |
| MOD-AUDIT × qualquer | ✅ | escreve apenas via helper — outros consomem |
| MOD-TIMELINE × qualquer | ✅ | mesmo princípio |
| MOD-INTEGRATION (`webhook_log`) × qualquer | ✅ | integrações trocam schema próprio |
| MOD-AUTH-RBAC × qualquer | ⚠️ | mudanças em matriz afetam todos — preferir serial |
| Alterações em `docs/30-contracts/*` × qualquer | ❌ | **sempre serial** |

**Ondas típicas de paralelização (seguindo roadmap):**

- Onda A: MOD-CAMPAIGN + MOD-TICKET + MOD-CATALOG.
- Onda B: MOD-OFFER + MOD-FUNNEL (CATALOG já pronto).
- Onda C: MOD-TRANSACTION (serial) -> libera MOD-ENTITLEMENT + MOD-BILLING + MOD-REFUND em paralelo.

---

## 9. Quando a interface não atende

1. **Parar.**
2. Abrir [OQ em `03-open-questions-log.md`](../90-meta/03-open-questions-log.md):
   ```
   ### OQ-IFACE-<nn> — precisa de `<função>` em MOD-<dono>
   - Origem: <tarefa>
   - Contexto: <o que precisa>
   - Proposta: <assinatura sugerida>
   - Impacto: bloqueia T-<id>
   - Status: aberta
   ```
3. Propor extensão **serial** em `07-module-interfaces.md`.
4. Só implementar quando interface nova for mergeada.

Pular esse protocolo = bug de arquitetura, bloqueia merge.

---

## 10. Casos de teste

| ID | Cenário | Método |
|---|---|---|
| CT-BOUND-01 | grep: `from 's.<outra_tabela>'` em domain de módulo distinto | script CI (Fase 2) |
| CT-BOUND-02 | escrita em `timeline_event` fora de `lib/timeline/` | lint rule + code review |
| CT-BOUND-03 | escrita em `audit_log` fora de `lib/audit/` | lint rule + code review |
| CT-BOUND-04 | mudança em `lib/domain/<mod>/index.ts` sem atualizar `07-module-interfaces.md` | code review |

---

## 11. Open Questions

- `OQ-BOUND-01`: escrever ESLint rule `no-cross-module-db` já na Fase 1 ou aguardar Sprint 10?
- `OQ-BOUND-02`: views materializadas para leitura otimizada cross-module — publicar como interface formal ou somente via função?
- `OQ-BOUND-03`: `_relations/` contém imports cruzados por definição — isentar via exceção explícita?

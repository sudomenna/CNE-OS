# Decision Log (ADRs)

Decisões não-óbvias, formato ADR leve. Ordem cronológica.

## Formato

```
## ADR-<NN> — <título>
- Data: YYYY-MM-DD
- Status: proposto | aceito | superado por ADR-XX
- Contexto: (2-3 frases)
- Decisão: (o que escolhemos)
- Alternativas consideradas: (lista curta + por que rejeitadas)
- Consequências: (positivas e negativas)
```

---

## ADR-01 — Incluir assinaturas + parcelamento + inadimplência na Fase 1
- Data: 2026-04-21
- Status: proposto
- Contexto: PRD V2 não modela cobrança recorrente; revisão identificou como gap. CNE tem cursos com pagamento recorrente e parcelamento.
- Decisão: incluir `subscription`, `installment` e dashboard de inadimplência na Fase 1 (Sprint 9).
- Alternativas: deixar para Fase 2 (rejeitada: operação depende de visibilidade de inadimplência).
- Consequências: +3 semanas de escopo; dependência forte do Digital Guru para eventos de ciclo.

## ADR-02 — Formalizar reembolso na Fase 1
- Data: 2026-04-21
- Status: proposto
- Contexto: PRD menciona reembolso de passagem; revisão define semântica clara.
- Decisão: módulo MOD-REFUND revoga direitos adquiridos, flaga snapshot como `refunded`, reclassifica contato e **libera recompra da oferta**.
- Alternativas: deixar para Fase 2 (rejeitada: impossível sem regra formal).
- Consequências: exige mudança em `BR-OFFER-UNIQUENESS` para permitir recompra pós-refund.

## ADR-03 — Migração por dual-run, módulo a módulo
- Data: 2026-04-21
- Status: proposto
- Contexto: rewrite big-bang é inviável.
- Decisão: cada módulo sobe em paralelo à ferramenta atual; ambas rodam até estabilizar; ferramenta antiga é aposentada por módulo.
- Consequências: custo duplicado temporário; exige plano de migração por módulo no sprint correspondente.

## ADR-04 — Supabase (Postgres) em vez de Convex
- Data: 2026-04-21
- Status: aceito
- Contexto: domínio denso em relacional e SQL analítico.
- Decisão: Supabase (Postgres + Auth + Realtime + Storage + RLS + pgvector).
- Alternativas: Convex (rejeitada: dificuldade com joins profundos e SQL analítico).
- Consequências: depende de Postgres para tudo; benefício de SQL direto nos dashboards.

## ADR-05 — Snapshot em jsonb + audit tables append-only
- Data: 2026-04-21
- Status: proposto
- Contexto: imutabilidade de venda é princípio.
- Decisão: `transaction_snapshot.payload jsonb`, gravado uma vez; triggers bloqueiam UPDATE/DELETE em audit/snapshot/history.
- Consequências: queries em campos do snapshot via jsonb path/GIN.

## ADR-06 — Telefone > e-mail quando não há CPF
- Data: 2026-04-21
- Status: aceito
- Contexto: PRD §9.2.2 ambíguo; revisão define hierarquia.
- Decisão: CPF absoluto; sem CPF, telefone prevalece sobre e-mail.
- Consequências: base para tabela de decisão em BR-IDENTITY.

## ADR-07 — Contador "30 primeiros" permite excesso
- Data: 2026-04-21
- Status: proposto
- Contexto: regra "os 30 primeiros" com contador atômico pode ter race.
- Decisão: aceitar 31+ vendas quando houver race; operação lida com exceção manualmente.
- Alternativas: queue serializada global (rejeitada: custo e latência).
- Consequências: UI precisa mostrar "vagas disponíveis" como estimativa; operação treinada.

## ADR-08 — Drizzle em vez de Prisma
- Data: 2026-04-21
- Status: aceito
- Contexto: precisamos de SQL-first, control fino sobre migrations e jsonb.
- Decisão: Drizzle ORM.
- Alternativas: Prisma (rejeitada: abstração alta prejudica snapshots e queries complexas).

## ADR-09 — Inngest para webhooks e jobs
- Data: 2026-04-21
- Status: proposto
- Contexto: precisamos retries, idempotência, DLQ e observabilidade.
- Decisão: Inngest.
- Alternativas: `pg-boss` (rejeitada: observabilidade inferior).
- Consequências: dependência externa adicional; ganha dashboard de jobs.

## ADR-10 — Padrão de retorno em funções de domínio: Promise<T> + DomainError
- Data: 2026-04-23
- Status: proposto
- Contexto: `OQ-IFACE-01`. Funções públicas em `lib/domain/*` podem retornar `Promise<T>` (lançando exceção) ou `Promise<Result<T, E>>` (sem throw). Subagents precisam da mesma convenção para paralelizar módulos que chamam um ao outro.
- Decisão: funções de domínio retornam `Promise<T>` e lançam **`DomainError`** (hierarquia tipada: `DomainError` → `ValidationError`, `BusinessRuleViolation`, `NotFoundError`, `ConflictError`, `ForbiddenError`). A fronteira Server Action converte para `ActionResult<T, E>` via `toActionResult(fn)`. UI consome `ActionResult`.
- Alternativas:
  - `Result<T, E>` em todo lugar — rejeitada: verbosidade + perda de stack trace em chamadas aninhadas.
  - Exceção nativa sem tipo — rejeitada: impossível discriminar erro de usuário vs erro de sistema.
- Consequências: `lib/actions/result.ts` centraliza `toActionResult`; testes de domínio usam `expect(...).rejects.toThrow(BusinessRuleViolation)`; `DomainError` é serializável (inclui `code`, `message`, `meta?`).
- Fecha: `OQ-IFACE-01`.

## ADR-11 — `tx: DbTx` obrigatório como primeiro argumento em funções mutativas
- Data: 2026-04-23
- Status: proposto
- Contexto: `OQ-IFACE-03`. Composição de operações exige que funções mutativas compartilhem a mesma transação; opcional leva a chamadores esquecendo a tx e quebrando atomicidade.
- Decisão: toda função que escreve no DB tem assinatura `fn(tx: DbTx, ...args) => Promise<T>`. Leitura pura pode usar o cliente singleton. Server Actions abrem a transação com `db.transaction(async tx => { ... })` e passam `tx` para todas as chamadas de domínio.
- Alternativas:
  - `tx` opcional (fallback para cliente singleton) — rejeitada: compõe mal, esconde bugs de atomicidade.
  - AsyncLocalStorage para injetar tx — rejeitada: mágico, dificulta teste.
- Consequências: interfaces públicas (ver `docs/30-contracts/07-module-interfaces.md`) precisam refletir `tx: DbTx` explícito; testes recebem `tx` de `withTransaction(async tx => { ... })` helper.
- Fecha: `OQ-IFACE-03`.

## ADR-12 — `channel_kind` inicial na Fase 1
- Data: 2026-04-23
- Status: proposto
- Contexto: `OQ-ENUM-01`. Inbox precisa fixar valores do enum antes dos sprints 3–4.
- Decisão: `channel_kind = whatsapp | instagram | email`. SMS, Telegram e outros canais ficam para Fase 2 (estrutura preparada, valores não adicionados).
- Alternativas: incluir `sms` agora — rejeitada: não há demanda imediata e adiciona superfície de provider.
- Consequências: qualquer handler futuro adiciona valor ao enum via migration (deprecação sem remoção, conforme `01-enums.md`).
- Fecha: `OQ-ENUM-01`.

## ADR-13 — Separação `product_kind.bonus` vs `offer_condition_item_kind.bonus`
- Data: 2026-04-23
- Status: proposto
- Contexto: `OQ-ENUM-02`. Confusão entre "bônus cadastrado no catálogo" e "item bônus de uma oferta específica".
- Decisão:
  - `product_kind` = `course | bundle | bonus` → categoriza **catálogo** (o que existe pra ser vendido/concedido).
  - `offer_condition_item_kind` = `product | bonus` → categoriza **item da composição da oferta**; quando `bonus`, pode apontar para `product_id` de `product_kind=bonus` OU para bônus livre definido só no escopo da oferta.
- Alternativas: unificar em um enum só — rejeitada: acopla catálogo e composição de oferta.
- Consequências: exemplo documentado em `docs/20-domain/09-catalog.md` e `docs/20-domain/10-offer-engine.md` (a adicionar pelo `cne-docs-sync` quando ADR aceito).
- Fecha: `OQ-ENUM-02`.

## ADR-14 — `ticket_category` hardcoded na Fase 1
- Data: 2026-04-23
- Status: proposto
- Contexto: `OQ-ENUM-03`. Suporte pediu categorias configuráveis; configurabilidade adiciona complexidade em UI, RLS e migração.
- Decisão: Fase 1 fixa `ticket_category = support | commercial | financial | refund | other`. Configurável por marca fica Fase 2 (requer `brand_ticket_category` + RLS + UI de admin).
- Alternativas: configurável desde o início — rejeitada: escopo excessivo para ganho marginal na Fase 1.
- Consequências: se novo valor for necessário antes da Fase 2, adicionar via migration (deprecação sem remoção).
- Fecha: `OQ-ENUM-03`.

## ADR-15 — Ordem de emit em transações compostas
- Data: 2026-04-23
- Status: proposto
- Contexto: transações compostas (ex: `approveTransaction` chama `grantEntitlement`, `buildSnapshot`, etc.) podem emitir múltiplos eventos de timeline e entradas de audit. Sem regra, ordem fica dependente de implementação.
- Decisão: dentro de uma transação SQL, **primeiro** executar todas as mutações de domínio, **depois** chamar `emitTimelineEvent(...)` e `logAudit(...)` na ordem natural de ocorrência do fato. Ou seja: mutação → emit, mutação → emit. Nunca emit antes da mutação. Emits dentro da mesma tx SQL são persistidos ao commit; em caso de rollback, não vazam.
- Alternativas:
  - Emitir tudo no final da transação — rejeitada: perde ordem natural e causalidade.
  - Emit assíncrono fora da tx — rejeitada: quebra consistência audit ↔ estado.
- Consequências: `lib/timeline/emit.ts` recebe `tx` e grava na mesma transação. Testes de integração verificam ordem de eventos.

## ADR-16 — Formato canônico de `externalMessageId` para idempotência de webhooks
- Data: 2026-04-23
- Status: proposto
- Contexto: cada provider de webhook tem um id próprio; sem padrão, idempotência em `webhook_log` pode ter colisão cross-provider.
- Decisão: `externalMessageId = {provider}:{provider_event_id}`. Exemplos:
  - `digitalguru:evt_abc123`
  - `brevo:msg_xyz789`
  - `whatsapp:wamid.HBgNNTUxMTk4...`
  - `notazz:nfe_12345`
- Campo `webhook_log.external_id` é `UNIQUE` com esse formato. Handler de cada provider constrói o id no `ingestWebhook`.
- Alternativas: UUID gerado por nós — rejeitada: perde idempotência real (mesmo evento chegando 2x teria ids diferentes).
- Consequências: mappers de integração (`lib/integrations/<p>/mapper.ts`) têm função `buildExternalId(payload)` pura e testada.


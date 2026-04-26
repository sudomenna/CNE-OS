# MEMORY.md — Diário vivo do CNE-OS

Este arquivo é o diário operacional do projeto. Diferente dos ADRs (que capturam decisões arquiteturais formais em `docs/90-meta/04-decision-log.md`) e das OQs (que capturam dúvidas em aberto em `docs/90-meta/03-open-questions-log.md`), este arquivo é **append-only** e registra o que aconteceu na prática: decisões operacionais, divergências doc ↔ código, bugs corrigidos e handoffs de sessão.

## Como usar

1. **Nunca edite entradas antigas.** Se uma decisão mudou, adicione nova entrada referenciando a anterior.
2. **Toda entrada tem cabeçalho** com data ISO (`YYYY-MM-DD`), autor (`@humano` ou `@<subagent-name>`) e tag da seção.
3. **Mantenha entradas curtas.** Se precisar detalhar, linke para o arquivo (ADR, doc de domínio, PR).
4. **Ordem cronológica reversa por seção** (mais recente no topo de cada seção).

## Seções

### §1. Decisões operacionais

Decisões do dia-a-dia que não merecem ADR formal mas precisam ficar registradas para quem chega depois.

<!-- Exemplo:
#### 2026-04-23 · @humano · branch naming
Padrão de nome de branch: `<sprint>/<t-id>-<slug-curto>`. Ex: `sprint-0/t-0-01-bootstrap-pkg`.
Motivo: facilita filtrar PRs por sprint no GitHub Projects.
-->

#### 2026-04-23 · @cne-schema-author · T-0-05 · [STACK-BLOQUEIO] drizzle-kit version mismatch
Problema: `pnpm db:generate` e `pnpm db:push` falham com "This version of drizzle-kit requires newer version of drizzle-orm".
Versões instaladas: `drizzle-orm@0.35.3` + `drizzle-kit@0.27.2`. O drizzle-kit 0.27.x é incompatível com drizzle-orm 0.35.x.
Workaround adotado em T-0-05: migration SQL escrita manualmente em `lib/db/migrations/0001_organization_brand_legal_entity.sql`, copiada para `supabase/migrations/20260423000001_organization_brand_legal_entity.sql` e aplicada via `supabase db push --linked`.
Acao necessaria (bloqueante para T-0-06+): upgrade coordenado de `drizzle-orm` e `drizzle-kit` para versoes compativeis. Requer decisao humana (mudanca de minor em dep critica).

#### 2026-04-23 · @humano · bootstrap da fundação
Inicializado o projeto com `.gitignore`, `MEMORY.md`, 7 subagents customizados, matriz de testes por sprint, ADRs 10-16 propostos (pendente aprovação), e refinos de doc para paralelismo. Repo ainda pré-código; Sprint 0 será plano separado.

---

### §2. Divergências doc ↔ código

Toda vez que o código precisar divergir da spec (temporariamente ou não), registrar aqui. Flag `[SYNC-PENDING]` indica que a doc ainda não foi atualizada; `[SYNCED]` indica que doc e código estão alinhados.

**Formato:**
```
#### YYYY-MM-DD · @autor · [SYNC-PENDING|SYNCED] · <módulo>
Doc afetada: docs/<path>.md
Divergência: <o que o código faz que a doc não reflete>
Motivo: <por que divergiu>
Ação: <atualizar doc em <quando> | deliberadamente mantido>
```

#### 2026-04-26 · @cne-ui-author · [SYNC-PENDING] · T-16-09 · tableId campaigns:creatives não listado no inventário
Doc afetada: `docs/70-ux/12-table-column-customizer.md` §3.1 (Inventário oficial)
Divergência: T-16-09 introduziu o tableId `campaigns:creatives` (tabela de criativos em `/campaigns/[id]`, componente `components/campaign/creative-list.tsx`). O inventário §3.1 lista apenas `campaigns:list` como cobrindo `/campaigns` + `/campaigns/[id]`, sem entrada separada para a sub-tabela de criativos.
Motivo: o inventário previa uma única entrada por rota; a investigação revelou que `/campaigns/[id]` tem tabela própria de criativos merecedora de customização independente.
Ação: T-16-15 (doc-sync) deve adicionar entrada `campaigns:creatives | /campaigns/[id] (tabela Criativos) | C | T-16-09` no inventário §3.1 de `docs/70-ux/12-table-column-customizer.md`.

#### 2026-04-26 · @cne-domain-author · [SYNC-PENDING] · MOD-CHANNEL · T-15-03
Doc afetada: `docs/30-contracts/07-module-interfaces.md` (§MOD-CHANNEL — seção ainda não existe)
Divergência: `lib/domain/channel/index.ts` expõe `createChannelAccount`, `updateChannelAccount`, `listChannelsByBrand`, `getChannelCredentials` + tipos + erros. `lib/db/crypto.ts` expõe `encryptCredentials`, `decryptCredentials`, `CredentialEnvelope`, `CryptoConfigError`. Nenhum dos dois documentados em `07-module-interfaces.md`.
Motivo: T-15-03 cria o domínio; doc-sync serial é T-15-06.
Ação: documentar §MOD-CHANNEL + `lib/db/crypto.ts` em `07-module-interfaces.md` em T-15-06.

#### 2026-04-26 · @cne-domain-author · [SYNC-PENDING] · MOD-RBAC · T-15-01
Doc afetada: `docs/30-contracts/07-module-interfaces.md` (§MOD-RBAC — seção ainda não existe)
Divergência: `lib/domain/rbac/index.ts` expõe `grantPermission`, `revokePermission`, `listRoleMatrix` + tipos `RoleMatrix`, `RoleMatrixRole`, `RoleMatrixPermission`, `RoleMatrixAssignment` + erros `RbacDomainError`, `RoleNotFound`, `PermissionNotFound`, `CannotModifyAdminRole`. Não há domain doc `docs/20-domain/rbac.md` nem seção §MOD-RBAC em `07-module-interfaces.md`.
Motivo: T-15-01 cria o domínio; doc-sync serial é T-15-06.
Ação: documentar §MOD-RBAC em `07-module-interfaces.md` em T-15-06.

#### 2026-04-25 · @cne-domain-author · [SYNC-PENDING] · MOD-AUTOMATION · T-11-08
Doc afetada: `lib/timeline/schemas/index.ts` (KIND_REGISTRY — fora do ownership de MOD-AUTOMATION)
Divergência: T-11-08 adicionou dois kinds ao KIND_REGISTRY de MOD-TIMELINE:
  - `automation_executed` (source: MOD-AUTOMATION) — exigido pela action `emit_timeline_event`
  - `user_notification` (source: MOD-AUTOMATION) — exigido pela action `notify_user` (Fase 1)
Estes kinds não estavam documentados em `docs/30-contracts/03-timeline-event-catalog.md`.
Motivo: sem adicionar os kinds ao registry, `emitTimelineEvent` lançaria `UnknownTimelineKindError` bloqueando as actions. A adição é additive/não-destrutiva.
Ação: T-11-09 ou tarefa de docs-sync deve registrar `TE-AUTOMATION-EXECUTED` e `TE-USER-NOTIFICATION` em `docs/30-contracts/03-timeline-event-catalog.md`.

#### 2026-04-25 · @cne-docs-sync · [SYNCED] · MOD-ANALYTICS · Sprint 10
Doc afetada: `docs/30-contracts/07-module-interfaces.md` (nova seção MOD-ANALYTICS), `docs/80-roadmap/07-sprint-10-analytics.md` (DoD checklist)
Ações executadas:
1. Adicionada seção completa `MOD-ANALYTICS` em `docs/30-contracts/07-module-interfaces.md`:
   - Documentadas 6 funções de leitura: `querySalesByDay`, `queryRefundsByDay`, `queryDelinquency`, `queryOverviewKpis`, `queryFunnelConversion`, `queryInboxDaily`, `queryCampaignAttribution`.
   - Todos os tipos exportados: `AnalyticsFilters`, `SalesByDayRow`, `RefundByDayRow`, `DelinquencyRow`, `FunnelConversionRow`, `InboxDailyRow`, `CampaignAttributionRow`, `OverviewKpis`.
   - Documentado padrão: módulo puro de leitura (zero escrita), sem Server Actions, interface via RSC + Route Handler de export.
   - RLS confirmado em todas as queries (filtra por `brand_id`).
2. Atualizado Sprint 10 DoD em `docs/80-roadmap/07-sprint-10-analytics.md`: todos os 7 critérios marcados como [x] concluído.
Status: **SINCRONIA COMPLETA** — MOD-ANALYTICS documentado de acordo com implementação. Nenhuma divergência.

#### 2026-04-25 · @cne-domain-author · [SYNC-PENDING] · MOD-BILLING · T-9-04
Doc afetada: `docs/30-contracts/07-module-interfaces.md` §MOD-BILLING
Divergência:
1. `07-module-interfaces.md` declara `startSubscription(tx, { transactionId, plan })` mas a implementação em T-9-04 é `createSubscriptionFromTransaction(tx, transactionId, emit?)`. O tipo `BillingPlan` não está definido no codebase; a função real deriva status e período da transação sem argumento `plan`. Nomes e assinaturas divergem.
2. O KIND `subscription_started` existe em `lib/timeline/schemas/subscription-events.ts` (T-9-17) mas NÃO está registrado em `lib/timeline/schemas/index.ts` KIND_REGISTRY. A implementação de T-9-04 usa o stub `te_subscription_stub` (único kind MOD-BILLING registrado) como proxy para `TE-SUBSCRIPTION-STARTED`.
Motivo: T-9-17 é tarefa futura designada para registrar os subscription kinds; T-9-04 não tem ownership de `lib/timeline/`.
Ação:
- T-9-17: registrar `subscription_started` (e demais subscription/installment kinds) em `lib/timeline/schemas/index.ts` KIND_REGISTRY.
- Migrar emit em `create-subscription.ts` de `te_subscription_stub` para `subscription_started` quando T-9-17 concluído.
- Atualizar `docs/30-contracts/07-module-interfaces.md` §MOD-BILLING com assinatura real `createSubscriptionFromTransaction`.

#### 2026-04-25 · @cne-docs-sync · [SYNC-PENDING] · MOD-ENTITLEMENT · T-8-08..T-8-10
Doc afetada: `docs/30-contracts/07-module-interfaces.md` §MOD-ENTITLEMENT
Divergência: 
1. Arquivo `lib/domain/entitlement/revoke.ts` implementa `revokeByTransaction(tx, transactionId, reason): Promise<CustomerEntitlement[]>`, mas **NÃO está re-exportado** em `lib/domain/entitlement/index.ts`. Consumo real (MOD-REFUND.approveRefund linha 30) faz direct import: `from '@/lib/domain/entitlement/revoke'`.
2. Documentação em `docs/30-contracts/07-module-interfaces.md` lista `revokeEntitlement(tx, entitlementId, reason): Promise<void>` como interface pública — assinatura DIFERENTE da implementação real.
3. Implementação real: `revokeByTransaction(tx: DbTx, transactionId: string, reason: string): Promise<CustomerEntitlement[]>` — revoga **todos os ativos de uma transação**, não um entitlement individual.
Motivo: T-8-09 implementou interface por transação (conserte com MOD-REFUND que revoga em lote); 07-module-interfaces.md tem stubs antigos de T-0-xx.
Ação: 
- Atualizar `docs/30-contracts/07-module-interfaces.md` com assinatura real: `revokeByTransaction(tx, transactionId, reason)` com tipo correto.
- Decidir: deveria `revokeByTransaction` estar re-exportada em `lib/domain/entitlement/index.ts`? Padrão projeto recomenda tudo no index.ts. Se sim, adicionar ao exports; senão, documentar pattern de "direct import de submodulo".

#### 2026-04-25 · @cne-docs-sync · [SYNCED] · MOD-TRANSACTION, MOD-ENTITLEMENT · T-8-07..T-8-10
Doc afetada: `docs/30-contracts/07-module-interfaces.md` §MOD-TRANSACTION e §MOD-ENTITLEMENT
Ações executadas:
1. **MOD-TRANSACTION interface:**
   - Renomeado `createTransaction` → `createPendingTransaction` (refletindo assinatura real em `lib/domain/transaction/create-pending.ts`).
   - Expandida descrição com pré-condição BR-OFFER-UNIQUENESS e campos reais (offerConditionId, offerPaymentOptionId em vez de conditionId).
   - Adicionada função pura `composeSnapshot(offer, condition, items, paymentOption, context): TransactionSnapshotPayload`.
   - Adicionada função `flagSnapshotRefunded(tx, snapshotId, refundId): Promise<void>` consumida por MOD-REFUND (T-8-19).
2. **MOD-ENTITLEMENT interface:**
   - Renomeado `grantEntitlement` → `grantFromTransaction` (refletindo assinatura real de T-8-08).
   - Adicionada função `revokeByTransaction(tx, transactionId, reason): Promise<CustomerEntitlement[]>` (T-8-09) — **revoga todos de uma transação**, não individual.
   - Mantida função pura `consolidate` com assinatura correta.
   - Adicionados tipos de erro: `EntitlementDomainError`, `TransactionSnapshotNotFoundError`, `TransactionNotFoundError`, `EntitlementNotFoundError`.
3. **Nota de design:** `revokeByTransaction` está implementada em `lib/domain/entitlement/revoke.ts` mas NÃO re-exportada em `index.ts`. Consumo é via direct import (padrão projeto — pendente decisão se deveria estar em index.ts).
Status: **ALINHAMENTO PARCIAL** — assinaturas documentadas. Pendência: decidir se `revokeByTransaction` deveria estar em `index.ts` exports (escalar para cne-br-auditor).

#### 2026-04-25 · @cne-docs-sync · [SYNCED] · MOD-REFUND · T-8-18..T-8-20
Referência: [SYNC-PENDING] 2026-04-25 anterior sobre MOD-REFUND.
Doc afetada: `docs/30-contracts/07-module-interfaces.md` §MOD-REFUND, `docs/20-domain/14-refund.md` §2, `docs/30-contracts/03-timeline-event-catalog.md` §Reembolso
Ações executadas:
1. Atualizado `docs/30-contracts/07-module-interfaces.md § MOD-REFUND`:
   - Corrigido nome de `requestRefund` → `openRefund` (nome canônico implementado em T-8-18).
   - Expandidas assinaturas de `approveRefund` (8 efeitos atômicos listados), `rejectRefund`, `markProcessed` refletindo código real.
   - Adicionados tipos de erro: `RefundDomainError`, `RefundNotFoundError`, `RefundTransactionNotFoundError`, `TransactionNotApprovedError`, `ActiveRefundExistsError`, `InvalidRefundStatusError`.
2. Atualizado `docs/20-domain/14-refund.md` §2:
   - Adicionada `refund_status_history` ao ownership de `lib/db/schema/refund.ts`.
   - Atualizada seção de interfaces públicas com assinaturas reais e parametrização de funções.
3. Adicionada seção **Reembolso** em `docs/30-contracts/03-timeline-event-catalog.md`:
   - Documentados 4 novos kinds de timeline: `TE-REFUND-OPENED`, `TE-REFUND-APPROVED`, `TE-REFUND-REJECTED`, `TE-REFUND-PROCESSED`.
   - Payloads e emissores especificados.
Status: **SINCRONIA RESTAURADA** — MOD-REFUND doc ↔ código alinhados. SYNC-PENDING de 2026-04-25 resolvido.

#### 2026-04-25 · @cne-docs-sync · [SYNCED] · Sprint 6-7 — Offer Engine (MOD-CATALOG + MOD-OFFER)
Modules: MOD-CATALOG (T-6-01..04), MOD-OFFER (T-6-05..25).
Ações executadas:
1. **MOD-CATALOG interface:** Adicionadas assinaturas de `normalizeSlug`, `validateSlug`, `ensureValidSlug`, `resolveAutoTag` + erros (`CatalogDomainError`, `InvalidSlugError`).
2. **MOD-OFFER interface:** Documentados `evaluateEligibility`, `evaluateRuleGroup`, `evaluateRule`, `selectCondition`, `incrementSalesCounter`, `recordPriorityChange`, `guardLegalEntityImmutable` + erros (`OfferDomainError`, `OfferCounterNotFoundError`, `OfferLegalEntityImmutableError`, `NoPriorityChangeError`).
3. **Enums verificados:** `offer_status`, `offer_condition_status`, `offer_rule_kind`, `offer_rule_operator`, `offer_payment_method`, `offer_condition_item_kind`, `product_kind` já presentes em `docs/30-contracts/01-enums.md`.
4. **Server Actions:** `docs/30-contracts/05-api-server-actions.md` atualizada com ações de offer + catalog.
Status: **SINCRONIA RESTAURADA** — Sprint 6-7 doc ↔ código alinhados. SYNC-PENDING T-6-25 resolvido.

#### 2026-04-25 · @cne-docs-sync · [SYNCED] · Sprint 5 — Varredura final doc ↔ código
Modules implementados: MOD-CAMPAIGN (T-5-01,02,03,04,05,06), MOD-FUNNEL (T-5-07,08,09,10,11,12,13,14), MOD-TIMELINE (T-5-15), RBAC (T-5-10,11).
Ações de sincronização realizadas:
1. **MOD-CAMPAIGN interface:** Expandida `docs/30-contracts/07-module-interfaces.md § MOD-CAMPAIGN` com assinaturas de `createCampaign`, `createCreative`, `issueTrackableLink`, `recordClick` (conforme código em `lib/domain/campaign/index.ts` e `app/(app)/campaigns/actions.ts`). Corrigida assinatura de `generateUtm` para refletir UtmContext real.
2. **MOD-FUNNEL interface:** Adicionado `setOpportunityLabel` em `docs/30-contracts/07-module-interfaces.md § MOD-FUNNEL`. Expandidas pós-condições e BRs para todas as funções.
3. **Timeline events:** Verificado que `lib/timeline/schemas/index.ts` registra corretamente todos os kinds emitidos: `funnel_entered`, `funnel_stage_changed`, `opportunity_label_changed`, `opportunity_won`, `opportunity_lost`, `campaign_link_clicked` (T-5-15 finalizado).
4. **Enums:** Confirmado que `funnel_opportunity_label` em `docs/30-contracts/01-enums.md` cobre todos os 6 valores usados no código.
5. **RBAC:** Verificado que `lib/auth/rbac/matrix.ts` e `docs/50-business-rules/BR-RBAC.md` alinhados com 3 novas ações de funnel (`funnel.create`, `funnel.manage`, `funnel.close`).
Status: **SINCRONIA RESTAURADA** — todos os módulos Sprint 5 doc ↔ código alinhados. Nenhuma divergência residual.

#### 2026-04-25 · @cne-docs-sync · [SYNCED] · MOD-FUNNEL · T-5-10 · MEMORY-2026-04-25a
Referência: [SYNC-PENDING] 2026-04-25 anterior sobre MOD-FUNNEL.
Ações executadas:
1. Adicionado `setOpportunityLabel` em `docs/30-contracts/07-module-interfaces.md § MOD-FUNNEL` com assinatura correta.
2. Verificado que `lib/timeline/schemas/index.ts` tem Kind Registry com `funnel_entered`, `funnel_stage_changed`, `opportunity_label_changed` registrados corretamente (T-5-15 concluído).
3. Enums `funnel_opportunity_label` confirmado em `docs/30-contracts/01-enums.md`.
Status: SINCRONIA RESTAURADA — doc e código alinhados.

#### 2026-04-25 · @cne-domain-author · [SYNC-PENDING] · MOD-FUNNEL · T-5-10
Doc afetada: `docs/30-contracts/07-module-interfaces.md` (seção MOD-FUNNEL) e `lib/timeline/schemas/index.ts`
Divergências:
1. `setOpportunityLabel` implementado em `lib/domain/funnel/label.ts` NÃO está listada em `docs/30-contracts/07-module-interfaces.md § MOD-FUNNEL`. O contrato atual lista apenas `enterFunnel`, `moveStage`, `markWon`, `markLost`, `updateScore`. Precisar adicionar `setOpportunityLabel(tx, input): Promise<void>`.
2. Timeline kinds `funnel_entered`, `funnel_stage_changed`, `opportunity_label_changed` são emitidos pelas funções de T-5-10 mas NÃO estão registrados em `lib/timeline/schemas/index.ts` nem em `KIND_REGISTRY`. Em produção, `emitTimelineEvent` lançará `UnknownTimelineKindError`. T-5-15 deve criar `lib/timeline/schemas/funnel-events.ts` e registrar esses kinds.
Motivo: T-5-15 é a tarefa designada para schemas de timeline de funil; T-5-10 não tem ownership de `lib/timeline/`.
Ação:
- T-5-15: criar `lib/timeline/schemas/funnel-events.ts`, registrar `funnel_entered`, `funnel_stage_changed`, `opportunity_label_changed` no KIND_REGISTRY.
- Tarefa serial: adicionar `setOpportunityLabel` em `docs/30-contracts/07-module-interfaces.md`.

#### 2026-04-24 · @cne-domain-author · [SYNC-PENDING] · MOD-TICKET · T-3-13
Doc afetada: `lib/timeline/schemas/index.ts`
Divergência: ticket event kinds (`ticket_opened`, `ticket_status_changed`, `ticket_resolved`, `ticket_reopened`, `ticket_assigned`, `ticket_unassigned`) foram adicionadas inline em `lib/timeline/schemas/index.ts` como parte de T-3-13. T-3-15 deve extraí-las para arquivos separados `lib/timeline/schemas/ticket-*.ts` e registrá-las via re-export.
Motivo: `emitTimelineEvent` valida kinds no registry — sem registro os testes de T-3-13 falhariam. T-3-15 é dependência downstream mas não pré-requisito.
Ação: T-3-15 deve mover as entradas de ticket do KIND_REGISTRY para `lib/timeline/schemas/ticket-*.ts` e importar de lá.

#### 2026-04-24 · @cne-domain-author · [SYNC-PENDING] · MOD-CONTACT · T-1-08
Doc afetada: docs/30-contracts/07-module-interfaces.md (seção MOD-CONTACT · resolveContactIdentity)
Divergência: a interface em 07-module-interfaces.md define `resolveContactIdentity(tx: DbTx, input: IdentityInput)` com retorno `{ matchedContactId, confidence, conflict, candidates }` — formato simplificado. A implementação efetiva em `lib/domain/contact/resolve-identity.ts` segue a BR-IDENTITY completa: assinatura `(input: IdentityInput, tx?: DbTx)` com retorno `IdentityResolution = create | update | noop` + `ContactIssueDraft[]` + `AppliedChange[]`. A BR é a fonte canônica; o contrato em 07-module-interfaces.md é a versão desatualizada.
Motivo: T-1-08 implementou o contrato da BR-IDENTITY; 07-module-interfaces.md ainda reflete esboço anterior.
Ação: atualizar docs/30-contracts/07-module-interfaces.md (tarefa serial) para refletir a assinatura real implementada.

#### 2026-04-23 · @cne-domain-author · [SYNC-PENDING] · MOD-TIMELINE
Doc afetada: docs/30-contracts/07-module-interfaces.md
Divergência: `lib/timeline/emit.ts` expõe interface pública `emitTimelineEvent` + `ModuleSource` + `TimelineEventInput` que ainda não está listada na seção MOD-TIMELINE de 07-module-interfaces.md.
Motivo: T-0-13 criou o módulo de domínio; atualização de 07-module-interfaces.md é tarefa serial (CLAUDE.md §2 regra 6).
Ação: atualizar docs/30-contracts/07-module-interfaces.md na próxima onda serial antes do Sprint 1.

---

### §3. Bugs corrigidos

Entradas curtas por bug corrigido. Não é lista de todos os bugs — é a lista dos que valem a pena lembrar (aqueles onde a causa-raiz foi não-óbvia ou onde o padrão pode se repetir).

**Formato:**
```
#### YYYY-MM-DD · @autor · <módulo>
Sintoma: <o que estava errado>
Causa-raiz: <por que estava errado>
Fix: <arquivo e abordagem>
Prevenção: <teste adicionado, regra de lint, etc.>
```

<!-- Nenhuma entrada ainda -->

---

### §4. Sessão / Handoff

Log por sessão de trabalho. Atualizado no **fim** de cada sessão relevante. Serve para quem (humano ou agente) pegar o trabalho depois saber de onde continuar.

**Formato:**
```
#### YYYY-MM-DD · @autor · sessão <nome>
Entregue: <o que foi finalizado e mergeado>
Em andamento: <o que ficou no meio>
Pendente: <o que precisa ser feito na próxima sessão>
Aprendizados: <o que surpreendeu, o que mudaria>
```

#### 2026-04-23 · @claude-code · fundação pré-Sprint-0
**Entregue:**
- `.gitignore`, `MEMORY.md` (este arquivo)
- 7 subagents customizados em `.claude/agents/`
- `docs/80-roadmap/98-test-matrix-by-sprint.md` (matriz de testes)
- `docs/80-roadmap/97-ownership-matrix.md` (mapa de ownership T-ID → arquivos)
- ADRs 10-16 propostos em `docs/90-meta/04-decision-log.md`
- `scripts/verify-wave.sh` (verificação inter-ondas)
- Atualizações em `CLAUDE.md` (§10 doc-sync, §11 subagents) e `docs/90-meta/05-subagent-playbook.md` (DoD + TaskList template)
- Diagrama ASCII de deps em `docs/10-architecture/09-module-boundaries.md`

**Em andamento:** nada.

**Pendente:**
- Aprovação dos ADRs 10-16 pelo humano (viram `accepted` e fecham as OQs correspondentes).
- Plano detalhado de Sprint 0 (18 T-IDs, 7 ondas) como próxima rodada.
- Criar repositório remoto no GitHub e `git remote add origin`.

**Aprendizados:**
- A documentação já estava muito madura — os GAPs reais eram operacionais (git, MEMORY, subagents, matriz de testes), não conceituais.
- OQs bloqueantes de paralelização (IFACE-01, IFACE-03, ENUM-01/02/03) precisavam de decisão antes de qualquer onda — resolvidas via ADRs propostos.

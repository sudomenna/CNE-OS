# 98 — Matriz de testes por sprint

Complemento a `99-acceptance-criteria-by-sprint.md` (que define **se passou**). Esta matriz define **o que testar** em cada entrega, por camada.

## Camadas (referência)

- **Unit** (Vitest, sem I/O): regras puras de domínio em `lib/domain/*`. Cobertura alvo: 90% em domínio, 100% em RBAC.
- **Integration** (Vitest + Postgres efêmero): Server Actions, triggers de DB, handlers Inngest. HMAC sempre calculado de verdade. DB real (testcontainer ou schema efêmero Supabase). Sem mocks de DB.
- **E2E** (Playwright, multi-browser): jornadas críticas de usuário. Roda pré-deploy.
- **Smoke manual**: verificação humana pré-release para sprints com integração externa de alto risco.

## Matriz

| Sprint | Unit | Integration | E2E (Playwright) | Smoke manual |
|---|---|---|---|---|
| **0 — Fundações** | `lib/auth/rbac/matrix.test.ts` (permissões por papel, 5 casos × N ações), `lib/auth/rbac/require.test.ts`, factories em `tests/fixtures/*.test.ts` | trigger `audit_log` rejeita UPDATE/DELETE, trigger `timeline_event` rejeita UPDATE/DELETE, trigger `webhook_log` append-only, RLS: user da marca A não lê dados da marca B | login email+senha, login com 2FA TOTP, logout, seed de admin cria marca e convida usuário | criar marca, convidar usuário, trocar senha |
| **1–2 — CRM Core** | `contact/identity.test.ts` (8 casos nomeados de BR-IDENTITY), `contact/normalize.test.ts` (telefone `(11) 98888-7777` → `+5511988887777`, email lowercase+trim), `contact/merge.test.ts` (merge + undo atômico, 2º undo falha) | `contact.create` com duplicata determinística detectada, merge move transações/tickets/tags, timeline consolidada mostra eventos do principal + mergeados ordenados, custom fields preservados em merge | criar contato → ver timeline vazia, criar contato duplicado → UI oferece merge, fazer merge → ver consolidação, desfazer merge → estado restaurado | import CSV de 1000 contatos com duplicatas reais do CRM atual |
| **3–4 — Inbox + Tickets** | `inbox/assign.test.ts` (regra de atribuição), `inbox/channel-mappers.test.ts` (WA/IG/email → InternalMessage), `ticket/sla.test.ts` (cálculo de vencimento) | webhook WA de entrada → `inbox_message` + evento de timeline; resposta do operador → envio via WA API; abrir ticket a partir de conversa vincula corretamente; SLA estoura → notificação | FLOW-02: atendente recebe mensagem no inbox → responde → abre ticket → encaminha | conversa real de WhatsApp com template aprovado; DM Instagram; thread de email |
| **5 — Marketing + Funis** | `funnel/score.test.ts` (cálculo configurável), `campaign/utm-parse.test.ts` (parsing + normalização), `creative/link.test.ts` (geração de link rastreável), `funnel/stage-transition.test.ts` | mudança de estágio gera evento de timeline, UTMs persistidas em `contact_first_touch`, link rastreável registra clique e associa ao contato quando identificado | criar campanha → criar criativo → gerar link rastreável → simular clique → contato aparece com UTM preenchida → mover estágio no funil | clique real em link de campanha ativa (confirmar rastreamento end-to-end) |
| **6–7 — Motor de ofertas** | `offer/eligibility.test.ts` (todas as BRs de elegibilidade), `offer/decision.test.ts` (desempate por timestamp mais recente, BR-OFFER-DECISION §3), `coupon/validate.test.ts`, `condition/expire.test.ts` | motor de decisão com 3 ofertas candidatas retorna a correta, expiração de condição remove do motor automaticamente, cupom inválido rejeitado com erro tipado | FLOW-05: vendedor abre contato → motor sugere oferta → aceita → redireciona para checkout DG | vendedor executa fluxo real com 3 contatos de teste; confere preço e condições |
| **8 — Snapshot + DG + Reembolso** | `snapshot/build.test.ts` (snapshot captura todas as condições), `refund/approve.test.ts` (revoga entitlement + flag no snapshot), `entitlement/derive.test.ts` (derivação a partir do snapshot) | DG webhook idempotente (3× o mesmo evento → 1 transação + 1 timeline), snapshot imutável (trigger bloqueia UPDATE/DELETE com exceção), refund aprovado revoga entitlement em cascata | FLOW-07: abrir reembolso → aprovar → verificar DG sandbox notificado → verificar entitlement revogado → verificar recompra liberada | conciliação real com DG sandbox (10 transações); checar 100% batem |
| **9 — Assinaturas + Inadimplência** | `subscription/advance.test.ts` (ciclo mensal/anual), `dunning/retry.test.ts` (intervalos crescentes), `installment/split.test.ts` (divisão de parcelamento) | ciclo de cobrança falha → Inngest enfileira retry → 3ª falha dispara dunning; cliente paga → assinatura volta para ativa; cancelamento manual revoga entitlement no fim do ciclo | inadimplência gera notificação + entrada na fila de dunning; pagamento manual reconcilia | cobrança recorrente real em DG sandbox por 2 ciclos |
| **10 — Analytics** | helpers de agregação (funil conversão, ticket médio), SQL de materialized views documentada | refresh de MV via Inngest cron, invalidation após evento relevante, dashboard SQL retorna em <500ms para volume alvo | dashboards gerenciais carregam com dados reais da staging | reunião com financeiro revisando 3 dashboards com números cruzados |
| **11 — Automações** | `automation/trigger-match.test.ts` (matching de evento → trigger), `executor/step.test.ts` (execução ordenada com idempotência) | trigger real (TE-SALE-APPROVED) → automação configurada → ação executada (enviar email via Brevo); falha → retry + DLQ | criar automação visual no editor, disparar trigger, verificar execução no painel Inngest | smoke end-to-end de uma automação típica do negócio atual |

## Definition of Done por T-ID

Um T-ID só é marcado `completed` quando **todos** os critérios abaixo são satisfeitos:

1. ✅ **Código implementado** dentro do ownership declarado (não toca arquivos de outros módulos).
2. ✅ **Testes da camada apropriada**:
   - Unit sempre obrigatório quando a tarefa implementa regra ou transformação.
   - Integration obrigatório quando toca DB, trigger, RLS, webhook ou Inngest handler.
   - E2E obrigatório quando a tarefa concretiza uma jornada listada na coluna E2E desta matriz.
3. ✅ **Doc atualizada** (ver `CLAUDE.md §10`) OU entrada em `MEMORY.md §2` com flag `[SYNC-PENDING]`.
4. ✅ **Verificação local verde**: `pnpm typecheck && pnpm lint && pnpm test` (e `pnpm test:e2e` quando aplicável).
5. ✅ **PR review aprovado**.
6. ✅ **Security review aprovado** quando o T-ID toca: `lib/auth/*`, RBAC matrix, webhook signature, refund flow, RLS policy.

## Convenções de teste

- **Nome de teste Given/When/Then**: `describe('BR-IDENTITY', () => { it('given email canônico when create then existing contact is returned', ...) })`.
- **Fixtures centralizadas** em `tests/fixtures/index.ts`: `makeBrand()`, `makeContact()`, `makeOffer()`, etc. Nunca `INSERT` manual em teste.
- **Nenhum mock de DB** em integration. Se a função precisa de DB, a integração prova que a função funciona com DB real.
- **Webhook tests** usam fixtures reais anonimizadas em `lib/integrations/<provider>/fixtures/` + HMAC calculado com secret de teste.
- **Seed de cada sprint** vive em `lib/db/seed/<sprint>.ts` e é exercitado nos testes de integration (garante que evolui junto).

## Cobertura por módulo (metas)

| Módulo | Unit | Integration |
|---|---|---|
| `lib/auth/rbac/` | 100% | — |
| `lib/domain/*` | ≥ 90% | — |
| Server Actions | — | ≥ 80% dos fluxos principais |
| Webhook handlers | — | 100% dos providers ativos |
| Triggers SQL | — | 100% dos triggers append-only / soft-delete |

Cobertura é **indicação**, não contrato. Priorize cobrir ramos de BR antes de perseguir porcentagem.

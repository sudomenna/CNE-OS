# FLOW-12: Reprocessamento manual de webhook (DLQ)

## Gatilho / pré-condições

Um ou mais `webhook_log` estão com `status='dead_letter'` (esgotadas as 5 tentativas automáticas do Inngest) ou `status='failed'` (falha fatal imediata). Operador precisa investigar e reprocessar após corrigir a causa raiz.

Pré-condições:
- evento persistido em `webhook_log` com `provider`, `external_event_id`, `payload` originais;
- operador com papel `admin` ou `financial` (causa: reprocess pode disparar venda/entitlement).

## Atores

- humano: operador (admin/financial).
- sistema: `MOD-INTEGRATION` (`reprocessWebhook`, `processWebhook`); Inngest; módulo destino conforme `provider` (MOD-TRANSACTION, MOD-INBOX, etc.).
- integração: o próprio provedor externo é apenas a origem histórica — não participa deste fluxo.

## Passos

1. **Listar DLQ** — UI `/integrations/dlq` mostra tabela filtrada `status IN ('dead_letter','failed')` com colunas: `provider`, `event_kind`, `received_at`, `attempts`, `last_error`, `external_event_id`.
2. **Inspecionar payload** — operador abre uma linha; UI mostra `payload` (JSON formatado), `last_error` com stack trace (quando disponível), histórico de `attempts`.
3. **Diagnosticar causa** — operador identifica: oferta não mapeada, contato em blacklist, bug já corrigido, campo faltando no payload, etc. Registra nota em `webhook_log.operator_notes` (append-only jsonb).
4. **Ações disponíveis**:
   - `reprocess` — retoma processamento com payload original;
   - `ignore` — marca como `processed` sem efeito (ex.: evento obsoleto ou duplicata reconhecida);
   - `edit-and-reprocess` — Fase 2 (editar payload antes de reprocessar — `OQ-FLOW-12-01`); Fase 1 não permite.
5. **Executar `reprocessWebhook(webhookLogId, actorUserId)`** — [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md):
   1. Guard RBAC + 2FA.
   2. UPDATE `webhook_log SET status='received', attempts=0, last_error=NULL, updated_at=now() WHERE id=$`; preserva `payload`, `received_at`, `external_event_id`.
   3. Emitir `TE-WEBHOOK-REPROCESSED` no contato vinculado (quando identificável via payload).
   4. Enfileirar `processWebhook(id)` no Inngest.
6. **Processamento** — Inngest executa:
   - rota canônica do provedor (MOD-INTEGRATION delega ao handler específico);
   - sucesso ⇒ `status='processed', processed_at=now()`;
   - falha ⇒ `attempts++`; após 5 falhas novas, volta a `dead_letter`.
7. **Ação `ignore`**:
   - UPDATE `webhook_log SET status='processed', processed_at=now()`, nota em `operator_notes`;
   - **não** enfileira processamento;
   - emite `TE-INTEGRATION-EVENT` com `payload.reason='ignored_by_operator'`.
8. **Auditoria** — registrar em `audit_log` (`BR-AUDIT`) ação crítica (`reprocess` / `ignore`) com ator, timestamp, `webhook_log.id`.

## Pós-condições

- `webhook_log` em `processed` (sucesso, ou ignorado) **ou** novamente em `dead_letter` (falhou de novo).
- Se processou: efeitos canônicos do provedor executaram (venda registrada, mensagem persistida, etc.) — ver fluxos específicos.
- `TE-WEBHOOK-REPROCESSED` persistido quando contato vinculável.
- `audit_log` contém registro da ação humana.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `webhook_log.status NOT IN ('dead_letter','failed')` | 409 `CannotReprocessNonFailed` | — |
| E-02 | RBAC falha | 403 | escalar |
| E-03 | processamento falha de novo (causa não corrigida) | volta a `dead_letter`; operador investiga | — |
| E-04 | corrida: dois operadores reprocessam simultâneo | `FOR UPDATE`; segundo recebe estado já `received`/`processed` | — |
| E-05 | `external_event_id` já tem linha `processed` (idempotência dupla detecta) | reprocess no-op; log informa | — |
| E-06 | payload corrompido (JSON inválido) | reprocess falha na validação zod; registrar erro; considerar `ignore` | — |

## Regras referenciadas

- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md)
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

- `TE-WEBHOOK-REPROCESSED` — sempre que operador dispara reprocess (contato vinculável).
- `TE-INTEGRATION-EVENT` — quando `ignore` é escolhido, para deixar rastro na timeline.
- Eventos canônicos do provedor (ex.: `TE-SALE-APPROVED` se o processamento agora bem-sucedido) — emitidos pelos fluxos específicos.

## Observabilidade

- Métricas:
  - `webhook_dead_letter_total{provider}` (gauge);
  - `webhook_reprocessed_total{provider, outcome}` (outcome: `processed|dead_letter|ignored`);
  - `webhook_dlq_age_hours{provider}` (histograma);
  - `webhook_reprocess_success_rate{provider}`.
- Logs (`correlation_id`, `webhook_log_id`, `provider`, `external_event_id`, `actor_user_id`, `flow='FLOW-12'`).
- Alertas:
  - PagerDuty: `webhook_dead_letter_total > 10` no provedor `digital_guru` (impacto financeiro).
  - Axiom: DLQ com idade > 24h — notificação diária para operação.
  - Sentry: reprocess falhando com mesma causa > 3x seguidas.

## Casos de teste E2E obrigatórios

1. **reprocess-sucesso-processa-venda**
   - Given: `webhook_log` Digital Guru em `dead_letter` (causa: oferta desmapeada, depois corrigida).
   - When: admin clica reprocess.
   - Then: status `received` → `processed`; FLOW-05 executa; transação criada; `TE-WEBHOOK-REPROCESSED` + `TE-SALE-APPROVED`.

2. **reprocess-falha-volta-dlq**
   - Given: causa não corrigida.
   - When: reprocess.
   - Then: nova falha após retries; `status='dead_letter'` novamente; `attempts` reinicia a contagem mas `last_error` atualizado.

3. **ignore-marca-processed-sem-efeito**
   - Given: evento obsoleto (oferta arquivada há meses).
   - When: operador escolhe ignore.
   - Then: `status='processed'`; `operator_notes` registra; `TE-INTEGRATION-EVENT payload.reason='ignored_by_operator'`; nenhum efeito de domínio.

4. **rbac-suporte-bloqueado**
   - Given: usuário `support`.
   - When: tenta reprocess.
   - Then: 403.

5. **idempotencia-dupla**
   - Given: operador aciona reprocess; enquanto job roda, reentrega do provedor original chega.
   - When: ambos executam.
   - Then: `external_event_id` UNIQUE garante único processamento; segundo é detectado como duplicate em `ingestWebhook`.

6. **audit-log-registra**
   - Given: reprocess disparado por admin.
   - When: completo.
   - Then: `audit_log` contém linha com `actor_user_id`, `action_kind='other'` (ou `reprocess_webhook`), `resource_id=webhook_log.id`.

## Open Questions

- `OQ-FLOW-12-01` — permitir edição de payload antes de reprocessar (ex.: corrigir `external_product_id` errado) na Fase 2? Hoje só reprocess bruto.
- `OQ-FLOW-12-02` — expurgo automático de `webhook_log.processed` antigos (`OQ-BR-IDEM-02`)? Fase 1 sem expurgo.
- `OQ-FLOW-12-03` — contato vinculável ao `webhook_log` para `TE-WEBHOOK-REPROCESSED`: derivar de payload (cpf/email) ou exigir mapping manual?

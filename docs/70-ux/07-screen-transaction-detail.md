# Tela: Detalhe da Transação (`/transactions/[id]`)

Visão definitiva de uma venda. Apresenta status, valor, contato, oferta, snapshot imutável, parcelas/assinatura, direitos gerados, auditoria e timeline filtrada. Ponto de partida para operações críticas: solicitar reembolso, reemitir NF-e, reprocessar webhook.

Consome: `MOD-TRANSACTION`, `MOD-ENTITLEMENT`, `MOD-BILLING`, `MOD-REFUND`, `MOD-TIMELINE`, `MOD-INTEGRATION`.

## 1. Wireframe

```text
+------------------------------------------------------------------------------+
| Breadcrumb: Transações > #trx_8h2b                                           |
+------------------------------------------------------------------------------+
| HEADER                                                                       |
|                                                                              |
| #trx_8h2b · [status: APROVADA]                      [Reembolsar] [NF-e ▾]    |
| R$ 497,00 · PIX · 09/04/2026 14:32                                           |
| Contato: Maria Silva  ·  Oferta: Trilha Pro  ·  Condição: "Oferta abril"     |
| CNPJ emissor: 12.345.678/0001-90 · Provedor: Digital Guru (ref: evt_abc123)  |
|                                                                              |
+------------------------------------------------------------------------------+
| TABS: [Itens] [Snapshot] [Parcelas/Assinatura] [Direitos] [Auditoria]        |
|       [Timeline]                                                             |
+------------------------------------------------------------------------------+
|                                                                              |
|  <conteúdo da tab>                                                           |
|                                                                              |
+------------------------------------------------------------------------------+
```

## 2. Header

### 2.1. Status badge

Badge de `transaction_status` com cor semântica:

| Status | Cor | Ícone |
|---|---|---|
| `pending` | warning | `clock` |
| `approved` | success | `check-circle` |
| `refused` | danger | `x-circle` |
| `refunded` | muted + flag | `rotate-ccw` |
| `chargeback` | danger + flag | `alert-triangle` |
| `cancelled` | muted | `ban` |

Quando `snapshot_flag='refunded'` ou `'disputed'`, badge secundário ao lado da status principal.

### 2.2. Campos principais

- Valor + moeda + método de pagamento.
- Data/hora (aprovado | recusado | refundado, conforme status).
- Link para o contato (chip clicável).
- Link para a oferta + nome da condição aplicada (chip).
- CNPJ da `legal_entity` emissora (carimbado no snapshot — imutável).
- Provedor externo + `external_ref` (copiável).

### 2.3. Ações

| Ação | Papéis | Efeito |
|---|---|---|
| Solicitar reembolso | admin, financeiro, suporte* | abre wizard de refund (FLOW-07 abertura); *suporte abre, só admin/financeiro aprovam |
| Aprovar reembolso pendente | admin, financeiro (com 2FA fresh) | FLOW-07 aprovação |
| Reemitir NF-e | admin, financeiro | job `notazz/invoice.reissue` |
| Cancelar NF-e | admin, financeiro | job `notazz/invoice.cancel` |
| Reprocessar webhook de origem | admin, financeiro | se `webhook_log` disponível, redireciona para FLOW-12 |
| Copiar ID | todos | clipboard |
| Ver contato | todos | `/contacts/[contactId]` |
| Ver oferta | todos | `/offers/[offerId]` |

Refunds pendentes mostram banner de aviso no topo com link para aprovar/rejeitar.

## 3. Tab Itens (default)

Materialização de `transaction_item` (snapshot itens derivados). Tabela densa:

| Coluna | Fonte |
|---|---|
| Kind | `offer_condition_item_kind` com ícone |
| Item | `product.name` ou `commercial_benefit.name` (congelado do snapshot) |
| Quantidade | 1 padrão |
| Preço unitário | `unit_price` congelado |
| Subtotal | calculado |
| Referência | `product.id` / `benefit.id` (link — mas aviso "snapshot imutável") |

Rodapé: subtotal, desconto, juros, total. Total confere com `transaction.amount` (sanity check; divergência = alerta).

## 4. Tab Snapshot

Visualizador do JSON `transaction_snapshot.payload` em árvore expansível. Pretty-printed, syntax highlight, busca. Readonly obrigatório — destaque visual ("SNAPSHOT IMUTÁVEL — BR-SNAPSHOT-IMMUTABILITY").

Quando `snapshot_flag != 'normal'`, painel secundário mostra `transaction_snapshot_flag_history` com cada transição (from→to, reason, caused_by, changed_by, ts).

Botão `Copiar JSON` e `Baixar .json`.

## 5. Tab Parcelas/Assinatura

Quando `offer.billing_kind='one_time'`:

- Lista de `installment` (mesmo sendo single, pode ter parcelas de cartão).
- Colunas: número, due_at, status, amount, paid_at, `external_ref`.

Quando `offer.billing_kind='subscription'`:

- Header da subscription: status, `current_period_start`, `current_period_end`, `cancelled_at?`, `cancel_reason?`.
- Ações: cancelar (confirma); pausar (quando suportado — OQ-BR-SUB-01).
- Lista de `installment` (scheduled/paid/overdue).
- Dunning info (retry_count, próximo retry).
- Histórico: `subscription_status_history` append-only.

Estado especial: se subscription `cancelled` e entitlements ainda ativos até `current_period_end`, banner informativo.

## 6. Tab Direitos

Lista de `customer_entitlement` originados desta transação (`origin_transaction_id`):

- Coluna: kind (`product_access`/`benefit`), ref (nome do produto/benefício), status, `starts_at`, `ends_at`, histórico (botão expande `entitlement_status_history`).
- Quando refund, linhas aparecem `revoked` com `last_update_transaction_id`.
- Clique em direito → sheet com detalhe e link para produto/benefício no catálogo.

## 7. Tab Auditoria

`audit_log` filtrado por `resource_kind='transaction' AND resource_id=$id`. Linha do tempo reversa:

- Usuário (ou sistema), ação (`create`/`update`/`refund`/`status_change`/...), ts, diff JSON (from→to).
- Também mostra efeitos de refund: `refund_effect_log` atrelado à transação.
- Filtros: ator, ação, período.

## 8. Tab Timeline

Subset da timeline do contato filtrado por `subject_kind='transaction' AND subject_id=$id` + tipos relacionados (`TE-SALE-*`, `TE-ENTITLEMENT-*`, `TE-SUBSCRIPTION-*`, `TE-INSTALLMENT-*`). Mesmo componente de timeline da tela de contato, com contexto restrito.

## 9. Wizard de Reembolso

Ao clicar "Solicitar reembolso":

```text
+------------------------------------------------------------------------------+
| MODAL: Solicitar reembolso — Transação #trx_8h2b                             |
+------------------------------------------------------------------------------+
| Valor: [ R$ 497,00 ] (total; parcial é Fase 2 — OQ-BR-REFUND-01 bloqueia)    |
| Motivo (obrigatório): [select]                                               |
|   ○ Arrependimento do cliente                                                |
|   ○ Erro de cobrança                                                         |
|   ○ Problema de acesso / produto                                             |
|   ○ Chargeback convertido em refund                                          |
|   ○ Outro (especifique)                                                      |
| Notas internas (opcional): [textarea]                                        |
|                                                                              |
| Efeitos previstos (preview):                                                 |
|  ✓ Revogar 2 direitos ativos                                                 |
|  ✓ Cancelar assinatura S1                                                    |
|  ✓ Reabrir oportunidade F1                                                   |
|  ✓ Cancelar NF-e (dentro do prazo 24h)                                       |
|  ✓ Reclassificar contato (customer → lead)                                   |
|                                                                              |
| [Cancelar]                              [Solicitar] (abre refund=requested)  |
+------------------------------------------------------------------------------+
```

Após "Solicitar" → `refund.status='requested'`. Aprovação é segunda etapa (segunda UI/modal) por papel autorizado com 2FA fresh. Aprovador vê o mesmo preview + aviso de atomicidade ("Qualquer falha na cascata abortará tudo — BR-REFUND").

## 10. Estados

| Estado | UX |
|---|---|
| transação pending | banner "Aguardando aprovação do provedor" |
| refused | banner com motivo do provedor |
| refund requested | banner warning com CTAs "Aprovar" / "Rejeitar" (RBAC) |
| refunded | badge + banner "Esta venda foi reembolsada em DD/MM por [usuário]" |
| chargeback | banner danger com link para investigação |
| snapshot ausente (bug) | erro 500 + link para suporte técnico |
| NF-e rejeitada | banner warning com erro + CTA reemitir |
| NF-e processando | indicador sutil "NF-e em emissão..." |

## 11. Performance

- RSC para header + tabs não ativas (prefetch).
- Snapshot JSON pode ser grande (>100kb) — lazy-load ao abrir tab.
- Timeline da tab usa mesma paginação cursor do detalhe de contato.

## 12. Acessibilidade

- Modal de refund trava foco (Radix Dialog); `Esc` cancela; `Enter` no primeiro CTA requer confirmação.
- Tabelas têm `<caption>` para SR.
- Cores de status acompanhadas de ícone + texto (nunca só cor).

## 13. Open Questions

- `OQ-TD-01` — Refund parcial UI aparece desabilitada ou oculta? Fase 1: desabilitada com tooltip explicativo (OQ-BR-REFUND-01).
- `OQ-TD-02` — Preview de efeitos pode ser caro (depende de queries múltiplas) — cachear por transação? Proposta: cache curto de 30s.
- `OQ-TD-03` — Ação "Reprocessar webhook de origem" precisa do `webhook_log.id` — quando a transação é antiga e foi criada manual, esconder botão.

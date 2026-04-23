# Tela: Dashboards (`/analytics/*`)

Painéis gerenciais. Fase 1 cobre 4 rotas fixas: vendas, inadimplência, funil e atendimento. Cada painel é denso, com filtros globais compartilhados (período e marca) + filtros específicos. Fonte de dados: views materializadas + queries agregadas em Postgres (Fase 2 migra para BigQuery export).

## 1. Shell comum

```text
+------------------------------------------------------------------------------+
| Breadcrumb: Dashboards > Vendas                                              |
+------------------------------------------------------------------------------+
| FILTROS GLOBAIS                                                              |
| [Período ▾ 1 abr — 30 abr] [Marca ▾ Todas] [Comparar com: período anterior]  |
| [Exportar CSV]                                                               |
+------------------------------------------------------------------------------+
|                                                                              |
|  [GRID DE CARDS + GRÁFICOS]                                                  |
|                                                                              |
+------------------------------------------------------------------------------+
```

Filtros globais persistidos por usuário em `user_preferences.analytics_filters`.

### 1.1. Anatomia do card de métrica

```text
+--------------------------------------+
| Vendas aprovadas                     |
|                                      |
| R$ 432.190                 ▲ 12,4%   |
| 287 transações                       |
|                                      |
| [sparkline com 30 pontos]            |
|                                      |
| [Ver detalhe →]                      |
+--------------------------------------+
```

- Título discreto em `text-sm muted`.
- Número grande (`text-3xl`, semibold).
- Variação vs período comparado (verde ▲ / vermelho ▼ / neutro).
- Subtítulo complementar (quantidade, unidade).
- Sparkline (gráfico linha minimalista) usando Recharts ou ECharts (Fase 1: Recharts — mais leve).
- Link "Ver detalhe" abre modal com breakdown ou rota específica.

### 1.2. Anatomia do bloco de gráfico

- Título + tooltip explicando a métrica.
- Legenda clicável (toggle séries).
- Controles de granularidade (diária / semanal / mensal).
- Estado loading: skeleton com altura do gráfico.
- Estado empty: ilustração + texto "Sem dados no período".
- Estado erro: toast + placeholder com retry.

## 2. `/analytics/vendas`

Foco em receita, volume e funil de checkout.

### 2.1. Cards de métrica (topo)

| Card | Métrica | Fonte |
|---|---|---|
| Receita total (aprovadas) | Σ `transaction.amount` onde `status='approved'` | view `vw_sales_daily` |
| Volume de vendas | count de aprovadas | idem |
| Ticket médio | receita / volume | calculado |
| Taxa de aprovação | aprovadas / (aprovadas + recusadas) | calculado |
| MRR | Σ assinaturas ativas mensalizadas | view `vw_subscription_mrr` |
| Recompra rate | contatos com ≥2 compras no período / total | calculado |

### 2.2. Gráficos

- **Série temporal de vendas** (linha) — R$ por dia, com sobreposição do período comparado.
- **Breakdown por marca** (barras horizontais) — R$ + %.
- **Breakdown por oferta** (tabela top 10 com barras inline).
- **Breakdown por condição comercial** (mostra advantage_score de cada uma e frequência de aplicação).
- **Breakdown por campanha / criativo** — UTMs agregados via `trackable_link` → `transaction.origin_link_id`.
- **Funil de checkout** (já captura GA4 + interno: view_item → begin_checkout → purchase).

### 2.3. Tabela detalhada

Tabela de vendas do período com filtros inline (mesma lista de `/transactions` embutida). Exportável.

## 3. `/analytics/inadimplencia`

Foco em assinaturas `past_due`, aging e dunning.

### 3.1. Cards

| Card | Métrica |
|---|---|
| Assinaturas past_due | count `subscription.status='past_due'` |
| Valor em aberto | Σ `installment.amount` com `status='overdue'` |
| Taxa de recuperação dunning | paid_after_overdue / overdue |
| Churn involuntário (dunning_exhausted) | count cancelled reason `dunning_exhausted` |
| Aging médio em atraso | média `now() - installment.due_at` em dias |

### 3.2. Gráficos

- **Aging buckets**: 1-3d / 4-7d / 8-15d / 16-30d / >30d — barras empilhadas.
- **Coorte de past_due → resolução** (D+3 / D+7 / D+15): taxa de recuperação por tentativa — linhas.
- **Por marca**: tabela com past_due count + valor + aging médio.

### 3.3. Tabela acionável

Lista de parcelas em atraso: contato, assinatura, valor, dias em atraso, tentativas, próximo retry, responsável. Ação inline: "Contatar" (abre inbox), "Abrir ticket categoria=financial".

## 4. `/analytics/funil`

Foco em conversão e tempo por estágio.

### 4.1. Cards

| Card | Métrica |
|---|---|
| Oportunidades abertas | count entries não won/lost |
| Conversão total | won / (won + lost) |
| Tempo médio do ciclo | média (won_at - entered_at) |
| Score médio | média `funnel_entry.score` |

### 4.2. Gráficos

- **Funil por estágio**: gráfico funil (largura proporcional à contagem). Clique abre lista.
- **Conversão por estágio** (de → para): matriz mostrando drop-off em cada transição.
- **Tempo médio por estágio**: barras horizontais com mediana + p90.
- **Distribuição de score**: histograma.
- **Por campanha / criativo**: tabela com entradas, conversão, receita por campanha.

### 4.3. Seletor de funil

Dropdown no topo — altera escopo. Default: todos os funis.

## 5. `/analytics/atendimento`

Foco em SLA, volume e produtividade do inbox/tickets.

### 5.1. Cards

| Card | Métrica |
|---|---|
| Tempo primeira resposta (mediana) | mediana (first_outbound - first_inbound) por conversa |
| SLA dentro do alvo | % conversas com primeira resposta ≤ 15 min (configurável) |
| Volume por canal | count inbound por `channel_kind` |
| Tickets abertos | count `status IN ('open','in_progress','waiting_reply')` |
| Tempo médio de resolução | média (resolved_at - opened_at) |
| CSAT | Fase 2 |

### 5.2. Gráficos

- **Heatmap de volume** (hora x dia da semana) — inbound messages.
- **Volume por canal** (barras).
- **SLA por marca / responsável** (barras horizontais).
- **Tickets por categoria** (pizza/donut — uso comedido de pizza).
- **Top atendentes**: tabela com conversas atendidas, tempo médio de resposta, tickets resolvidos.

## 6. Padrões comuns de interação

- Clicar em card → drill-down (modal ou nova rota com filtro aplicado).
- Hover em ponto de gráfico → tooltip com valor exato + comparação.
- Legend toggle → série oculta (persistida na sessão).
- Sincronia entre painéis: filtro global aplica a tudo imediatamente (revalidate).
- Export CSV respeita filtros aplicados.
- Intervalos pré-definidos de período: hoje, ontem, 7d, 30d, mês atual, mês anterior, trimestre, ano.

## 7. Performance

- Queries agregadas servidas por views materializadas refrescadas via cron Inngest (ex.: a cada 5 min em horário comercial).
- Cache server por (userId, filtros) com TTL 60s.
- Gráficos client-side renderizados com `react-chartjs-2` ou Recharts; evitar bibliotecas pesadas (ECharts em Fase 2 se necessário).
- Skeleton enquanto dados chegam; não bloquear com spinner full-screen.

## 8. RBAC

| Rota | Papéis |
|---|---|
| `/analytics/vendas` | admin, financeiro, comercial, marketing |
| `/analytics/inadimplencia` | admin, financeiro |
| `/analytics/funil` | admin, comercial, marketing |
| `/analytics/atendimento` | admin, suporte |

Cards e colunas com receita (valor R$) ocultos para papéis sem permissão de ver faturamento (matriz RBAC §2 do `00-product/03-personas-rbac-matrix.md`).

## 9. Estados

| Estado | UX |
|---|---|
| período sem dados | empty state por bloco + sugestão de ampliar filtro |
| carregando | skeleton por card/gráfico (não bloqueia o shell) |
| erro em query agregada | toast + card com erro isolado ("Falha ao carregar — retry") |
| filtros inválidos (from > to) | aviso inline + bloqueia aplicação |

## 10. Acessibilidade

- Cada gráfico tem alternativa tabular (botão "Ver como tabela" abre modal com dados).
- Cores categóricas com padrões distintos + rótulos (não dependência exclusiva de cor).
- Tooltips alcançáveis por teclado (foco no ponto ativo).

## 11. Open Questions

- `OQ-DB-01` — Views materializadas vs queries live em Fase 1 — qual cutoff de volume? Proposta: views para Σ agregadas, live para listas detalhadas.
- `OQ-DB-02` — Comparação com período custom (não só anterior) — Fase 1 já suporta? Proposta: só "período anterior" em Fase 1; custom em Fase 2.
- `OQ-DB-03` — Export CSV com linhas > 10k — gerar assíncrono via Inngest e enviar e-mail? Proposta: sim, com limite síncrono de 5k.
- `OQ-DB-04` — CSAT (atendimento) precisa template interativo WhatsApp ou pesquisa web? Fase 2.
- `OQ-DB-05` — Refresh das views materializadas: janela horária ou on-demand sob demand? Proposta: cron 5min + invalidação por webhook crítico (venda/refund).

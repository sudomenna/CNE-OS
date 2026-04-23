# Métricas de sucesso (Fase 1)

## 1. Métricas de produto

| Métrica | Meta Fase 1 | Fonte |
|---|---|---|
| % de contatos consolidados corretamente (sem duplicidade) | > 98% | query interna via `contact_merge` + `contact_issue` |
| Redução de divergência de dados entre ferramentas | qualitativa, zero incidentes em 30 dias | auditoria manual trimestral |
| Adoção do CRM interno pelas áreas (DAU/WAU) | > 80% dos operadores | auth logs |
| Volume de conversas atendidas via inbox central | 100% do canal WhatsApp oficial + Instagram + e-mail de suporte | `conversation` count |
| % de vendas atribuídas corretamente a funil/campanha/criativo | > 90% | join `transaction` × `funnel_entry` |

## 2. Métricas operacionais

| Métrica | Meta |
|---|---|
| Tempo médio de localização do contexto completo de um contato | < 10s |
| Redução de retrabalho entre comercial/suporte/financeiro | qualitativa, medida por pesquisa interna trimestral |
| Tempo médio de resolução de pendência de identidade | < 48h |
| Taxa de preenchimento de origem de entrada e conversão | > 85% |

## 3. Métricas de negócio

| Métrica | Meta |
|---|---|
| Redução de custo com ferramentas externas | -30% ao fim da Fase 1 |
| Visibilidade gerencial de funil/campanha/criativo | dashboard atualizado em < 5 min |
| Visibilidade de oportunidades por funil | real-time |

## 4. Métricas preparadas para Fase 2

CAC, LTV, ROAS, payback, retenção por coorte — estrutura de dados já permite, mas dashboards oficializam na Fase 2.

## 5. Métricas técnicas (NFR)

Ver [`../10-architecture/08-nfr.md`](../10-architecture/08-nfr.md) para SLA, RPO/RTO, latências p50/p95.

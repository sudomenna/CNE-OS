# 80 — Roadmap

Plano de execução em sprints. Cada sprint tem uma **tabela de tarefas** com `parallel-safe` e `depends-on` — unidade de paralelização de subagents.

| Sprint | Arquivo | Tema | Duração aprox. |
|---|---|---|---|
| Sprint 0 | `00-sprint-0-foundations.md` | Setup + núcleo organizacional | 2 semanas |
| Sprint 1-2 | `01-sprint-1-2-crm-core.md` | Contato, identidade, merge, timeline | 4 semanas |
| Sprint 3-4 | `02-sprint-3-4-inbox-tickets.md` | Inbox + Tickets | 4 semanas |
| Sprint 5 | `03-sprint-5-marketing-funnels.md` | Campanhas + Funis | 3 semanas |
| Sprint 6-7 | `04-sprint-6-7-offer-engine.md` | Catálogo + Motor comercial | 4 semanas |
| Sprint 8 | `05-sprint-8-snapshot-dg-integration.md` | Snapshot + Digital Guru + Entitlement + Reembolso | 3 semanas |
| Sprint 9 | `06-sprint-9-subscriptions.md` | Assinaturas + Parcelamento + Inadimplência | 3 semanas |
| Sprint 10 | `07-sprint-10-analytics.md` | Dashboards + materialized views | 2 semanas |
| Sprint 11 | `08-sprint-11-automations.md` | Automações visuais | 2 semanas |

Total estimado: ~27 semanas (6 meses).

## Critério de aceite global

Consolidado em `99-acceptance-criteria-by-sprint.md`.

## Protocolo de paralelização

Ver [`../90-meta/05-subagent-playbook.md`](../90-meta/05-subagent-playbook.md). Resumo:

1. Em cada sprint, tarefas com `parallel-safe: yes` e arquivos disjuntos são despacháveis em paralelo.
2. Tarefas que mudam `/30-contracts/*` são sempre seriais.
3. Dentro de um sprint, respeitar `depends-on`: onda N só abre após onda N-1 mergeada verde.

**Status:** stub em Pass 1. Conteúdo completo no Pass 3.

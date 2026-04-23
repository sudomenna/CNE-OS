# Documentação CNE-OS — Índice mestre

Documentação spec-driven do Sistema Operacional da CNE Educação, projetada para consumo por agentes codificadores. Cada arquivo é pequeno, coeso e referenciável por ID. Carregue só o que precisa.

## Mapa de navegação

| Pasta | Para quê | Quando abrir |
|---|---|---|
| [`00-product/`](./00-product/) | Visão, problema, personas, RBAC, métricas, glossário, escopo | Para entender **o que** é o produto |
| [`10-architecture/`](./10-architecture/) | Stack, data layer, realtime, auth, NFR, boundaries, testes | Antes de decidir **como** implementar |
| [`20-domain/`](./20-domain/) | Um arquivo por agregado (módulo) — contrato de implementação | Para **codar** um módulo |
| [`30-contracts/`](./30-contracts/) | Enums, DB conventions, timeline events, webhooks, module interfaces | Referência de **contratos fixos** |
| [`40-integrations/`](./40-integrations/) | Digital Guru, Brevo, WhatsApp, Notazz, Analytics | Antes de integrar provedor externo |
| [`50-business-rules/`](./50-business-rules/) | BR-IDs: identidade, merge, ofertas, snapshots, reembolso, RBAC... | Fonte canônica de regras de negócio |
| [`60-flows/`](./60-flows/) | Fluxos end-to-end (ingestão, venda, reembolso, renovação, webhook reprocess...) | Para testar comportamento E2E |
| [`70-ux/`](./70-ux/) | Design system, information architecture, wireframes, acessibilidade | Antes de construir tela |
| [`80-roadmap/`](./80-roadmap/) | Sprints com tarefas T-ID + `parallel-safe` + `depends-on` | Para planejar execução |
| [`90-meta/`](./90-meta/) | Convenções, registro de IDs, open questions, decision log, playbook de subagents | Governança da documentação |

## Como navegar por pergunta

- **"O que o produto faz?"** → [`00-product/01-brief.md`](./00-product/01-brief.md)
- **"Qual stack?"** → [`10-architecture/02-stack.md`](./10-architecture/02-stack.md)
- **"Como decidir qual condição comercial aplicar numa venda?"** → [`50-business-rules/BR-OFFER-DECISION.md`](./50-business-rules/BR-OFFER-DECISION.md)
- **"O que emitir na timeline quando X?"** → [`30-contracts/03-timeline-event-catalog.md`](./30-contracts/03-timeline-event-catalog.md)
- **"Quais enums existem?"** → [`30-contracts/01-enums.md`](./30-contracts/01-enums.md)
- **"Como implementar o módulo Oferta?"** → [`20-domain/10-offer-engine.md`](./20-domain/10-offer-engine.md) + BRs linkadas ali
- **"Em qual sprint está a tarefa X?"** → [`80-roadmap/README.md`](./80-roadmap/README.md)
- **"Está ambíguo. E agora?"** → abrir [`90-meta/03-open-questions-log.md`](./90-meta/03-open-questions-log.md) e escalar

## Protocolo de IDs

Todo artefato rastreável tem ID. Registro vivo em [`90-meta/02-id-registry.md`](./90-meta/02-id-registry.md).

| Prefixo | Significado | Exemplo |
|---|---|---|
| `BR-<DOMAIN>-<NUM>` | Business rule | `BR-IDENTITY-003` |
| `INV-<MODULE>-<NUM>` | Invariante de agregado | `INV-CONTACT-01` |
| `TE-<KIND>` | Tipo de evento de timeline | `TE-SALE-APPROVED` |
| `FLOW-<NUM>` | Fluxo end-to-end | `FLOW-05` |
| `T-<SPRINT>-<NUM>` | Tarefa de roadmap | `T-1-01` |
| `OQ-<NUM>` | Open question | `OQ-07` |
| `ADR-<NUM>` | Decisão arquitetural | `ADR-03` |
| `MOD-<NAME>` | Módulo | `MOD-OFFER` |

## Protocolo de paralelização (resumido)

Versão completa em [`90-meta/05-subagent-playbook.md`](./90-meta/05-subagent-playbook.md).

1. Unidade de paralelização = T-ID com `parallel-safe: yes`.
2. Arquivos editados por duas tarefas em paralelo devem ser **disjuntos**.
3. Mudanças em `30-contracts/*` são **sempre seriais**.
4. Agente que bate em ambiguidade **para e registra** em `90-meta/03-open-questions-log.md`.
5. Tarefa só conclui com `typecheck + test` verde.

## Estados da documentação

| Pass | Escopo | Status |
|---|---|---|
| Pass 1 | Esqueleto + contratos base + meta | ✅ completo |
| Pass 2 | Domínio + BRs + fluxos + contratos 04-07 | ✅ completo |
| Pass 3 | Arquitetura + integrações + UX + roadmap | ✅ completo |

Esta pasta é **auto-suficiente** para dirigir a implementação. O PRD original está arquivado em `90-meta/archive/` apenas como referência histórica.

## Próximos passos

1. Revisar [`90-meta/03-open-questions-log.md`](./90-meta/03-open-questions-log.md) e decidir as OQs bloqueantes para Sprint 0.
2. Abrir tarefa serial para formalizar OQs novas surgidas no Pass 3 (UX, integrações) no `02-id-registry.md`.
3. Iniciar **Sprint 0** ([`80-roadmap/00-sprint-0-foundations.md`](./80-roadmap/00-sprint-0-foundations.md)): 18 T-IDs em 7 ondas de paralelização.
4. Usar [`90-meta/05-subagent-playbook.md`](./90-meta/05-subagent-playbook.md) como protocolo de despacho.

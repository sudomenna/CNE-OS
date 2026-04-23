# Tela: Board de Funil (`/funnels/[id]`)

Kanban de oportunidades de um funil específico. Cada coluna é um estágio; cada card é um `funnel_entry`. Operador move cards entre estágios por drag-and-drop, emitindo `TE-FUNNEL-STAGE-CHANGED`.

Consome: `MOD-FUNNEL` (`listEntries`, `moveStage`, `markWon`, `markLost`, `updateScore`).

## 1. Wireframe

```text
+------------------------------------------------------------------------------+
| Breadcrumb: Funis > Pro 2026                                                 |
+------------------------------------------------------------------------------+
| HEADER                                                                       |
| Pro 2026   [Editar funil ▾]                                                  |
| Marca: CNE · Oferta vinculada: Trilha Pro                                    |
|                                                                              |
| [MÉTRICAS]                                                                   |
| Abertas: 128 · Conversão 30d: 12.4% · Meta mensal: R$ 45k / R$ 60k (75%)     |
+------------------------------------------------------------------------------+
| FILTROS: [Marca ▾] [Responsável ▾] [Tag ▾] [Campanha ▾] [Período ▾]          |
|          [Busca...]                                 [Board] [Lista]          |
+------------------------------------------------------------------------------+
| +-------------+ +-------------+ +-------------+ +-------------+ +----------+ |
| | NOVA (32)   | | QUALIF (24) | | CONTATO (18)| | PROP (10)   | | GANHO(44)| |
| |             | |             | |             | |             | |          | |
| | [card]      | | [card]      | | [card]      | | [card]      | | [card]   | |
| | [card]      | | [card]      | | [card]      | | [card]      | | [card]   | |
| | [card]      | | [card]      | | [card]      | | [card]      | | ...      | |
| | ...         | | ...         | | ...         | | ...         | |          | |
| |             | |             | |             | |             | |          | |
| | + nova      | |             | |             | |             | |          | |
| +-------------+ +-------------+ +-------------+ +-------------+ +----------+ |
+------------------------------------------------------------------------------+
```

Colunas horizontais scrolláveis. Cada coluna tem scroll vertical próprio. Altura = viewport - topbar - header.

## 2. Header

- Título = nome do funil (`h1`, `text-2xl`).
- Submenu rápido: editar funil, arquivar funil, duplicar, configurar estágios, scoring.
- Metadata: marca, oferta vinculada (quando existe), responsável padrão.

### 2.1. Métricas

Tira no topo com 4-5 números destacados:

| Métrica | Fonte |
|---|---|
| Oportunidades abertas | count `funnel_entry` com `label='open'/'negotiating'/'reopened'` |
| Conversão 30d | ganhos / (abertos + ganhos + perdidos) últimos 30 dias |
| Ticket médio | média `transaction.amount` das ganhas no período |
| Meta | `goal_month` configurada no funil vs realizado |
| Tempo médio por estágio | média `stage_duration_days` (calculado a partir do histórico) |

## 3. Filtros e busca

Controles em linha:

- **Marca** — multiselect (sincroniza com brand switcher quando aplicável).
- **Responsável** — minhas / sem atribuição / usuário específico / todos.
- **Tag** — multiselect das tags aplicadas aos contatos das entries.
- **Campanha** — multiselect de `entry_campaign_id`.
- **Criativo** — multiselect.
- **Período de entrada** — `from`/`to`.
- **Período de última atividade** — `from`/`to`.
- **Busca** — por nome/email/telefone do contato.

Toggle **Board / Lista**: modo lista vira tabela plana (colunas: contato, estágio, score, responsável, última atividade, valor estimado). Útil para triagem em massa.

## 4. Colunas (estágios)

Cada coluna renderiza:

- **Header**: nome do estágio, contagem, chip de cor do estágio, menu de ação (editar estágio, reordenar, arquivar).
- **Soma de valor estimado**: `Σ expected_amount` das entries visíveis.
- **Cards**: `funnel_entry` ordenadas por `updated_at DESC`. Scroll vertical próprio.
- **Zona de drop**: destaque quando card está sendo arrastado.

A última coluna lógica é "Ganho" (label `won`); há também opção "Perdido" colapsável à direita (mostra histórico compacto).

## 5. Card de oportunidade

```text
+----------------------------------------+
| [avatar]  Maria Silva         [score]  |
|           CNE · +55 11 9****-1234      |
|                                        |
| Oferta: Trilha Pro · R$ 497 (est.)     |
| Campanha: meta-abr · Criativo: v3      |
| Responsável: Ana · última ativ: 2h     |
| Tags: [aluno-vip] [+1]                 |
|                                        |
| [Ver contato]  [Abrir conversa]        |
+----------------------------------------+
```

- Avatar + nome + score (badge circular 0-100).
- Contato (telefone/email mascarado).
- Valor esperado + oferta vinculada.
- Campanha/criativo de entrada.
- Responsável + última atividade relativa.
- Tags truncadas.
- Clique no card → sheet lateral com detalhe + ações.
- Drag por qualquer área, exceto botões.

## 6. Interação de drag-and-drop

Biblioteca: `@dnd-kit/core`.

Fluxo:

1. Usuário inicia drag em card.
2. Outras colunas destacam como drop zones válidas.
3. Ao soltar em nova coluna → otimistic update (card aparece imediatamente no destino) + chamada Server Action `moveStage(entryId, toStageId, reason?)`.
4. Sucesso: persiste, emite `TE-FUNNEL-STAGE-CHANGED`. Toast discreto "Movido para {Estágio}".
5. Falha: reverte posição + toast destructive.
6. Se coluna destino é `won` → modal obrigatório pede `transaction_id` (vincula a venda existente) ou confirma abertura de venda manual. Chama `markWon`.
7. Se coluna destino é `lost` → modal obrigatório pede `reason`. Chama `markLost`.

Restrições:
- Estágios têm ordem configurável; drag para trás é permitido (reabre).
- Drag múltiplo (Fase 2).

## 7. Sheet lateral de detalhe (ao clicar card)

Aberto à direita (largura 480px). Conteúdo:

- Header: nome do contato + ações rápidas (abrir conversa, criar ticket, editar entry).
- **Tab Atividade**: timeline filtrada do contato (eventos relacionados ao funil).
- **Tab Notas**: notas específicas da oportunidade.
- **Tab Contato**: resumo de identidade.
- **Tab Detalhes**: campos do entry (responsável, valor estimado, data de entrada, campanha, criativo, tags da oportunidade, score breakdown).

Mudanças no sheet persistem via Server Actions; board atualiza.

## 8. Estados

| Estado | UX |
|---|---|
| funil sem entries | empty state com ilustração + CTA "Adicionar contato" + "Importar CSV" |
| coluna vazia | placeholder cinza "Nenhuma oportunidade neste estágio" |
| carregando | skeleton de 3 colunas com 3 cards skeleton cada |
| erro na movimentação | toast + revert + log |
| permissão negada (comercial tenta ganhar em marca sem acesso) | toast 403 + sem movimento |

## 9. Realtime

Subscribe em `funnel_entry` filtrado por `funnel_id`. Mudanças de terceiros (outro operador move um card) atualizam o board com leve animação. Conflito com drag local: prevalece a última Server Action comitada (otimistic replaced).

## 10. Atalhos de teclado

| Atalho | Ação |
|---|---|
| `j`/`k` | card próximo/anterior |
| `h`/`l` | coluna anterior/próxima |
| `Enter` | abre sheet |
| `m` | mover (abre combobox de estágios) |
| `w` | marca como ganho (confirmação) |
| `x` | marca como perdido (confirmação) |
| `/` | foca busca |

## 11. Performance

- Query inicial: RSC com até 200 entries por coluna (as mais ativas). Paginação "carregar mais" por coluna.
- Score é calculado assincronamente (Inngest); board lê valor cacheado em `funnel_entry.score`.
- Virtualização de cards por coluna quando > 100.

## 12. Open Questions

- `OQ-FB-01` — Quando mover para `won` sem venda associada, permitir criar venda manual inline ou sempre exigir `transaction_id` existente? Proposta Fase 1: exigir existente; criar venda manual em Fase 2.
- `OQ-FB-02` — Drag múltiplo (selecionar N cards e mover de uma vez)? Fase 2.
- `OQ-FB-03` — Board compartilhado com filtros salvos por usuário — onde persistir (`user_preferences.funnel_filters`)?
- `OQ-FB-04` — Automação: ao entrar em estágio X, disparar fluxo (mensagem, tarefa)? Configurável por estágio — Fase 2.

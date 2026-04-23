# Tela: Editor de Ofertas (`/offers/new`, `/offers/[id]`, `/offers/[id]/conditions/[cid]`)

Tela crítica do motor comercial. Operador constrói oferta com múltiplas condições, cada condição com regras de elegibilidade (árvore AND/OR de nós), itens (produto principal, bônus, order bump, upsell, complemento, benefício) e opções de pagamento. Preview simula qual condição seria aplicada dado um contexto.

Consome: `MOD-OFFER` (`createOffer`, `upsertCondition`, `evaluateEligibility`, `selectCondition`), `MOD-CATALOG`, `MOD-ORGANIZATION`.

Fluxo em 3 passos (Wizard / tabs de progresso), mas todos editáveis após salvar (sem modo "locked").

## 1. Shell

```text
+------------------------------------------------------------------------------+
| Breadcrumb: Ofertas > Trilha Pro                                             |
+------------------------------------------------------------------------------+
| HEADER                                                                       |
| Trilha Pro   [status: active ▾]                           [Preview] [...]    |
| Marca: CNE · CNPJ emissor: 12.345.678/0001-90 · tipo: regular                |
+------------------------------------------------------------------------------+
| STEPS: [ 1. Oferta ] ─── [ 2. Condições ] ─── [ 3. Preview & publicar ]      |
+------------------------------------------------------------------------------+
|                                                                              |
|  <conteúdo do passo atual>                                                   |
|                                                                              |
+------------------------------------------------------------------------------+
| Rodapé: [Cancelar]                                 [Salvar rascunho] [Avançar]|
+------------------------------------------------------------------------------+
```

## 2. Passo 1 — Oferta

Form simples com react-hook-form + zod.

Campos:

| Campo | Tipo | Observação |
|---|---|---|
| Nome | texto | obrigatório, único por marca |
| Slug | texto | auto-derivado, editável; valida único |
| Marca | select | obrigatório; preenche default do brand switcher |
| CNPJ emissor (`legal_entity`) | select | populado por `listLegalEntities(brandId)`; **carimba snapshot** — BR-SNAPSHOT-IMMUTABILITY |
| Tipo | radio | `regular` / `renewal` (se renewal, abre seletor de oferta originária) |
| Oferta originária | select (condicional) | obrigatório se `renewal`; cruza com BR-RENEWAL |
| Status | select | `draft` / `active` / `paused` / `archived` |
| Descrição interna | textarea | visível só para operadores |
| External refs | key-value | mapeamento por provedor (ex.: `digital_guru: prod_123`) |
| Billing kind | radio | `one_time` / `subscription` (se subscription, configura periodicidade) |
| Periodicidade | select | condicional: `monthly`/`quarterly`/`yearly` |

Validação inline. Salvar → cria rascunho (`status='draft'`) e habilita passo 2.

## 3. Passo 2 — Condições

Tela dividida em duas zonas:

```text
+-----------------------+-----------------------------------------------------+
| LISTA DE CONDIÇÕES    |  DETALHE DA CONDIÇÃO SELECIONADA                    |
|                       |                                                     |
| [+ Nova condição]     |  Nome: [_________]   Prioridade: [10]               |
|                       |  Advantage score: [75]     [x] Default              |
| ━━━━━━━━━━━━━━━━      |  [x] Visível publicamente                           |
|                       |  Status: active ▾                                   |
| • Condição A          |                                                     |
|   prio 10 · score 75  |  [Regras de elegibilidade]                          |
|   DEFAULT             |  +------------------------------------+            |
|                       |  | AND                                |            |
| • Condição B          |  |  ├─ date_range: 01/04..30/04/2026  |            |
|   prio 20 · score 60  |  |  ├─ OR                             |            |
|                       |  |  │   ├─ campaign = meta-abr        |            |
| • Condição C          |  |  │   └─ channel = whatsapp         |            |
|   prio 30 · score 90  |  |  └─ sales_count_reached < 500      |            |
|   paused              |  |                                    |            |
|                       |  |  [+ regra]  [+ grupo]              |            |
| (drag para reordenar) |  +------------------------------------+            |
|                       |                                                     |
|                       |  [Itens da condição]                                |
|                       |  Principal: Curso "Trilha Pro" · R$ 497             |
|                       |  Bônus: Ebook "Guia inicial"                        |
|                       |  Order bump: Mentoria 30min (+R$ 97)                |
|                       |  Upsell: Trilha Avançada (após compra)              |
|                       |  Benefício: Grupo VIP (tag: aluno-vip)              |
|                       |  [+ item ▾]                                         |
|                       |                                                     |
|                       |  [Opções de pagamento]                              |
|                       |  [x] PIX           [_____] desconto %               |
|                       |  [x] Cartão crédito · até 12x                       |
|                       |  [x] Boleto                                         |
|                       |  [ ] Custom...                                      |
|                       |                                                     |
|                       |  [Duplicar] [Arquivar]    [Salvar condição]         |
+-----------------------+-----------------------------------------------------+
```

### 3.1. Lista de condições

- Ordenada por `priority` (numérico) manual; drag para reordenar (ajusta `priority`).
- Cada item mostra: nome, prioridade, advantage score, badge de status, flag "default" e flag "paused" se aplicável.
- Botão `+ Nova condição` cria rascunho selecionado já em edição.

### 3.2. Cabeçalho da condição

- Nome (único na oferta).
- Prioridade numérica (0-999).
- `advantage_score` (0-100) — critério de desempate da BR-OFFER-DECISION.
- Flag `default` (apenas UMA condição por oferta pode ser default; enforcement: PUT rejeita outra).
- Flag `publicly_visible` (se a condição aparece em páginas públicas ou só via URL/API).
- Status da condição (`draft`/`active`/`paused`/`archived`).

### 3.3. Editor visual de regras

Árvore de nós. Nó raiz é um `group` com operador (`AND` / `OR`). Cada grupo aceita filhos: outros grupos (aninhados) ou regras atômicas.

Tipos de regra atômica (`offer_rule_kind`):

| Kind | UI |
|---|---|
| `date_range` | dois `date-picker`s (from/to); inclusive por default |
| `sales_count_reached` | operador (`<`, `≤`, `>`, `≥`, `=`) + número |
| `campaign` | multiselect de campanhas ativas |
| `channel` | multiselect de `offer_decision_channel` |
| `creative` | multiselect de criativos da campanha (cascata) |
| `internal_use` | boolean (marca "só vendedor interno") |

Componentes:
- Cabeçalho de grupo: toggle `AND`/`OR`, botão deletar grupo.
- Regra atômica: ícone do kind + form inline + botão deletar.
- Botões `+ regra` / `+ grupo` ao final de cada grupo.
- Drag-and-drop para reordenar / mover entre grupos.

Validação em tempo real: árvore sem folhas é inválida; regras com campos obrigatórios vazios destacadas em vermelho. Preview de "esta regra aceita contexto X" ao hover.

### 3.4. Itens da condição

Lista de `offer_condition_item`. Cada item tem `kind` (`main`/`bonus`/`upsell`/`order_bump`/`complement`/`commercial_benefit`), ref ao produto ou benefício do catálogo, `unit_price` override (quando aplicável), e metadata:

| Kind | UI especial |
|---|---|
| `main` | obrigatório 1 e apenas 1 por condição |
| `bonus` | múltiplos permitidos; preço 0 |
| `order_bump` | preço adicional; aparece no checkout como opt-in |
| `upsell` | preço pós-compra; configura URL/template de pitch |
| `complement` | valor somado ao total |
| `commercial_benefit` | ref a `commercial_benefit` do catálogo; configura `auto_tag` herdada |

Seletor de item abre dropdown com busca contra `MOD-CATALOG.listProducts` ou `listBenefits`.

### 3.5. Opções de pagamento

Checkboxes por `offer_payment_method`:

- `pix` — campo de desconto percentual opcional.
- `credit_card` — até N parcelas (select), taxa de juros (percentual) opcional.
- `installments` — plano fixo (ex.: 3x sem juros).
- `boleto` — prazo de vencimento.
- `custom` — editor livre (texto + metadata; usado apenas em canais internos).

Reordenar por drag (define ordem de exibição no checkout).

## 4. Passo 3 — Preview & publicar

Simulador lado-a-lado.

```text
+--------------------------------+---------------------------------+
| CONTEXTO DE SIMULAÇÃO          |  RESULTADO                      |
|                                |                                 |
| Data/hora: [2026-04-15 10:00]  |  Condição selecionada:          |
| Marca: CNE                     |  "Condição A"                   |
| Canal: whatsapp ▾              |                                 |
| Campanha: meta-abr ▾           |  Motivo: campaign_match         |
| Criativo: v3 ▾                 |  Score: 85                      |
| Contato: [seletor opcional]    |  Desempates aplicados:          |
| Uso interno: [ ]               |   · advantage_score             |
|                                |   · priority                    |
| [Simular]                      |                                 |
|                                |  Itens:                         |
|                                |  · Trilha Pro - R$ 497          |
|                                |  · Bônus Guia inicial           |
|                                |                                 |
|                                |  Pagamento: PIX (-10%), cartão  |
|                                |  até 12x                        |
|                                |                                 |
|                                |  [Ver trace completo]           |
+--------------------------------+---------------------------------+
[Publicar oferta]  (status draft → active)
```

Chama `selectCondition(offerId, ctx)` — mesma função usada em FLOW-04/FLOW-05. Retorna `DecisionResult` com `reason`, `score`, `tiebreakers`.

`Ver trace completo` abre modal com cada condição avaliada: elegível? motivos; score efetivo; tiebreaker aplicado. Transparência total do motor.

Botão **Publicar** só fica habilitado se a oferta tem ao menos 1 condição ativa com default. Publica muda `offer.status='active'`.

## 5. Estados e validações

| Situação | UX |
|---|---|
| Oferta rascunho sem condições | banner "Adicione ao menos 1 condição antes de publicar" |
| Múltiplas condições marcadas default | Server Action rejeita; UI mostra erro inline |
| Regra com campo obrigatório vazio | borda vermelha + helper text |
| Árvore vazia (grupo raiz sem filhos) | bloqueia salvar condição |
| Item `main` ausente | bloqueia salvar condição |
| Conflito de datas (condição A e B cobrem mesma janela + mesmo score) | aviso não-bloqueante "Possível empate com 'Condição X' — configure desempate" |
| Preview retorna `conflict` (decisão empatada) | resultado em warning + instruções |
| Preview retorna `fallback` | info neutra |
| Oferta archived | campos readonly; banner no topo |

## 6. Performance

- Form salva incremental (debounce 500ms) em rascunho; publicar é ação explícita.
- Preview chama Server Action — cache por (contexto hash).
- Catálogo carregado uma vez e cacheado no cliente por sessão.

## 7. RBAC

| Ação | Papéis |
|---|---|
| Criar oferta | admin, comercial |
| Editar oferta | admin, comercial |
| Criar/editar condição | admin, marketing, comercial |
| Publicar | admin, comercial |
| Arquivar | admin |
| Preview | todos |

## 8. Acessibilidade

- Wizard tem stepper com `aria-current="step"`.
- Árvore de regras: navegável por teclado (setas + Enter expande/fecha; Del remove nó selecionado).
- Drag-and-drop tem alternativa por teclado ("mover para cima/baixo").
- Labels sempre associadas; erros em `aria-describedby`.

## 9. Open Questions

- `OQ-OB-01` — Versionamento de oferta (histórico de mudanças visível) — Fase 2 ou usar trilha de auditoria?
- `OQ-OB-02` — Preview com contato real gera risco de vazar dado — sanitizar sempre? Proposta: sim, mascarar CPF/telefone no trace.
- `OQ-OB-03` — `offer_rule_kind` custom pelo admin (extensibilidade) — Fase 2.
- `OQ-OB-04` — Duplicar oferta inteira (deep clone) — Fase 1 útil? Proposta: sim.
- `OQ-OB-05` — Salvar regras inválidas como `draft` é permitido; publicação exige válido — confirmar UX do CTA desabilitado vs erro inline.

# Arquitetura de Informação

Como a navegação, rotas e entradas do sistema são organizadas. Objetivo: operador encontra qualquer coisa em ≤ 3 cliques ou via command palette (`cmd+K`) em 1.

## 1. Shell de aplicação

Layout em duas regiões fixas: **sidebar** (esquerda, colapsável) + **topbar** (topo, sticky). Corpo rola. Rodapé implícito.

```text
+----------------------------------------------------------+
| Topbar: [logo] [brand-switcher] [search]  [ntf] [avatar] |  <- sticky, z-30
+----+-----------------------------------------------------+
|    | Breadcrumb                                           |
| S  |                                                      |
| i  | <conteúdo da rota>                                   |
| d  |                                                      |
| e  |                                                      |
| b  |                                                      |
| a  |                                                      |
| r  |                                                      |
+----+-----------------------------------------------------+
```

## 2. Sidebar

Lista vertical. Cada item: ícone + label + badge opcional. Colapsa para só-ícone em `md:`. Ordem fixa:

| Item | Rota | Badge | Papéis |
|---|---|---|---|
| Contatos | `/contacts` | — | todos |
| Inbox | `/inbox` | unread count | todos |
| Funis | `/funnels` | — | admin, marketing, comercial |
| Ofertas | `/offers` | — | admin, comercial, marketing |
| Transações | `/transactions` | — | admin, financeiro, comercial |
| Dashboards | `/analytics` | — | admin, financeiro, comercial, marketing |
| Settings | `/settings` | — | admin (outros papéis veem subset) |

Separador visual entre **operacional** (Contatos, Inbox, Funis, Ofertas, Transações) e **analítico/configuração** (Dashboards, Settings).

## 3. Topbar

Componentes da esquerda para direita:

1. **Logo CNE** — clica → `/` (dashboard default).
2. **Brand switcher** (dropdown) — lista marcas visíveis ao usuário. Default: "Todas as marcas" (Fase 1). Seleção filtra escopo global em todas as rotas que suportam `?brandId=`.
3. **Busca global** (`Input` com ícone de lupa + atalho `cmd+K`) — abre command palette.
4. **Notificações** (`popover`) — lista das 20 mais recentes; badge de não lidas.
5. **Avatar do usuário** (`dropdown-menu`) — perfil, preferências, 2FA, tema (light/dark/system), logout.

## 4. Command palette (`cmd+K` / `ctrl+K`)

Componente: shadcn `command`. Atalho global. Seções:

1. **Navegar** — "Ir para Contatos", "Ir para Inbox", "Abrir funil <nome>", "Abrir oferta <nome>".
2. **Buscar** — por nome/CPF/telefone/email de contato; por ID de transação; por número de NF; por external_event_id de webhook.
3. **Criar** — "Novo contato", "Nova oferta", "Nova campanha", "Nova condição", "Abrir ticket", "Solicitar reembolso".
4. **Ações rápidas** — "Reprocessar webhook...", "Ver DLQ", "Ir para minhas atribuições" (inbox + tickets do usuário).

Cada entrada tem ícone e atalho secundário (ex.: `g c` para "ir para contatos"). Palette respeita RBAC — opções indisponíveis não aparecem.

## 5. Breadcrumbs

Toda página autenticada (exceto dashboards) renderiza breadcrumb abaixo da topbar. Padrão: `Raiz > Seção > Subseção > Item`.

- `/contacts` → `Contatos`
- `/contacts/{id}` → `Contatos > {Nome do contato}`
- `/inbox/{conversationId}` → `Inbox > {Nome} via {canal}`
- `/funnels/{id}` → `Funis > {Nome do funil}`
- `/offers/{id}` → `Ofertas > {Nome da oferta}`
- `/transactions/{id}` → `Transações > {externalRef ou ID curto}`

Último segmento é texto (não link). Segmentos intermediários são links.

## 6. Rotas (App Router)

```text
/                                 -> redirect para /analytics (ou /inbox se perfil suporte)
/(auth)/
  /login
  /login/2fa
  /recover
  /recover/confirm
/(app)/
  /contacts
  /contacts/[id]                  # tabs: timeline, conversas, tickets, oportunidades, transações, direitos, notas, histórico
  /contacts/[id]/merge            # wizard
  /inbox                          # 3 colunas (conversas | conversa | contato)
  /inbox/[conversationId]
  /funnels
  /funnels/[id]                   # board kanban
  /offers
  /offers/new                     # builder 3 passos
  /offers/[id]
  /offers/[id]/conditions/[cid]   # editor de condição (passo 2)
  /transactions
  /transactions/[id]              # tabs: itens, snapshot, parcelas, direitos, auditoria, timeline
  /analytics
  /analytics/vendas
  /analytics/inadimplencia
  /analytics/funil
  /analytics/atendimento
  /settings
  /settings/account               # perfil, 2FA
  /settings/brands                # cadastro de marcas (admin)
  /settings/users                 # usuários internos (admin)
  /settings/integrations          # env vars mascaradas, status de cada provedor
  /settings/integrations/webhooks # DLQ + reprocesso (FLOW-12)
  /settings/catalog               # produtos, benefícios
  /settings/funnels               # configuração de funis e estágios
  /settings/automations
  /settings/audit                 # trilha de auditoria
```

## 7. Padrões de listagem

Todas as listagens (contatos, transações, ofertas, tickets) compartilham shell:

```text
[Título + CTA primário]
[Filtros em linha horizontal: marca, período, status, busca]
[Tabela densa com seleção múltipla + colunas redimensionáveis]
[Paginação cursor-based no rodapé]
```

Colunas configuráveis por usuário (persistidas em `user_preferences`). Estado vazio com CTA para criar. Loading = skeleton de linhas.

## 8. Padrão de detalhe

Páginas de detalhe (`/contacts/[id]`, `/transactions/[id]`, `/offers/[id]`, `/funnels/[id]`) usam shell:

```text
[Breadcrumb]
[Header: título + badges de status + ações (dropdown)]
[Metadata inline: chips/pills de atributos-chave]
[Tabs: conteúdo segmentado]
  [Tab content rola independente]
```

## 9. Estados globais

| Estado | UX |
|---|---|
| Offline (navigator.onLine false) | banner no topo: "Sem conexão. Alterações serão sincronizadas ao reconectar." |
| Sessão expirada | dialog obrigatório pedindo reautenticação, mantém rota |
| Permissão negada | `403` inline com explicação e link para suporte |
| Rota não encontrada | `404` com CTA para voltar ao shell |

## 10. Responsividade

- Foco: desktop (1280+). Operadores usam monitores amplos.
- Tablet (768-1279): sidebar colapsa automaticamente; inbox vira 2 colunas com sheet para contato.
- Mobile (< 768): **não suportado na Fase 1** para área autenticada; apenas rotas `/auth/*` funcionam. Landing públicas (checkout embedado) são responsivas em projeto separado.

## 11. Open Questions

- `OQ-IA-01` — Raiz `/` redireciona para Inbox (suporte) ou Dashboards (admin/financeiro/comercial) conforme papel? Proposta: sim, por papel.
- `OQ-IA-02` — Brand switcher por marca única exigido para algumas ações (ex.: criar oferta — precisa marca)? Proposta: bloquear com modal pedindo marca.
- `OQ-IA-03` — Command palette busca em timeline de contato (eventos específicos) ou só registros? Fase 1: só registros; Fase 2: full-text em timeline.

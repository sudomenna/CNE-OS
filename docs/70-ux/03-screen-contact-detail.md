# Tela: Detalhe do Contato (`/contacts/[id]`)

Visão única do contato: identidade, tags, marcas, histórico unificado (timeline), atendimento, oportunidades, compras, direitos, notas. Fonte primária para qualquer operador entender contexto antes de agir.

Consome: `MOD-CONTACT.getContact`, `MOD-TIMELINE.listTimelineEvents`, `MOD-INBOX`, `MOD-TICKET`, `MOD-FUNNEL`, `MOD-TRANSACTION`, `MOD-ENTITLEMENT`.

## 1. Wireframe

```text
+------------------------------------------------------------------------------+
| Breadcrumb: Contatos > Maria Silva                                           |
+------------------------------------------------------------------------------+
| HEADER                                                                       |
| +--------+  Maria Silva                             [Editar] [Merge] [...]   |
| | AVATAR|  [classification: customer]  [CNE] [Marca B]                       |
| | MS     |  CPF 123.***.789-10 · +55 11 9****-1234 · maria@exemplo.com       |
| +--------+  Tags: [aluno-ativo] [vip] [+]                                    |
+------------------------------------------------------------------------------+
| TABS: [Timeline] [Conversas] [Tickets] [Oportunidades] [Transações]          |
|        [Direitos] [Notas] [Histórico]                                        |
+------------------------------------------------------------------------------+
| [Filtros da tab]: [Marca ▾] [Tipo ▾] [Período ▾] [Busca...]                  |
+------------------------------------------------------------------------------+
|  (09 abr 2026 · 14:32)  [icon venda]  Venda aprovada · R$ 497,00             |
|                          Oferta "Trilha Pro" · Digital Guru · #trx_8h2       |
|                          MOD-TRANSACTION · source: digital_guru              |
|--------------------------------------------------------------------------    |
|  (09 abr 2026 · 14:30)  [icon msg]     Mensagem recebida · WhatsApp · CNE    |
|                          "Olá, finalizei o pagamento, tudo certo?"           |
|--------------------------------------------------------------------------    |
|  (08 abr 2026 · 09:12)  [icon funnel]  Entrou no funil "Pro 2026"            |
|                          estágio: Qualificação · campanha: meta-abr          |
|--------------------------------------------------------------------------    |
|  [ carregar mais ▾ ]                                                         |
+------------------------------------------------------------------------------+
```

## 2. Header

### 2.1. Informações fixas

- Avatar (iniciais se sem foto). Badge de canal do último contato no canto inferior do avatar.
- Nome completo (h1, `text-2xl`, semibold).
- Badge de `contact.classification` (cor por valor: `lead` neutro, `customer` success, `student` success, `mentorado` accent, `blocked` danger).
- Chips de marcas às quais o contato está vinculado (via `contact_brand_link`).
- Linha de identificação: CPF mascarado, telefone(s) primário, email(s) primário. Cada um com botão-ícone de copiar.
- Tags aplicáveis (via `contact_tag`). Botão `+` para aplicar; `x` no hover para remover (confirmação).

### 2.2. Ações (menu `...`)

Disponibilidade respeita RBAC:

| Ação | Papéis | Efeito |
|---|---|---|
| Editar | admin, financeiro, suporte, comercial | abre sheet de edição |
| Merge | admin, financeiro, marketing, suporte, comercial | abre wizard `/contacts/[id]/merge` |
| Desfazer merge | admin, financeiro | lista merges recentes do contato |
| Blacklist | admin | confirmação + motivo; emite `TE-CONTACT-BLACKLISTED` |
| Impersonar (área de aluno) | admin, financeiro, suporte, comercial | abre sessão espelhada (BR-RBAC / OQ-RBAC-01) |
| Abrir ticket | todos | pré-preenche contato, abre `/tickets/new` |
| Nova mensagem | todos | abre compositor do inbox |
| Copiar ID do contato | todos | clipboard |

## 3. Tabs

### 3.1. Timeline (default)

Fonte: `listTimelineEvents(contactId, filters)`. Paginação por cursor (`occurred_at DESC, id DESC`).

- **Filtros**: marca, tipo (`kind`), canal (`whatsapp/instagram/email/site/api/internal`), intervalo de data, busca textual no payload.
- **Item**: ícone por `kind` (mapa visual definido), título curto, descrição de 1-2 linhas, timestamp relativo + absoluto (tooltip), origem (`source` = `MOD-*`), ator (usuário ou sistema), chip de marca.
- **Densidade**: linha de até 2 linhas; clique abre `<details>` com payload JSON completo (só admin/financeiro por padrão).
- **Infinite scroll**: `scroll-area` + sentinela; `react-query` `useInfiniteQuery`.
- **Realtime**: Supabase Realtime subscribe em `timeline_event` filtrado por `contact_id`; novo evento prepende com animação sutil (120ms).
- **Agrupamento**: por dia, com separador sticky (label `Hoje`, `Ontem`, ou `DD mmm YYYY`).

Ícones por grupo de `kind`:

| Grupo | Ícone (lucide) |
|---|---|
| contato (created/updated/classification) | `user` |
| merge | `merge` |
| mensagem | `message-circle` |
| conversa | `inbox` |
| ticket | `life-buoy` |
| funil | `git-branch` |
| venda | `credit-card` |
| refund | `rotate-ccw` |
| direito | `key` |
| assinatura | `repeat` |
| integração | `plug` |
| automação | `zap` |
| webhook reprocess | `refresh-cw` |

### 3.2. Conversas

Lista de `conversation` do contato. Colunas: canal, última mensagem (preview), responsável, status, `updated_at`. Clique abre no inbox em nova aba ou painel lateral.

### 3.3. Tickets

Lista de `ticket`. Colunas: ID curto, título, categoria, prioridade (badge colorido), status (badge), responsável, aberto em, último update. CTA `Abrir ticket`.

### 3.4. Oportunidades

Lista de `funnel_entry`. Colunas: funil, estágio atual, label (`open`/`won`/`lost`/...), score, campanha de entrada, criativo, data de entrada. CTA `Adicionar ao funil`.

### 3.5. Transações

Lista de `transaction`. Colunas: ID curto, oferta, condição, amount, status, provedor externo, `approved_at`. Clique → `/transactions/[id]`.

### 3.6. Direitos (entitlements)

Lista de `customer_entitlement` ativa + histórico. Mostra kind (produto/benefício), nome do ref, `ends_at`, `status`, origem (transaction).

### 3.7. Notas

Notas internas (não são timeline). Permitem markdown básico e @menções de usuários internos. CRUD simples. Não sincronizam com cliente.

### 3.8. Histórico

Trilha de auditoria filtrada por `resource_kind='contact' AND resource_id=contactId`. Mostra quem mudou o quê e quando.

## 4. Estados

| Estado | UX |
|---|---|
| loading inicial | skeleton de header (2 linhas) + skeleton de 5 linhas de timeline |
| timeline vazia | ilustração sutil + texto "Nenhum evento ainda" + CTA "Criar ticket" / "Enviar mensagem" |
| erro ao carregar | toast destructive + botão retry; conteúdo anterior preservado se houver |
| contato não encontrado (404) | empty state + CTA "Voltar para contatos" |
| contato blacklisted | banner warning no topo: "Este contato está bloqueado desde DD/MM (motivo: ...)" — ações de envio desabilitadas |
| contato com issues abertas | banner com badge de contagem + link para tab Histórico / modal de issues |

## 5. Performance

- Header carrega em server component (RSC) com 1 query agregada.
- Timeline paginada 50/pg; primeiro paint usa RSC com primeira página.
- Realtime subscription só para `kind`s relevantes (filtro server-side na subscription) para evitar payload grande.
- Prefetch de conversas/tickets na navegação entre tabs (hover no tab).

## 6. Acessibilidade

- Header tem `<header role="banner">` aninhado no `<main>`.
- Tabs com `role="tablist"` (Radix Tabs). Navegável por setas ←/→.
- Cada item de timeline tem `<article>` com `aria-labelledby` apontando para título + `<time>` semântico.
- Badges de status têm `aria-label` textual ("Status: aprovado"), pois cor sozinha não basta.
- Detalhes por tecla: `Enter` abre expansor; `Esc` recolhe.

## 7. Open Questions

- `OQ-CD-01` — Tab default configurável por papel? (suporte abre em Conversas; financeiro em Transações). Proposta: sim, preferência persistida.
- `OQ-CD-02` — Mostrar payload JSON cru na timeline para não-admin? Proposta: apenas admin/financeiro; outros veem descrição humanizada.
- `OQ-CD-03` — Como exibir contatos merged (secundários) — redirect automático para principal ou banner explicando? Proposta: redirect + banner "Este contato foi mesclado em [Principal]".

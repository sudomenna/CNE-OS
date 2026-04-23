# Tela: Inbox (`/inbox`, `/inbox/[conversationId]`)

Central de atendimento omnichannel. Agrupa conversas de WhatsApp, Instagram e e-mail por contato e marca. Três colunas em desktop.

Consome: `MOD-INBOX`, `MOD-CONTACT`, `MOD-TICKET`, `MOD-INTEGRATION` (envio outbound).

## 1. Wireframe

```text
+------------------------------------------------------------------------------+
| Topbar                                                                       |
+------------------------------------------------------------------------------+
|  CONVERSAS (lista)      |  CONVERSA ABERTA                |  PAINEL CONTATO  |
|  [Filtros ▾] [busca]    |  [header da conversa]           |  [identidade]    |
|  [tabs: Todas/Minhas/   |                                 |  [tags, marcas]  |
|   Não atribuídas]       |  [mensagens: scroll invertido]  |  [última compra] |
|                         |                                 |                  |
| +---------------------+ | +-----------------------------+ | +--------------+ |
| | Maria Silva · CNE   | | | [inbound] "Oi, tudo bem?"   | | | [atalhos]    | |
| | WA · Ana atendendo  | | |                             | | | Ver contato  | |
| | "Finalizei o pg..." | | | [outbound] "Oi Maria..."    | | | Abrir ticket | |
| | · 2m · badge 1      | | |                             | | | Ver timeline | |
| +---------------------+ | | [inbound] "Obrigada!"       | | +--------------+ |
| | João · Marca B      | | |                             | |                  |
| | IG · sem atribuição | | +-----------------------------+ | [últimas trx]    |
| | "Qual a próxima..." | |                                 | [tickets abertos]|
| | · 14m               | | +-----------------------------+ |                  |
| +---------------------+ | | [Compositor]                | |                  |
| ...                     | | [texto ▾ template/notas/📎] | |                  |
|                         | | [btn Enviar (enter)]        | |                  |
|                         | +-----------------------------+ |                  |
+------------------------------------------------------------------------------+
```

Layout: `resizable` com 3 painéis. Proporções default 24% / 52% / 24%. Estado persistido em `user_preferences`.

## 2. Coluna 1 — Lista de conversas

### 2.1. Filtros

Barra em linha com popovers:

- **Canal**: all / whatsapp / instagram / email.
- **Responsável**: minhas / sem atribuição / usuário específico / todas.
- **Marca**: todas / marca específica (sincroniza com brand switcher do topbar).
- **Status**: open / waiting_customer / waiting_team / closed.
- **Tempo sem resposta**: qualquer / >1h / >4h / >24h.
- **Tag**: multi-select de tags de contato.

### 2.2. Abas rápidas

- `Todas` — todas as conversas `status != closed` (escopo respeitando filtros).
- `Minhas` — atribuídas ao usuário.
- `Não atribuídas` — sem `assignee_user_id`.
- `Mencionadas` — notas internas mencionando o usuário (Fase 2).

### 2.3. Card de conversa (linha)

```text
+------------------------------------------+
| [avatar]  Maria Silva           [canal]  |
|           CNE · Ana atribuída            |
|           "Oi, tudo bem?"  [timer]       |
|                                   [b 2]  |
+------------------------------------------+
```

- Avatar do contato + ícone do canal no canto.
- Nome + marca + responsável.
- Preview da última mensagem (1 linha, ellipsis).
- Timestamp relativo ("2m", "3h", "ontem").
- Badge numérica de mensagens não lidas (quando `direction='inbound'` desde `last_read_at`).
- Selecionado → destaque com `bg-muted` + borda primary.

### 2.4. Realtime

Subscribe em `conversation` + `message` filtrado por marcas visíveis. Nova mensagem em conversa já aberta em outra aba → badge "Nova mensagem" no card + snack "Nova mensagem de {Nome}" se janela não está focada (ver `09-interaction-patterns.md`).

## 3. Coluna 2 — Conversa aberta

### 3.1. Header

```text
[avatar] Maria Silva · WhatsApp · CNE        [status ▾] [atribuir ▾] [...]
último inbound: 2m atrás · janela 24h: 22h restantes
```

- Badge de `conversation_status` com dropdown de mudança (`open` ↔ `waiting_team` ↔ `waiting_customer` ↔ `closed`).
- Dropdown de atribuição de responsável.
- Menu `...`: abrir ticket, ver contato, marcar como lida, arquivar.
- Sub-header info: tempo desde último inbound, janela de 24h do WhatsApp (contador visual quando ≤ 2h — amarelo).

### 3.2. Fluxo de mensagens

- Lista scrollável invertida (novas embaixo, auto-scroll quando focado no fim).
- Agrupamento por dia (separator sticky).
- **Bolha inbound** (esquerda): fundo `--muted`, arredondamento direito.
- **Bolha outbound** (direita): fundo `--primary` esmaecido, arredondamento esquerdo.
- **Nota interna**: fundo `--accent` 10% + borda tracejada + ícone cadeado, só visível para operadores.
- Por tipo:
  - texto: body com preservação de quebras.
  - imagem: thumb com lightbox on click.
  - áudio: player com waveform (usa `<audio>` + visual simples).
  - vídeo: thumb + play inline.
  - documento: nome + tamanho + botão download.
  - localização: mini-mapa estático + endereço.
  - reação: inline sob a mensagem referenciada, emoji + autor.
  - reply: trecho citado acima com destaque.
- Indicadores de status outbound: `sent` (✓), `delivered` (✓✓), `read` (✓✓ colorido), `failed` (✕ vermelho + tooltip com erro).
- Metadados discretos no hover: timestamp absoluto, ID externo, ator (quando outbound).

### 3.3. Compositor

Barra inferior sticky com tabs verticais à esquerda e textarea ocupando largura:

- **Tab `Mensagem`**: textarea de texto livre. Dentro da janela de 24h (WhatsApp), envia direto. Fora da janela, fica desabilitado com hint.
- **Tab `Template`** (WhatsApp, e-mail transacional): dropdown de templates aprovados, form de variáveis, preview antes do envio.
- **Tab `Nota interna`**: textarea com indicador visível "Nota interna — não será enviada"; fundo amarelado.
- Botão `📎` anexar (imagem, doc, áudio gravado inline).
- Botão `Enviar` (enter envia; shift+enter quebra linha). Atalho `c` foca compositor.
- Contador de caracteres (WhatsApp: 4096).

Ações auxiliares: inserir link rastreável (abre seletor de campanha + gera URL), usar resposta rápida (atalhos salvos por usuário).

## 4. Coluna 3 — Painel do contato

Resumo denso sem navegação. Campos:

- Identidade (nome, CPF mascarado, telefones, emails).
- Tags.
- Classificação + marcas.
- Última compra (oferta, valor, status).
- Direitos ativos (badge por produto).
- Tickets abertos (link).
- Score do funil + estágio atual.
- Atalhos: "Ver contato completo", "Abrir ticket", "Ver timeline", "Ver compras".

Layout em grupos colapsáveis. Persistência do colapsado por usuário.

## 5. Estados

| Estado | UX |
|---|---|
| sem conversas na lista | empty state com "Nenhuma conversa com os filtros" + CTA para limpar filtros |
| nenhuma selecionada | panel central com ilustração e texto "Selecione uma conversa" |
| conversa fechada | compositor desabilitado com CTA "Reabrir conversa" |
| fora da janela 24h (WA) | compositor de texto desabilitado; tab `Template` em destaque com hint |
| envio em progresso | bolha outbound aparece com spinner → check ao `sent` |
| envio falhou | bolha com ✕ vermelho e botão `Reenviar`; tooltip com motivo |
| loading | skeleton nas 3 colunas (~5 linhas cada) |
| contato blacklisted | banner vermelho na conversa + envio bloqueado |

## 6. Atalhos de teclado

| Atalho | Ação |
|---|---|
| `j` / `k` | próxima / anterior conversa na lista |
| `Enter` | abrir conversa selecionada |
| `c` | focar compositor |
| `r` | marcar como lida |
| `a` | atribuir responsável (abre dropdown) |
| `t` | abrir ticket |
| `Esc` | sair do compositor |
| `g i` | ir para inbox (global) |

## 7. Performance

- Lista de conversas: `useInfiniteQuery` 50/pg.
- Mensagens: last 50, virtualizadas com `@tanstack/react-virtual` se > 200.
- Painel de contato: RSC + prefetch ao hover no card.
- Anexos: upload direto ao Supabase Storage com URL assinada; UI mostra progresso.

## 8. Open Questions

- `OQ-IX-01` — Transcrição automática de áudio (Whisper API) exibida inline — Fase 2?
- `OQ-IX-02` — Atribuição automática round-robin / por carga quando mensagem chega sem responsável — Fase 2.
- `OQ-IX-03` — CSAT inline (template interativo WhatsApp) — Fase 2 (ver OQ-WA-03 equivalente).
- `OQ-IX-04` — Notas internas suportam menção (@usuário) e geram notificação — confirmar escopo Fase 1.

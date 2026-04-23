# Padrões de Interação

Convenções transversais de formulário, estados (loading/empty/error/success), realtime, notificações, atalhos, toasts e escolha modal vs sheet. Toda tela do CNE-OS deve seguir este documento. Referência canônica antes de inventar padrão novo.

## 1. Formulários

Stack: `react-hook-form` + `zod` (via `@hookform/resolvers/zod`). Componentes: `shadcn/form` (baseado em Radix Label + Slot).

### 1.1. Estrutura canônica

```tsx
const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido').optional(),
});
type FormValues = z.infer<typeof schema>;

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { name: '' },
  mode: 'onBlur',           // valida ao sair do campo
});
```

- **Validação**: `mode='onBlur'` por default; `onChange` apenas para campos com feedback em tempo real (ex.: disponibilidade de slug).
- **Envio**: Server Action via `form.handleSubmit(async (data) => { await serverAction(data); })`.
- **Erros de servidor**: mapeados para `form.setError(field, { message })` quando o Server Action retorna erro estruturado `{ fieldErrors: { name: '...' } }`.

### 1.2. Feedback visual

| Situação | UX |
|---|---|
| Campo válido | borda default; sem realce |
| Campo inválido (touched) | borda `--destructive`; ícone de erro; mensagem em `<FormMessage>` abaixo |
| Campo exigido | indicador `*` discreto após label |
| Envio em progresso | botão de submit com `disabled` + spinner inline + texto "Salvando..." |
| Sucesso | toast success + revalidate de rota; reset de form quando apropriado |
| Falha de servidor | toast destructive + preserve do form (não limpar) |

### 1.3. Layout denso

- Inputs `text-sm`, altura 36px (`h-9`).
- Labels acima do input, `text-sm font-medium`.
- Helper text abaixo, `text-xs muted`.
- Agrupamento vertical com `space-y-3` dentro de seção; `space-y-6` entre seções.
- Forms em grid 2-col em desktop para telas densas (Ofertas, Settings).

### 1.4. Campos especiais

- **Máscaras**: CPF, CNPJ, telefone — `react-input-mask` ou máscara custom; valor persistido em canônico (apenas dígitos).
- **Date/time picker**: shadcn `calendar` + popover; default em locale `pt-BR`, timezone da sessão.
- **Combobox**: busca async com debounce 200ms contra Server Action; mostra loading.
- **File upload**: drag-and-drop area; upload direto ao Supabase Storage com URL assinada; progress bar.

## 2. Estados de conteúdo

Toda tela que consome dados expõe os 4 estados: **loading, empty, error, success**. Nenhum componente pula estado.

### 2.1. Loading

- **Skeleton preferido** sobre spinners. Formato aproxima o conteúdo final (linhas, cards, gráficos).
- **Spinner** apenas para ações curtas (< 1s típico), inline em botões, ícones de refresh.
- **Suspense boundaries** em RSC para streaming progressivo.

### 2.2. Empty

- Ilustração sutil (ícone grande em `muted`, não imagem pesada).
- Título breve ("Nenhuma conversa ainda").
- Descrição de 1 linha explicando por que.
- CTA primário para ação recomendada (ex.: "Iniciar nova conversa").

### 2.3. Error

- Toast destructive + manter conteúdo anterior se houver (não "branquear" a tela).
- Em falha de carregamento primário: card de erro centralizado com ícone, mensagem humanizada, botão "Tentar novamente", link "Copiar detalhes" (abre popover com stack para debug interno).
- Erros 403 renderizam inline com explicação RBAC + link para contato.
- Erros 404 usam rota `not-found.tsx` do App Router.

### 2.4. Success

- Toast success (auto-dismiss 5s).
- Ações que modificam dados → `router.refresh()` ou `revalidatePath` no Server Action.
- Animações de entrada de novos registros: fade-in 200ms.

## 3. Realtime

Canal: Supabase Realtime (Postgres CDC).

### 3.1. Subscrições

- Cada tela que exibe dado mutável subscreve à tabela relevante, filtrando por chave (ex.: `timeline_event` por `contact_id`; `message` por `conversation_id`; `funnel_entry` por `funnel_id`).
- Cleanup no unmount.
- Reconexão automática; ao reconectar, revalidar página (refetch) para cobrir eventos perdidos.

### 3.2. UX ao receber evento

| Cenário | UX |
|---|---|
| Evento em recurso atualmente visível | merge otimista na lista + animação sutil |
| Evento em recurso em outra tab (mesma app) | badge "Novo" na nav; ao focar, revalidate |
| Evento quando janela não focada | snack no canto inferior esquerdo "Nova mensagem de {X}" + badge no título da aba (`(1) Inbox — CNE`) |
| Conflito otimista (local pendente vs novo servidor) | prevalece último Server Action commitado; UI reverte se divergir |

### 3.3. Notificação desktop (Web Notifications API)

- Permissão solicitada no onboarding do usuário (primeira sessão), após aceite explícito em toggle nas preferências.
- Disparos:
  - conversa atribuída ao usuário corrente;
  - ticket urgente aberto;
  - webhook em DLQ (só `admin`);
  - refund pendente aguardando aprovação (`admin`/`financeiro`).
- Clique na notificação → foca aba + navega para recurso.
- Respeita `Notification.permission === 'granted'`. Em `default` ou `denied`, cai para notificação in-app apenas.

## 4. Atalhos de teclado (globais)

| Atalho | Ação | Escopo |
|---|---|---|
| `cmd+K` / `ctrl+K` | abrir command palette | global |
| `n` | novo (contextual — novo contato, nova oferta, etc.) | tela de lista |
| `/` | focar busca | tela de lista |
| `c` | compor mensagem | inbox |
| `g c` | ir para Contatos | global (chord) |
| `g i` | ir para Inbox | global |
| `g f` | ir para Funis | global |
| `g o` | ir para Ofertas | global |
| `g t` | ir para Transações | global |
| `g a` | ir para Dashboards | global |
| `?` | mostrar ajuda de atalhos (modal) | global |
| `Esc` | fechar modal/sheet/popover ativo | global |
| `Enter` em linha de lista | abrir detalhe | listas |

Implementação via `react-hotkeys-hook` ou hook custom escutando em `document`. Respeita foco em inputs (atalhos de navegação ignorados quando textarea/input está focado, exceto `Esc` e `cmd+K`).

## 5. Toasts

Lib: `sonner` (padrão shadcn).

- **Posição**: canto inferior direito em desktop.
- **Duração**:
  - `success`: 5s auto-dismiss.
  - `info`: 5s.
  - `warning`: 7s.
  - `destructive`/`error`: sticky (fecha só por clique).
- **Ação opcional**: botão inline ("Desfazer", "Ver detalhes", "Tentar de novo"). "Desfazer" disponível 8s em ações reversíveis.
- **Stack** máximo 3 visíveis; excedentes ficam em fila.
- **Mensagens**: curtas (< 80 chars), imperativas, sem ponto final.

## 6. Modais vs Sheets vs Drawers vs Inline

Regra de seleção:

| Situação | Componente |
|---|---|
| Confirmação simples (2 botões, < 2 frases) | `Dialog` pequeno (`sm:max-w-md`) |
| Criação rápida (form ≤ 5 campos) | `Dialog` médio (`sm:max-w-lg`) |
| Detalhe complexo sem perder contexto da lista (ex.: ver oportunidade do kanban) | `Sheet` lateral (480px) |
| Wizard multi-step | `Dialog` grande OU rota dedicada se > 3 passos (preferir rota) |
| Preview secundário (ex.: snapshot JSON) | `Drawer` inferior em desktop (evitar) OU modal lg |
| Ação irreversível (delete, refund aprovar) | `AlertDialog` com confirmação textual explícita |
| Edição inline rápida (tag, tag-like) | popover/inline editor |

Nenhum modal deve abrir outro modal (evitar empilhamento; se necessário, usar rota).

## 7. Confirmações críticas

Ações irreversíveis (ex.: aprovar refund, arquivar oferta, blacklist de contato) usam `AlertDialog` com:

- Título claro ("Aprovar reembolso?").
- Descrição de efeitos ("Isso cancelará 2 direitos, 1 assinatura e reabrirá a oportunidade. BR-REFUND é atômica.").
- Campo de confirmação textual quando o ato é muito crítico (digite `CONFIRMAR`).
- Botão destructive para ação; botão secundário para cancelar.

## 8. Impersonação

Quando usuário impersona cliente/aluno:

- Banner sticky vermelho no topo: "Você está impersonando **Maria Silva** · [sair]".
- Todas ações disparam `audit_log` com `action_kind='impersonate'`.
- Ações críticas (refund, blacklist) ficam bloqueadas em modo impersonação (BR-RBAC).

## 9. Internacionalização

Fase 1: apenas `pt-BR`. Strings em `/messages/pt-BR.json` (lib: `next-intl`). Formatação de data/hora em `pt-BR`, timezone = preferência do usuário (`America/Sao_Paulo` default). Moeda `BRL` com `Intl.NumberFormat`.

## 10. Formulários longos — autosave

Telas com forms extensos (offer builder, condição) usam autosave em rascunho com debounce 500ms. Indicador discreto no canto: "Salvando..." / "Salvo há Ns". Em falha, mantém alteração local + retry; depois de 3 falhas seguidas, mostra toast de aviso.

## 11. Revalidação

- Server Actions que mutam devem chamar `revalidatePath` das rotas afetadas.
- Operações críticas (refund) revalidam múltiplas rotas (contato, transação, assinatura, funil).
- Preferir revalidate sobre refetch manual no cliente.

## 12. Open Questions

- `OQ-IP-01` — Notificações desktop para eventos de terceiros (outra marca) — Fase 2? Proposta: apenas marcas que o usuário curou.
- `OQ-IP-02` — Autosave em oferta publicada deve bloquear até pub revisada? Proposta: autosave sempre em `draft` paralelo; publicação é ato explícito.
- `OQ-IP-03` — `Esc` em wizard multi-step pede confirmação se houver mudanças pendentes? Proposta: sim, `AlertDialog`.
- `OQ-IP-04` — Internacionalização futura (EN) — abstração de strings já adotada em Fase 1? Proposta: sim, via `next-intl`, mesmo com 1 idioma.

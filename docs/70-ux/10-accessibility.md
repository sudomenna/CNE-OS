# Acessibilidade

Contrato mínimo: **WCAG 2.1 AA** em toda área autenticada e rotas públicas. Nenhuma tela vai para produção sem cobrir os pontos abaixo. Radix (base dos componentes shadcn) já resolve boa parte dos aspectos de ARIA e foco; este documento define o que fica de responsabilidade explícita do time.

## 1. Princípios

1. **Teclado primeiro.** Qualquer ação possível por mouse tem equivalente por teclado.
2. **Foco visível sempre.** Nunca remover `outline` sem substituir por ring claro.
3. **Semântica antes de `aria-*`.** Usar o elemento HTML certo; `role`/`aria-*` só para o que HTML não cobre.
4. **Cor não é informação.** Status, erros e séries de gráfico combinam cor + ícone/texto/padrão.
5. **Movimento respeitoso.** Animações não essenciais param com `prefers-reduced-motion: reduce`.

## 2. Navegação por teclado

### 2.1. Ordem de foco

- DOM order = ordem visual. Evitar `tabindex > 0`; usar `tabindex="0"` só em elementos customizados (cards clicáveis, items de command palette).
- Shell global: `skip link` "Pular para conteúdo principal" como primeiro elemento tabulável (visível ao receber foco), aponta para `#main`.
- Landmarks: cada rota renderiza `<header>` (topbar), `<nav>` (sidebar), `<main id="main">` (conteúdo), `<aside>` (painéis laterais). Permite navegação por landmarks em screen readers.

### 2.2. Controles interativos

- Botões são `<button type="button">` (nunca `<div onClick>`).
- Links são `<a href>` com `href` real quando possível.
- Forms têm `<label htmlFor>` associado a `<input id>` — sem `placeholder` como substituto de label.
- Combos/selects customizados (Radix) já herdam teclado correto; não reimplementar.

### 2.3. Atalhos globais

Ver `09-interaction-patterns.md §4`. Documentação visível em `?` (modal de ajuda). Respeitar foco em inputs.

## 3. Foco visível

- `:focus-visible` habilitado globalmente com ring `ring-2 ring-offset-2 ring-ring`.
- Nunca `outline: none` sem substituto equivalente.
- Foco dentro de modal fica **contido** (Radix Dialog já traps). Ao fechar, foco retorna ao elemento que abriu.
- Skeletons e áreas em loading não recebem foco (tabindex=-1 em skeletons).

## 4. Contraste

- Texto normal: contraste ≥ **4.5:1** contra o fundo.
- Texto grande (≥ 18pt ou ≥ 14pt bold): ≥ 3:1.
- Elementos UI e bordas significativas (input border ativa, ícones informativos): ≥ 3:1.
- Light e dark mode testados separadamente.
- Validação automatizada: `axe-core` em CI + `@storybook/addon-a11y`.

Cores de status no design system (`01-design-system-tokens.md`) foram calibradas para AA. Placeholders (`muted-foreground`) têm 4.5:1 mínimo.

## 5. Formulários acessíveis

- Cada `<input>` associado a `<label>` (`for`/`id` ou label aninhado).
- Mensagens de erro em `<p id="field-error">` referenciadas via `aria-describedby="field-error"`.
- Campo inválido marcado com `aria-invalid="true"`.
- Grupos de campos (radio, checkbox) dentro de `<fieldset>` + `<legend>`.
- Campo obrigatório tem `aria-required="true"` + asterisco visual.
- Mensagens globais (toast de erro) são anunciadas via `role="status"` (info) ou `role="alert"` (error).

## 6. Tabelas

- `<table>` com `<caption>` descritivo (oculto visualmente com `sr-only` quando redundante).
- `<th scope="col">` / `<th scope="row">` apropriados.
- Colunas ordenáveis: `aria-sort="ascending|descending|none"` no `<th>`.
- Checkbox de seleção de linha: `aria-label="Selecionar linha de {nome}"`.
- Paginação com `aria-label="Paginação"`.

## 7. Tabs e acordeons

Radix já provê `role="tablist"`, `role="tab"`, `role="tabpanel"` corretos. Validar em cada uso:

- Tabs navegáveis por setas ← →.
- `Home`/`End` saltam para primeira/última.
- Tab panel recebe foco ao ativar tab via click/keyboard.

## 8. Modais, sheets, drawers

Radix `Dialog`/`Sheet` cuidam de:

- `role="dialog"` + `aria-modal="true"`.
- Foco trapado dentro.
- Foco retorna ao trigger ao fechar.
- `Esc` fecha.

Nosso dever:

- Título do modal associado via `aria-labelledby`.
- Descrição (subtítulo) via `aria-describedby` quando há.

`AlertDialog` (ações destrutivas) usa `role="alertdialog"` — não é cancelável por click fora.

## 9. Timeline e conteúdo dinâmico

- Itens de timeline marcados com `<article>` com `aria-labelledby` + `<time datetime="ISO">` semântico.
- Realtime: novos itens inseridos em região com `aria-live="polite"` quando relevante ao usuário (ex.: nova mensagem no inbox com a conversa aberta).
- Badges de "não lido" têm `aria-label="3 não lidas"`.

## 10. Gráficos e dashboards

- Cada gráfico tem uma alternativa tabular (botão "Ver como tabela" abre modal com dados brutos).
- Tooltips de ponto de gráfico alcançáveis por `Tab` (foco nos pontos) + `Enter`/`Esc`.
- Eixos têm labels textuais; unidades explicitadas.
- Séries de dados distinguidas por cor + padrão (dashed/dotted) + símbolo no ponto (círculo/quadrado/triângulo).
- Exportação CSV sempre disponível como fallback.

## 11. Inbox e canais

- Mensagens com `<article role="listitem">` dentro de `<ul role="list">`.
- Direção (`inbound`/`outbound`) anunciada ("Mensagem recebida de Maria", "Mensagem enviada").
- Anexos: `<img alt>` descritivo (fallback para tipo quando sem caption); audio/video com controles nativos e `<track>` quando transcrição disponível (Fase 2).
- Status de entrega comunicado textualmente (`aria-label="Entregue"`, `"Lida às 14:32"`).

## 12. Movimento e animação

- `prefers-reduced-motion: reduce` → `transition-duration: 0ms` + remoção de animações decorativas (fade-ins, slides longos).
- Elementos de loading (skeletons) mantêm animação pulsátil em versão suave (ok para usuários sensíveis a movimento por default).
- Evitar paralaxe ou autoplay de vídeo/gif.

## 13. Screen readers — fluxos críticos testados

Testes manuais obrigatórios no VoiceOver (macOS/iOS) e NVDA (Windows) para:

1. **Login + 2FA** — todos os campos labelados; mensagens de erro anunciadas.
2. **Abrir conversa no inbox** — navegar lista, abrir, compor, enviar.
3. **Aprovar reembolso** — ler aviso de atomicidade, confirmar.
4. **Mover card no kanban** — alternativa por teclado ("mover para cima/baixo/coluna Y").
5. **Acessar timeline de contato** — anunciar agrupamento por dia + conteúdo do evento.

Testes documentados em `tests/a11y/manual-checklist.md` (a criar por time de QA).

## 14. Automação em CI

- `eslint-plugin-jsx-a11y` obrigatório.
- `axe-core` integrado no Playwright E2E dos fluxos críticos.
- Storybook com `addon-a11y` para cada componente de domínio (inspeção local).
- Lighthouse CI em rotas públicas com target a11y score ≥ 95.

## 15. LGPD + a11y

- Banner de consentimento acessível por teclado, legível por screen reader, com foco inicial no CTA "Aceitar".
- Preferências de cookie gerenciáveis em `/settings/privacy` (Fase 2).

## 16. Checklist por tela

Cada PR que cria tela nova preenche checklist em `.github/pull_request_template.md`:

- [ ] Landmarks (`header`, `nav`, `main`, `aside` quando aplicável).
- [ ] Skip link funcional.
- [ ] Foco visível em todos os controles.
- [ ] Labels + `aria-describedby` em formulários.
- [ ] Contraste AA em light e dark.
- [ ] Teclado: todos os fluxos cobertos.
- [ ] `axe` sem violations.
- [ ] Testado com VoiceOver/NVDA nos fluxos críticos da tela.
- [ ] `prefers-reduced-motion` respeitado.

## 17. Open Questions

- `OQ-A11Y-01` — Meta de WCAG AAA para fluxos de pagamento e refund? Proposta: Fase 2 sobe parte para AAA.
- `OQ-A11Y-02` — Tradução `aria-label` em locale — manter em `pt-BR.json` (next-intl) desde Fase 1? Proposta: sim.
- `OQ-A11Y-03` — Componente de árvore de regras da oferta (drag-and-drop) tem alternativa por teclado via ações explícitas — testar com screen reader real antes de publicar Fase 1.
- `OQ-A11Y-04` — Gráficos Recharts têm suporte a11y limitado — avaliar Visx/ECharts com `aria-` configurável ou manter alternativa tabular como fallback único.

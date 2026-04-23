# Design System — Tokens

Base do sistema visual. Tom pretendido: **moderno, denso, profissional**. Fundação técnica: shadcn/ui + Tailwind + Radix. Suporte a `light` e `dark` via CSS variables. Tokens ficam em `app/globals.css` (diretiva `@theme`) e espelhados em `tailwind.config.ts`.

## 1. Cores

Valores em `oklch` (padrão shadcn). Cores primárias da CNE são placeholders institucionais — ajustar ao receber guia oficial de marca.

### 1.1. Semântica

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | fundo da viewport |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | texto principal |
| `--card` | `oklch(1 0 0)` | `oklch(0.18 0 0)` | superfícies elevadas |
| `--card-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | texto sobre card |
| `--popover` | `oklch(1 0 0)` | `oklch(0.2 0 0)` | dropdown/popover |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.22 0 0)` | superfície passiva |
| `--muted-foreground` | `oklch(0.50 0 0)` | `oklch(0.70 0 0)` | texto secundário |
| `--border` | `oklch(0.92 0 0)` | `oklch(0.28 0 0)` | bordas |
| `--input` | `oklch(0.92 0 0)` | `oklch(0.28 0 0)` | borda de input |
| `--ring` | `var(--primary)` | `var(--primary)` | outline de foco |

### 1.2. Paleta de marca (placeholder)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--primary` | `oklch(0.52 0.19 256)` (azul CNE) | `oklch(0.65 0.19 256)` | CTA principal, links, realce |
| `--primary-foreground` | `oklch(0.99 0 0)` | `oklch(0.12 0 0)` | texto sobre primary |
| `--secondary` | `oklch(0.96 0.02 256)` | `oklch(0.28 0.02 256)` | CTA secundário |
| `--secondary-foreground` | `oklch(0.20 0 0)` | `oklch(0.95 0 0)` | — |
| `--accent` | `oklch(0.72 0.17 190)` (teal) | `oklch(0.72 0.17 190)` | destaque informativo |

### 1.3. Semântica de status

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--success` | `oklch(0.62 0.16 150)` | `oklch(0.72 0.16 150)` | aprovado, pago, ativo |
| `--warning` | `oklch(0.75 0.15 80)` | `oklch(0.80 0.15 80)` | past_due, atenção |
| `--danger` (`--destructive`) | `oklch(0.58 0.22 27)` | `oklch(0.68 0.22 27)` | refund, falha, chargeback |
| `--info` | `oklch(0.62 0.17 240)` | `oklch(0.72 0.17 240)` | neutro informativo |

Foregrounds correspondentes (`--success-foreground`, etc.) sempre contrastam ≥ 4.5:1 com seu fundo.

## 2. Tipografia

- Famílias: `Inter` (UI sans) e `JetBrains Mono` (código, IDs, IDs de webhook). Ambas via `next/font/google`.
- Escala modular 1.25 (major third). Line-height proporcional.

| Token | rem | px | line-height | Uso |
|---|---|---|---|---|
| `--text-xs` | 0.75 | 12 | 1.3 | chips, captions |
| `--text-sm` | 0.875 | 14 | 1.4 | body denso, tabelas |
| `--text-base` | 1 | 16 | 1.5 | body padrão |
| `--text-lg` | 1.25 | 20 | 1.4 | subtítulos de card |
| `--text-xl` | 1.5625 | 25 | 1.3 | títulos de sessão |
| `--text-2xl` | 2 | 32 | 1.2 | títulos de página |
| `--text-3xl` | 2.5 | 40 | 1.15 | heros / métricas principais |

Pesos: 400 regular, 500 medium, 600 semibold, 700 bold. Densidade preferida: `text-sm` em listas e formulários.

## 3. Espaçamento

Base 4px. Escala canônica:

| Token | rem | px |
|---|---|---|
| `--space-0` | 0 | 0 |
| `--space-1` | 0.25 | 4 |
| `--space-2` | 0.5 | 8 |
| `--space-3` | 0.75 | 12 |
| `--space-4` | 1 | 16 |
| `--space-6` | 1.5 | 24 |
| `--space-8` | 2 | 32 |
| `--space-12` | 3 | 48 |
| `--space-16` | 4 | 64 |
| `--space-24` | 6 | 96 |

Densidade preferida: `p-2`/`p-3` em tabelas e linhas; `p-4` em cards; `p-6` em contêineres de página.

## 4. Radii

| Token | px |
|---|---|
| `--radius-sm` | 4 |
| `--radius-md` | 6 |
| `--radius-lg` | 10 |
| `--radius-xl` | 14 |
| `--radius-full` | 9999 |

Default de inputs e botões: `--radius-md`. Cards: `--radius-lg`. Avatars e badges circulares: `--radius-full`.

## 5. Sombras (elevação)

Camadas progressivas com múltiplos box-shadows (realismo).

| Token | Valor (light) |
|---|---|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.04)` |
| `--shadow-md` | `0 2px 4px -1px rgb(0 0 0 / 0.06), 0 4px 6px -2px rgb(0 0 0 / 0.03)` |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)` |
| `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.04)` |

No dark mode, sombras usam alpha maior (`0.4` a `0.6`) e cor neutra escura.

## 6. Motion

- Duração curta: `120ms`, `ease-out` (hover, toggle).
- Duração média: `200ms`, `cubic-bezier(0.2, 0, 0, 1)` (sheet, dialog open).
- Duração longa: `300ms` (transições de rota).
- `prefers-reduced-motion: reduce` → duração `0ms` para todas as transições não-essenciais.

## 7. Z-index

| Camada | z-index |
|---|---|
| base | 0 |
| sticky (topbar) | 30 |
| dropdown | 40 |
| popover | 50 |
| sheet/drawer | 60 |
| dialog | 70 |
| toast | 80 |
| tooltip | 90 |

## 8. Exportação dos tokens

```text
app/globals.css
  @theme {
    --color-primary: oklch(0.52 0.19 256);
    --color-background: oklch(1 0 0);
    --font-sans: "Inter", ui-sans-serif, system-ui, ...;
    --font-mono: "JetBrains Mono", ui-monospace, ...;
    --radius-md: 6px;
    ...
  }
  .dark { --color-background: oklch(0.145 0 0); ... }
```

Tailwind consome via utilitários `bg-primary`, `text-muted-foreground`, `rounded-md`, `shadow-lg`, etc. Nunca hardcodar hex ou oklch em componente; sempre via token.

## 9. Componentes shadcn a instalar

Executar `pnpm dlx shadcn@latest add <nome>` para cada:

- `button`, `input`, `textarea`, `select`, `checkbox`, `switch`, `radio-group`
- `dialog`, `sheet`, `drawer`, `popover`, `tooltip`, `dropdown-menu`
- `command` (palette), `tabs`, `scroll-area`, `separator`, `skeleton`
- `table`, `badge`, `avatar`, `label`, `form` (react-hook-form + zod)
- `toast` (sonner), `hover-card`, `accordion`, `progress`
- `calendar`, `date-picker` (composto)
- `resizable` (para painéis do inbox)

Não editar arquivos em `/components/ui/` manualmente após gerados exceto para consertar bug; atualizações vêm do CLI.

## 10. Dark mode

Estratégia `class` (classe `dark` no `<html>`). Toggle via `next-themes`. Default: `system`. Persistência em cookie para SSR sem flash.

## 11. Open Questions

- `OQ-DS-01` — Cores primárias oficiais da CNE — aguardando guia de marca; placeholders em azul 256.
- `OQ-DS-02` — Densidade: oferecer modo "confortável" além de "denso" (toggle de user preference)? Fase 2.
- `OQ-DS-03` — Tokens de gráfico (séries temporais de dashboards) — paleta categórica dedicada com contraste AA? Proposta: sim, 8 cores fixas.

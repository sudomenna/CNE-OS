# 12 — Customização de colunas em tabelas

Preferências de visibilidade de coluna são persistidas em `localStorage` por
(usuário × tabela), conforme **ADR-19**. Este documento define o padrão que
aplicações reutilizáveis devem seguir para permitir que operadores de diferentes
funções (financeiro, suporte, marketing) vejam apenas as colunas relevantes.

## 1. Quando usar customizador de colunas

Aplique `<ColumnsCustomizer>` em:

- Tabelas de listagem principal (≥ 5 colunas): `/contacts`, `/offers`,
  `/transactions`, `/automations`, `/funnels`, `/campaigns`, etc.
- Tabelas dentro de tabs de detalhe (ex.: `/contacts/[id]` tab
  Oportunidades/Tickets).
- Tabelas de settings (`/settings/users`, `/settings/webhooks`, etc.).

**Não aplique em:**

- Tabelas com ≤ 2 colunas (fixas, sem poluição visual).
- Tabelas embed em popover/drawer (espaço limitado).
- Tabelas onde a coluna é obrigatória por compliance ou auditoria.

## 2. API pública

### 2.1. Componente `<ColumnsCustomizer>`

Localização: `components/ui/columns-customizer.tsx`

```tsx
<ColumnsCustomizer
  tableId="contacts:list"
  userId={session.userId}
  columns={[
    { id: "name", label: "Nome", alwaysVisible: true },
    { id: "email", label: "E-mail", defaultVisible: true },
    { id: "cpf", label: "CPF", defaultVisible: false },
    { id: "createdAt", label: "Criado em", defaultVisible: false },
  ]}
/>
```

**Props:**

| Prop | Tipo | Descrição |
|---|---|---|
| `tableId` | `string` | Identificador canônico da tabela (ver §3). |
| `userId` | `string` | ID do usuário (para namespace no localStorage). |
| `columns` | `ColumnDef[]` | Definição das colunas. |
| `visibleColumnIds?` | `Set<string>` | (controlado) Colunas visíveis. Se omitido, hook é instanciado internamente. |
| `onToggle?` | `(columnId: string) => void` | (controlado) Callback ao toggle. |
| `onReset?` | `() => void` | (controlado) Callback ao restaurar padrão. |

**Tipo `ColumnDef`:**

```ts
interface ColumnDef {
  /** Identificador único (ex.: "email", "cpf") */
  id: string;
  /** Label legível no popover (ex.: "E-mail") */
  label: string;
  /** true = não pode ser desligada; aparece disabled no popover */
  alwaysVisible?: boolean;
  /** Padrão: true. Se false, coluna nasce oculta */
  defaultVisible?: boolean;
}
```

**Modos de uso:**

1. **Não-controlado** (recomendado): omita `visibleColumnIds`, `onToggle`, `onReset`.
   O componente instancia `useColumnVisibility` internamente.

2. **Controlado**: forneça `visibleColumnIds`, `onToggle`, `onReset` quando o pai
   já gerencia o hook (ex.: `<DataTable>` que precisa filtrar linhas).

### 2.2. Hook `useColumnVisibility`

Localização: `lib/hooks/use-column-visibility.ts`

```tsx
const { visibleColumnIds, isVisible, toggle, reset, isHydrated, hiddenIds } =
  useColumnVisibility({
    tableId: "contacts:list",
    userId: session.userId,
    columns: COLUMNS_DEF,
  });
```

**Retorno:**

| Campo | Tipo | Descrição |
|---|---|---|
| `visibleColumnIds` | `Set<string>` | IDs das colunas visíveis (após hidratação). |
| `isVisible(columnId)` | `(id: string) => boolean` | Função helper para saber se coluna é visível. |
| `toggle(columnId)` | `(id: string) => void` | Alterna visibilidade (no-op para `alwaysVisible`). |
| `reset()` | `() => void` | Remove preferência do localStorage e restaura defaults. |
| `isHydrated` | `boolean` | `false` durante SSR; `true` após `useEffect`. |
| `hiddenIds` | `string[]` | IDs ocultas (ordenado, sem duplicatas). |

**SSR/Hidratação:**

- Durante render no servidor, `hiddenIds` reflete os defaults (todas as colunas
  com `defaultVisible: true` aparecem; as com `defaultVisible: false` ficam
  ocultas).
- Após mount no cliente, `useEffect` lê `localStorage` e aplica preferência salva.
- **Flicker aceitável**: breve ajuste visual ao ocultar colunas (alternativa seria
  suspender render, prejudicando LCP).

### 2.3. Extensão do `<DataTable>`

Localização: `components/ui/data-table.tsx`

```tsx
<DataTable
  columns={columns}
  rows={data}
  rowKey={(row) => row.id}
  columnVisibility={{
    tableId: "offers:list",
    userId: session.userId,
    alwaysVisible: ["id", "actions"],
    defaultHidden: ["origin", "createdAt"],
    labelOverrides: { actions: "Ações" },
  }}
/>
```

**Props da extensão (`columnVisibility?`):**

| Campo | Tipo | Descrição |
|---|---|---|
| `tableId` | `string` | ID canônico da tabela. |
| `userId` | `string` | ID do usuário. |
| `alwaysVisible?` | `string[]` | Colunas que nunca podem ser ocultas. |
| `defaultHidden?` | `string[]` | Colunas que nascem ocultas (mas podem ser ativadas). |
| `labelOverrides?` | `Record<string, string>` | Labels para popover quando header é JSX complexo. |

Quando presente, `<DataTable>` renderiza `<ColumnsCustomizer>` na toolbar acima
da tabela e filtra colunas automaticamente. Consumidores sem `columnVisibility`
continuam funcionando (todas as colunas visíveis por padrão — zero breaking
change).

## 3. Convenção de `tableId`

Formato canônico: `<scope>:<table>`. Namespace evita colisão entre tabelas em
diferentes contextos.

### 3.1. Inventário oficial (Sprint 16)

**Total: 22 tableIds implementados e sincronizados (T-16-04 a T-16-14)**

| `tableId` | Localização | Arquivo | Onda | T-ID |
|---|---|---|---|---|
| `contacts:list` | `/contacts` | `components/contact/contact-columns.ts` | B | T-16-04 |
| `offers:list` | `/offers` | `components/offer/offer-columns.ts` | B | T-16-05 |
| `transactions:list` | `/transactions` | `components/transaction/transaction-columns.ts` | B | T-16-06 |
| `automations:list` | `/automations` | `components/automation/automation-columns.ts` | B | T-16-07 |
| `funnels:list` | `/funnels` | `components/funnel/funnel-columns.ts` | C | T-16-08 |
| `campaigns:list` | `/campaigns` + `/campaigns/[id]` | `components/campaign/campaign-columns.ts` | C | T-16-09 |
| `campaigns:creatives` | `/campaigns/[id]` tab Criativos | `components/campaign/creative-columns.ts` | C | T-16-09 |
| `billing:subscriptions` | `/billing/subscriptions` | `components/billing/subscription-columns.ts` | C | T-16-10 |
| `billing:delinquency` | `/billing/delinquency` | `components/billing/delinquency-columns.ts` | C | T-16-10 |
| `billing:installments` | `/billing` (tab) | `components/billing/installment-columns.ts` | C | T-16-10 |
| `settings:users` | `/settings/users` | `components/settings/users-columns.ts` | D | T-16-11 |
| `settings:brands` | `/settings/brands` | `components/settings/brands-columns.ts` | D | T-16-11 |
| `settings:legal-entities` | `/settings/legal-entities` | `components/settings/legal-entities-columns.ts` | D | T-16-11 |
| `settings:webhooks` | `/settings/webhooks` | `components/settings/webhooks-columns.ts` | D | T-16-12 |
| `settings:audit` | `/settings/audit` | `components/settings/audit-columns.ts` | D | T-16-12 |
| `settings:products` | `/settings/catalog/products` | `components/settings/products-columns.ts` | D | T-16-13 |
| `settings:categories` | `/settings/catalog/categories` | `components/settings/categories-columns.ts` | D | T-16-13 |
| `settings:benefits` | `/settings/catalog/benefits` | `components/settings/benefits-columns.ts` | D | T-16-13 |
| `settings:funnels` | `/settings/funnels` | `components/settings/settings-funnels-columns.ts` | D | T-16-13 |
| `contact:opportunities` | `/contacts/[id]` tab Oportunidades | `components/contact/contact-opportunities-columns.ts` | E | T-16-14 |
| `contact:tickets` | `/contacts/[id]` tab Tickets | `components/contact/contact-tickets-columns.ts` | E | T-16-14 |
| `transaction:installments` | `/transactions/[id]` tab Parcelas | `components/transaction/transaction-installments-columns.ts` | E | T-16-14 |

**Convenção:**
- Plurais para listagens principais (`contacts:list`, `offers:list`).
- Singulares para tabs dentro de detalhe (`contact:opportunities`, `transaction:installments`).
- Prefixo `settings:` para admin (`settings:users`, `settings:webhooks`).
- Prefixo `billing:` para financeiro (`billing:subscriptions`).

## 4. Regras de visibilidade

### 4.1. `alwaysVisible`

Colunas com `alwaysVisible: true`:

- Primeira coluna identificadora (geralmente nome/título).
- Coluna de ações ("Ver"/"Editar").
- Qualquer coluna obrigatória por auditoria ou compliance.

No popover:
- Aparecem **checked** e **disabled** (não podem ser deschecadas).
- Mostram tooltip "Coluna obrigatória".
- Ocupam espaço visual mas não consomem interação.

### 4.2. `defaultVisible`

- `defaultVisible: true` (padrão) — coluna visível no primeiro acesso do usuário
  a essa tabela.
- `defaultVisible: false` — coluna ocultada por padrão (avançada, pouco comum).
  Exemplo: CPF, Origem, Criado em em `/contacts`.

**Benefício da lista negativa**: quando uma coluna nova é adicionada ao código,
ela herda `defaultVisible: true` e aparece para todos os usuários **sem**
necessidade de migration de localStorage. Usuários não veem ruptura.

### 4.3. `labelOverrides`

Quando `<DataTable column.header>` é JSX complexo (ex.: ícone + texto), forneça
string legível para o popover:

```tsx
<DataTable
  columns={columns}
  columnVisibility={{
    tableId: "contacts:list",
    userId: session.userId,
    labelOverrides: {
      phone: "Telefone + WhatsApp",
      actions: "Ações",
    },
  }}
/>
```

## 5. Exemplo completo de integração

**1. Defina as colunas com `ColumnDef`:**

```tsx
// components/contact/contact-columns.ts
import type { ColumnDef } from "@/lib/hooks/use-column-visibility";

export const CONTACT_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Nome", alwaysVisible: true },
  { id: "email", label: "E-mail", defaultVisible: true },
  { id: "phone", label: "Telefone", defaultVisible: true },
  { id: "classification", label: "Classificação", defaultVisible: true },
  { id: "cpf", label: "CPF", defaultVisible: false },
  { id: "origin", label: "Origem", defaultVisible: false },
  { id: "createdAt", label: "Criado em", defaultVisible: false },
  { id: "actions", label: "Ações", alwaysVisible: true },
];
```

**2. Passar para `<DataTable>` com `columnVisibility`:**

```tsx
// app/(app)/contacts/page.tsx (Server Component obtém session.user.id e passa por prop)
import { DataTable } from "@/components/ui/data-table";

export function ContactList({ contacts, columns, userId }: Props) {
  return (
    <DataTable
      columns={columns}
      rows={contacts}
      rowKey={(c) => c.id}
      columnVisibility={{
        tableId: "contacts:list",
        userId,
        alwaysVisible: ["name", "actions"],
        defaultHidden: ["cpf", "origin", "createdAt"],
      }}
    />
  );
}
```

**3. Renderização automática:**

- `<DataTable>` instancia `useColumnVisibility` internamente.
- Renderiza `<ColumnsCustomizer>` na toolbar acima do `<table>`.
- Filtra `columns` antes de renderizar `<thead>` e `<tbody>`.

## 6. Considerações de SSR e hidratação

- **Servidor** renderiza todas as colunas com `defaultVisible: true` (ou
  `alwaysVisible: true`).
- **Cliente** (após `useEffect`) lê `localStorage` e oculta colunas conforme
  `hidden[]` salvo.
- O `<ColumnsCustomizer>` é client-only (`'use client'`) e só monta após
  hidratação — sem mismatch.

Alternativa não adotada: renderizar só colunas visíveis no servidor. Problema:
sem dados de `localStorage` no servidor, todos os usuários veem o mesmo subset
inicial, mas perderíamos consistência entre primeiro render e mount no client.
Flicker breve é o trade-off aceito (ADR-19).

## 7. Acessibilidade

Referência: `docs/70-ux/10-accessibility.md`.

- **Botão trigger**: `aria-label="Personalizar colunas"`.
- **Popover**: Radix `Popover` já gerencia `role="dialog"`, foco trapado,
  `Esc` fecha.
- **Checkboxes**: associados a labels via `htmlFor`/`id`. Texto legível de cada
  coluna.
- **Colunas obrigatórias**: checkbox `disabled` + `title="Coluna obrigatória"`.
- **Foco**: `ring-2 ring-offset-2 ring-ring` padrão do Tailwind; nunca remover
  sem substituto.

## 8. Passo-a-passo para migração (T-16-04..14)

Para cada tabela que recebe customizador:

1. **Identifique o `tableId`** — consulte inventário da §3.1.
2. **Defina `ColumnDef[]`** — array com `id`, `label`, `defaultVisible`,
   `alwaysVisible`. Coloque em arquivo dedicado `components/<mod>/<table>-columns.ts`
   se a tabela tem >5 colunas.
3. **Integre com `<DataTable>`** — passe `columnVisibility` prop com
   `tableId`, `userId`, `alwaysVisible`, `defaultHidden` (e `labelOverrides`
   se header é JSX).
4. **Teste SSR** — renderize a página, verifique que colunas corretas aparecem
   antes de hidratação.
5. **Teste localStorage** — abra DevTools, confirme que
   `cne-os:cols:<tableId>:<userId>` é persistido ao toggle.
6. **Teste reset** — clique "Restaurar padrão"; localStorage deve ser limpo.
7. **Teste navegação** — saia da página e volte; preferências devem manter-se.

## 9. Limites conhecidos

- **Sem sincronização cross-device** (registrado como `OQ-COLUMNS-01`).
  Preferências são por `localStorage` local; usuário em outro navegador/device
  verá defaults. Migração futura para tabela `user_preferences` no DB resolverá
  quando houver demanda.

- **Reordenação de colunas fora do escopo** — Sprint 16 cobre só
  visibilidade. Drag-drop para reordenar fica Sprint 17+.

- **Export CSV ignora visibilidade** (resolvido em ADR-19, `OQ-COLUMNS-02`).
  Export sempre inclui todas as colunas, mesmo as ocultas. Auditoria assim não
  fica comprometida.

- **Sem persistência de ordenação** — cada tabela mantém seu próprio estado de
  `sort` (implementado em `<DataTable onSort>`). Customizador só afeta
  **visibilidade**, não ordem.

## 10. Troubleshooting

| Problema | Solução |
|---|---|
| Coluna nova não aparece para usuários antigos | É esperado (lista negativa em ADR-19). Coluna com `defaultVisible: true` aparece para todos. Se deve ficar oculta, use `defaultVisible: false`. |
| Hydration mismatch (diferentes colunas antes/depois) | Certifique-se de que server renderiza **todas** as colunas com `defaultVisible: true`. Cliente filtra após mount. Não renderize de forma condicional baseado em `localStorage`. |
| localStorage quota exceeded | Improvável (payload típico < 1KB por tabela). Se acontecer, reset manual: DevTools → Application → localStorage → delete `cne-os:cols:*` entries. |
| Checkbox de coluna não responde | Verifique se `alwaysVisible: true` — no-op silencioso. Ou, se modo é controlado, certifique-se de que `onToggle` dispara mutation corretamente. |

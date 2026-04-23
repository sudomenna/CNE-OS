# BR-ENTITLEMENT-CONSOLIDATION: consolidação de direitos adquiridos

## Enunciado

Quando uma nova compra concede a um contato um direito (`customer_entitlement`) com o mesmo `(contact_id, brand_id, ref_kind, ref_id)` de um direito já existente, o sistema **deve consolidar em uma única linha ativa**, nunca criar duplicata. A forma da consolidação depende do cruzamento entre o direito existente e o novo (perpetuous × finito, ambos finitos, revogado × ativo).

## Motivação

Direito "vitalício" + "12 meses" não pode virar "até o menor prazo". Direito de 12 meses + mais 12 meses deve estender, não substituir. Direito revogado por refund + nova compra deve reativar com os novos parâmetros. A regra consolida o PRD §9.10.3 ("se antes era 12 meses e a nova compra garante vitalício, o direito passa a ser vitalício; se antes era 12 meses e a nova compra adiciona mais 12, estende").

## Escopo

- Módulo: [`MOD-ENTITLEMENT`](../20-domain/12-entitlement.md).
- Entidades: `customer_entitlement`, `entitlement_history`, `entitlement_status_history`.

## Enforcement

- [x] Função de domínio pura (`consolidate`) — **fonte da verdade**, testável sem DB
- [x] DB constraint (índice parcial único em `(contact_id, brand_id, ref_kind, ref_id) WHERE status='active'`)
- [x] Guard em Server Action (`grantFromTransaction` aplica o resultado do `consolidate`)
- [ ] DB trigger
- [ ] Guard em UI

## Contrato TS (função pura)

```ts
export type Entitlement = {
  id?: string;
  contactId: string;
  brandId: string;
  refKind: 'product' | 'benefit';
  refId: string;
  quantity: number;
  startedAt: Date;
  endsAt: Date | null;             // null = perpetuous
  status: 'active' | 'revoked' | 'expired' | 'suspended';
  accessRule: Record<string, unknown>;
};

export type ConsolidationResult =
  | { action: 'create'; next: Entitlement; reason: string }
  | { action: 'noop'; reason: string }
  | { action: 'extend_expiration'; next: Entitlement; reason: string }
  | { action: 'promote_perpetuous'; next: Entitlement; reason: string }
  | { action: 'merge_quantity'; next: Entitlement; reason: string }
  | { action: 'reactivate'; next: Entitlement; reason: string };

export function consolidate(
  existing: Entitlement | null,
  incoming: Entitlement,
): ConsolidationResult;
```

Implementação em `lib/domain/entitlement/consolidate.ts`. Puro, determinístico, sem I/O.

## Tabela de decisão

| Existing | Incoming | Ação |
|---|---|---|
| `null` (não existe) | qualquer | `create` (INSERT nova linha) — reason `initial_grant` |
| status `revoked` | qualquer | `reactivate` — reason `reactivate_after_revoke`; next usa `started_at=incoming.started_at`, `ends_at=incoming.ends_at`, `status='active'`, `quantity=incoming.quantity`, `access_rule=incoming.access_rule` |
| status `active`, `ends_at=null` (perpetuous) | `ends_at=null` | `noop` — reason `both_perpetuous`; grava history informativo |
| status `active`, `ends_at=null` (perpetuous) | `ends_at!=null` (finito) | `noop` — reason `existing_already_perpetuous_stronger` |
| status `active`, `ends_at!=null` | `ends_at=null` | `promote_perpetuous` — `next.ends_at=null` |
| status `active`, `ends_at!=null` | `ends_at!=null` | `extend_expiration` — ver política abaixo |
| status `suspended` | qualquer | trata como `active` para propósito de merge, mas mantém `status='suspended'` no resultado (operador que suspendeu decide reativação) |
| status `expired` | qualquer | `reactivate` com parâmetros do incoming |

### Política de extensão de `ends_at` (ambos finitos)

```
new_ends_at = max(existing.ends_at, incoming.ends_at)
              se sobrepõem (incoming.started_at <= existing.ends_at)

new_ends_at = existing.ends_at + (incoming.ends_at - incoming.started_at)
              se NÃO sobrepõem (gap entre existing.ends_at e incoming.started_at)
              // estende somando o período do incoming a partir do fim do existing
```

Regra prática: compra de "+12 meses" quando ainda restam 3 meses do direito antigo ⇒ `new_ends_at = existing.ends_at + 12 meses` (estende sem descartar o saldo). Compra de "+12 meses" depois do antigo já ter vencido (em tese não ocorre porque já seria `expired`; mas se estiver `active` com sobreposição mínima) ⇒ `max(existing, incoming.ends_at)`.

**`quantity`:** soma por padrão (`next.quantity = existing.quantity + incoming.quantity`). Ação reportada como `merge_quantity` quando for o único aspecto alterado; caso contrário a ação principal (extend/promote) incorpora o merge de quantidade.

**`access_rule`:** incoming sobrescreve (nova compra redefine regra de acesso); old rule fica no `entitlement_history.from`.

## Casos de teste (Given/When/Then)

### CT-ENT-CON-01 — Sem existing → create
- **Given** contato sem direito de P1; incoming com `ends_at=null`.
- **When** `consolidate(null, incoming)`.
- **Then** `{ action:'create', next: incoming, reason:'initial_grant' }`.

### CT-ENT-CON-02 — Ambos perpetuous → noop
- **Given** existing ativo perpetuous; incoming perpetuous.
- **When** consolidate.
- **Then** `{ action:'noop', reason:'both_perpetuous' }`. Grava history informativo.

### CT-ENT-CON-03 — Incoming perpetuous promove existing
- **Given** existing `ends_at=2026-12-31`; incoming `ends_at=null`.
- **When** consolidate.
- **Then** `{ action:'promote_perpetuous', next.ends_at=null }`.

### CT-ENT-CON-04 — Ambos finitos com sobreposição → max
- **Given** existing `started=2026-01-01, ends=2026-06-01`; incoming `started=2026-03-01, ends=2026-12-01`.
- **When** consolidate.
- **Then** `{ action:'extend_expiration', next.ends_at=2026-12-01 }` (max).

### CT-ENT-CON-05 — Ambos finitos estendendo (sem gap, +12 meses)
- **Given** existing `started=2026-01-01, ends=2026-06-01`; incoming `started=2026-05-01, ends=2027-05-01` (12 meses a partir da compra).
- **When** consolidate.
- **Then** com sobreposição (incoming.started 2026-05-01 < existing.ends 2026-06-01): `next.ends_at=max(2026-06-01, 2027-05-01)=2027-05-01`. `action='extend_expiration'`.

### CT-ENT-CON-06 — Revogado reativa
- **Given** existing `status='revoked'`; incoming `ends_at=2027-01-01`.
- **When** consolidate.
- **Then** `{ action:'reactivate', next.status='active', next.ends_at=2027-01-01, next.started_at=incoming.started_at }`.

### CT-ENT-CON-07 — Existing perpetuous absorve incoming finito → noop
- **Given** existing `ends_at=null`; incoming `ends_at=2026-12-31`.
- **When** consolidate.
- **Then** `{ action:'noop', reason:'existing_already_perpetuous_stronger' }`.

### CT-ENT-CON-08 — Apenas quantidade muda
- **Given** existing `quantity=1, ends_at=null`; incoming `quantity=2, ends_at=null`.
- **When** consolidate.
- **Then** `{ action:'merge_quantity', next.quantity=3, ends_at=null }`. (Regra: soma.)

### CT-ENT-CON-09 — `access_rule` incoming sobrescreve
- **Given** existing `access_rule={drip:true}`; incoming `access_rule={drip:false}`.
- **When** consolidate com extensão.
- **Then** `next.access_rule={drip:false}`; history.from captura `{drip:true}`.

## Rastreabilidade

- Teste esperado: `tests/unit/entitlement/consolidate.test.ts` (matriz de 9 CTs + fuzz).
- Referenciada em: [`MOD-ENTITLEMENT §10`](../20-domain/12-entitlement.md#10-fluxo-principal-grantfromtransaction), [`BR-RENEWAL`](./BR-RENEWAL.md), [`BR-REFUND`](./BR-REFUND.md).
- PRD origem: §9.10.3.

## Open Questions

- `OQ-BR-ENT-CON-01` — `quantity` sempre soma? Para `product_access` de curso faz pouco sentido (binário: tem ou não tem). Proposta: por `ref_kind`/`kind`, mentoria=soma, curso=cap em 1.
- `OQ-BR-ENT-CON-02` — existing `suspended` + incoming novo: reativa automaticamente ou preserva suspensão?
- `OQ-BR-ENT-CON-03` — sobreposições parciais entre períodos: o modelo atual ignora o "desconto" do tempo já consumido. Aceitável na Fase 1; registrar.
- `OQ-BR-ENT-CON-04` — direito consolidado precisa manter histórico de *origin* (lista de transações)? Hoje guardamos `origin_transaction_id` (primeira) + `entitlement_history` (tudo). Confirmar suficiência.

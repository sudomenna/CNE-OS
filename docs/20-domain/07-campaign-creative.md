# Campaign & Creative (Módulo MOD-CAMPAIGN)

## 1. Finalidade

Organizar peças de marketing (campanhas e criativos) e links rastreáveis, produzindo UTMs canônicas para aferição. Entrega a origem de entrada e de conversão de cada oportunidade em funil. Criativo é a **menor unidade de análise** da operação.

## 2. Ownership (paralelização)

- Arquivos que POSSUI:
  - `docs/20-domain/07-campaign-creative.md`
  - `lib/db/schema/campaign.ts`
  - `lib/domain/campaign/*` (inclui `generateUtm`)
  - `app/(app)/campaigns/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md`
  - `docs/30-contracts/03-timeline-event-catalog.md` (TE-CAMPAIGN-CLICK)
  - `lib/db/schema/brand.ts`, `lib/db/schema/funnel.ts`
- Interfaces públicas expostas:
  - `createCampaign(input): Promise<Campaign>`
  - `createCreative(campaignId, input): Promise<Creative>`
  - `issueTrackableLink(input): Promise<TrackableLink>`
  - `generateUtm(ctx): Utm` — função pura

## 3. Entidades e campos

| Tabela | Finalidade |
|---|---|
| `campaign` | Peça de marketing pertencente a marca, apontando para 1 funil. |
| `creative` | Ativo de comunicação pertencente a campanha. |
| `creative_asset` | Arquivo/metadado anexo ao criativo. |
| `trackable_link` | URL com UTMs geradas pelo sistema, compartilhável entre campanha/criativo/funil. |
| `content_library_item` | (Fase 2) item da biblioteca de conteúdo — stub. |

### DDL sketch

```sql
CREATE TABLE campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id),
  funnel_id uuid NOT NULL REFERENCES funnel(id),
  name text NOT NULL,
  slug text NOT NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT uq_campaign_slug_brand UNIQUE (brand_id, slug)
);

CREATE TABLE creative (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaign(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  channel text NULL,                        -- meta_ads, google_ads, organic_ig, email, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT uq_creative_slug_campaign UNIQUE (campaign_id, slug)
);

CREATE TABLE creative_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL REFERENCES creative(id) ON DELETE CASCADE,
  kind text NOT NULL,                       -- image, video, copy, landing
  url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trackable_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id),
  funnel_id uuid NULL REFERENCES funnel(id),
  campaign_id uuid NULL REFERENCES campaign(id),
  creative_id uuid NULL REFERENCES creative(id),
  destination_url text NOT NULL,
  slug text NOT NULL,                       -- usado no short URL
  utm jsonb NOT NULL,                       -- snapshot das UTMs geradas
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_trackable_link_slug UNIQUE (slug)
);

-- Fase 2 (stub):
CREATE TABLE content_library_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id),
  kind text NOT NULL,
  url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## 4. Relações (ASCII)

```
brand ──< campaign ──< creative ──< creative_asset
             │            │
             ▼            ▼
           funnel      trackable_link (compartilhável: brand/campaign/creative/funnel)
```

## 5. Invariantes (INV-CAMPAIGN-NN)

- `INV-CAMPAIGN-01`: toda `campaign` pertence a exatamente 1 `brand` e aponta para exatamente 1 `funnel`.
- `INV-CAMPAIGN-02`: `creative` pertence a exatamente 1 `campaign`. Um criativo **novo** é um novo registro — não há versionamento interno em Fase 1.
- `INV-CAMPAIGN-03`: `trackable_link.slug` é globalmente único (URL curta).
- `INV-CAMPAIGN-04`: UTMs geradas pelo sistema são **deterministas** dadas as mesmas entradas (função pura `generateUtm`).
- `INV-CAMPAIGN-05`: campanha arquivada/desativada (`is_active=false`) permanece no histórico; jamais deletar fisicamente quando houver `trackable_link` ou `funnel_entry` referenciando.

## 6. Estados e transições

`campaign.is_active`:

```
active ─► paused ─► active
   └──────► archived (soft-delete via deleted_at)
```

## 7. Regras de negócio referenciadas

- [BR-RBAC](../50-business-rules/BR-RBAC.md) — marketing e comercial podem criar campanha; apenas marketing cria criativo.
- [BR-FUNNEL-OPPORTUNITY](../50-business-rules/BR-FUNNEL-OPPORTUNITY.md) — `entry_creative_id` / `conversion_creative_id` vêm daqui.

## 8. Eventos de timeline emitidos

- `TE-CAMPAIGN-CLICK` — payload `{ campaign_id, creative_id?, trackable_link_id, utm }`.

## 9. Geração de UTM — contrato

UTMs obrigatórias geradas pelo sistema:

| UTM | Origem |
|---|---|
| `utm_source` | `brand.slug` |
| `utm_medium` | canal do criativo (`creative.channel`) ou categoria do link |
| `utm_campaign` | `campaign.slug` |
| `utm_content` | `creative.slug` (quando existir) |
| `utm_term` | `funnel.slug` (quando existir) |

### Contrato TS (função pura)

```ts
export type UtmContext = {
  brand:    { slug: string };
  campaign: { slug: string };
  creative?: { slug: string; channel?: string };
  funnel?:  { slug: string };
  mediumOverride?: string;
};

export type Utm = {
  utm_source:   string;
  utm_medium:   string;
  utm_campaign: string;
  utm_content?: string;
  utm_term?:    string;
};

export function generateUtm(ctx: UtmContext): Utm;
```

Implementação em `lib/domain/campaign/generate-utm.ts`; sem I/O, testável isoladamente.

## 10. Fluxos relacionados

- `FLOW-CAMPAIGN-ISSUE-LINK`: usuário cria campanha → cria criativo → emite trackable_link → `generateUtm` produz UTMs → link curto gerado.
- `FLOW-CAMPAIGN-CLICK`: clique em trackable_link → redirect emite `TE-CAMPAIGN-CLICK` → preenche `entry_creative_id` ao entrar no funil.

## 11. Casos de teste obrigatórios

1. **generateUtm determinista**: mesmos inputs → mesmo output. `expect(generateUtm(ctx)).toEqual(generateUtm(ctx))`.
2. **UTMs geradas corretamente**: brand `cne-carreiras`, campaign `black-friday-2026`, creative `vid-testimonial-01` (channel `meta_ads`), funnel `topo-carreira` → `{utm_source:'cne-carreiras', utm_medium:'meta_ads', utm_campaign:'black-friday-2026', utm_content:'vid-testimonial-01', utm_term:'topo-carreira'}`.
3. **Campanha aponta para 1 funil**: tentativa de atualizar campaign para 2 funis rejeitada (campo é escalar).
4. **Criativo novo = novo registro**: editar arte de criativo existente é vedado em UI; agente cria `creative` novo para substituir.
5. **Trackable link compartilhável**: mesmo link pode estar ligado a `campaign` e `funnel` sem `creative` (campanha de topo) — aceito.
6. **TE-CAMPAIGN-CLICK**: clique registrado emite evento com `utm` snapshot.

## 12. Open Questions

- `OQ-CAMPAIGN-01`: encurtador de URL in-house ou delegar a Bitly/Rebrandly?
- `OQ-CAMPAIGN-02`: agregação de `TE-CAMPAIGN-CLICK` por sessão para não inundar timeline (cruz com `OQ-TE-02`).
- `OQ-CAMPAIGN-03`: versionamento de criativo na Fase 2 — manter `creative_version` ou continuar "novo criativo = novo registro"?

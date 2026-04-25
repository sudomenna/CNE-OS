/**
 * SnapshotViewer — exibe TransactionSnapshotPayload em árvore legível.
 * Client Component: seções colapsáveis via estado local.
 * T-8-16: docs/20-domain/11-transaction-snapshot.md §3.2
 *
 * Seções: Oferta | Condição | Entidade Legal | Itens | Pagamento | Fonte
 * Read-only, sem edição.
 */

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SnapshotPayload } from '@/app/(app)/transactions/actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const ITEM_KIND_LABEL: Record<string, string> = {
  main: 'Principal',
  bonus: 'Bônus',
  upsell: 'Upsell',
  order_bump: 'Order Bump',
  complement: 'Complemento',
  commercial_benefit: 'Benefício Comercial',
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  installments: 'Parcelado',
  boleto: 'Boleto',
  custom: 'Customizado',
}

// ---------------------------------------------------------------------------
// Subcomponente: seção colapsável
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
        )}
      </button>
      {open && <div className="px-4 py-4 bg-white space-y-2">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponente: campo de label + valor
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline">
      <span className="text-xs font-medium text-slate-500 sm:w-40 shrink-0">{label}</span>
      <span className="text-sm text-slate-900">{value ?? <em className="text-slate-400">—</em>}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SnapshotViewer principal
// ---------------------------------------------------------------------------

interface SnapshotViewerProps {
  payload: SnapshotPayload
  capturedAt: string
}

export function SnapshotViewer({ payload, capturedAt }: SnapshotViewerProps) {
  return (
    <div className="space-y-3" role="region" aria-label="Snapshot da venda">
      {/* Cabeçalho informativo */}
      <div className="flex items-center gap-2 text-xs text-slate-500 border border-amber-200 bg-amber-50 rounded-md px-3 py-2">
        <span className="font-medium text-amber-700">Snapshot imutavel</span>
        <span className="text-amber-600">capturado em {formatDate(capturedAt)}</span>
      </div>

      {/* Oferta */}
      <Section title="Oferta">
        <Field label="ID" value={payload.offer.id} />
        <Field label="Nome" value={payload.offer.name} />
        <Field label="Slug" value={payload.offer.slug} />
        <Field
          label="Tipo"
          value={
            <Badge variant={payload.offer.type === 'renewal' ? 'outline' : 'default'}>
              {payload.offer.type === 'renewal' ? 'Renovacao' : 'Regular'}
            </Badge>
          }
        />
        {payload.offer.renews_offer_id && (
          <Field label="Renova oferta" value={payload.offer.renews_offer_id} />
        )}
        <Field label="Marca" value={`${payload.brand.name} (${payload.brand.slug})`} />
      </Section>

      {/* Condição comercial */}
      <Section title="Condicao Comercial">
        <Field label="ID" value={payload.condition.id} />
        <Field label="Nome" value={payload.condition.name} />
        <Field label="Prioridade" value={String(payload.condition.priority)} />
        <Field label="Score" value={String(payload.condition.advantage_score)} />
        <Field
          label="Padrao"
          value={
            <Badge variant={payload.condition.is_default ? 'default' : 'secondary'}>
              {payload.condition.is_default ? 'Sim' : 'Nao'}
            </Badge>
          }
        />
        <Field
          label="Avaliacao"
          value={
            <Badge variant={payload.rules.evaluation === 'match' ? 'default' : 'outline'}>
              {payload.rules.evaluation === 'match' ? 'Regra correspondente' : 'Fallback padrao'}
            </Badge>
          }
        />
        {payload.rules.context_snapshot.campaign_id && (
          <Field label="Campanha" value={payload.rules.context_snapshot.campaign_id} />
        )}
        {payload.rules.context_snapshot.channel && (
          <Field label="Canal" value={payload.rules.context_snapshot.channel} />
        )}
      </Section>

      {/* Entidade Legal */}
      <Section title="Entidade Legal Emissora" defaultOpen={false}>
        <Field label="ID" value={payload.legal_entity.id} />
        <Field label="Razao Social" value={payload.legal_entity.company_name} />
        <Field label="CNPJ" value={payload.legal_entity.cnpj} />
        {payload.legal_entity.tax_regime && (
          <Field label="Regime Tributario" value={payload.legal_entity.tax_regime} />
        )}
      </Section>

      {/* Itens */}
      <Section title={`Itens (${payload.items.length})`}>
        {payload.items.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum item no snapshot.</p>
        ) : (
          <div className="space-y-4">
            {payload.items.map((item, idx) => (
              <div key={item.condition_item_id} className="rounded-md border border-slate-100 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Item {idx + 1}
                  </span>
                  <Badge variant="secondary">
                    {ITEM_KIND_LABEL[item.kind] ?? item.kind}
                  </Badge>
                </div>
                {item.product && (
                  <Field label="Produto" value={`${item.product.name} (${item.product.kind})`} />
                )}
                {item.commercial_benefit && (
                  <Field label="Beneficio" value={item.commercial_benefit.name} />
                )}
                <Field label="Quantidade" value={String(item.quantity)} />
                {item.vigency_months !== null && (
                  <Field label="Vigencia" value={`${item.vigency_months} meses`} />
                )}
                {item.discount !== null && (
                  <Field label="Desconto" value={`${item.discount}%`} />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Pagamento */}
      <Section title="Opcao de Pagamento">
        <Field label="ID" value={payload.payment_option.id} />
        <Field
          label="Metodo"
          value={PAYMENT_METHOD_LABEL[payload.payment_option.method] ?? payload.payment_option.method}
        />
        <Field label="Preco" value={formatCurrency(payload.payment_option.price)} />
        {payload.payment_option.installments !== null && (
          <Field label="Parcelas" value={String(payload.payment_option.installments)} />
        )}
      </Section>

      {/* Fonte */}
      <Section title="Fonte / Provedor" defaultOpen={false}>
        {payload.source.provider && (
          <Field label="Provedor" value={payload.source.provider} />
        )}
        {payload.source.external_id && (
          <Field label="ID externo" value={payload.source.external_id} />
        )}
        {payload.source.raw_event_id && (
          <Field label="Evento webhook" value={payload.source.raw_event_id} />
        )}
        {!payload.source.provider && !payload.source.external_id && !payload.source.raw_event_id && (
          <p className="text-sm text-slate-400">Transacao manual sem fonte externa.</p>
        )}
      </Section>
    </div>
  )
}

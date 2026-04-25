/**
 * EffectsPreview — step 2 do wizard de reembolso
 *
 * Exibe lista de entitlements que serão revogados ao aprovar o refund.
 * Componente de apresentação puro (sem estado).
 * T-8-19: docs/20-domain/14-refund.md §7
 */

import type { EntitlementPreviewItem } from '@/app/(app)/transactions/[id]/refund/actions'

type Props = {
  amount: string
  currency: string
  contactName: string
  offerName: string
  entitlementsToRevoke: EntitlementPreviewItem[]
}

const KIND_LABEL: Record<string, string> = {
  product_access: 'Acesso a Produto',
  benefit: 'Benefício',
  other: 'Outro',
}

const REF_KIND_LABEL: Record<string, string> = {
  product: 'Produto',
  benefit: 'Benefício Comercial',
}

function formatDate(date: Date | string | null) {
  if (!date) return 'Vitalício'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(amount))
}

export function EffectsPreview({
  amount,
  currency,
  contactName,
  offerName,
  entitlementsToRevoke,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Resumo da transação */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Contato</span>
          <span className="font-medium text-slate-900">{contactName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Oferta</span>
          <span className="font-medium text-slate-900">{offerName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Valor do reembolso</span>
          <span className="font-semibold text-red-600">{formatCurrency(amount, currency)}</span>
        </div>
      </div>

      {/* Efeitos previstos */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Efeitos ao aprovar o reembolso
        </h3>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>
            <span>Status da transação será marcado como <strong>reembolsada</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>
            <span>Flag do snapshot será registrada em <strong>histórico de flags</strong> (payload permanece imutável)</span>
          </li>
          {entitlementsToRevoke.length > 0 && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">!</span>
              <span>
                <strong>{entitlementsToRevoke.length} direito(s)</strong> serão revogados
              </span>
            </li>
          )}
        </ul>
      </div>

      {/* Tabela de entitlements a revogar */}
      {entitlementsToRevoke.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Direitos que serão revogados ({entitlementsToRevoke.length})
          </h3>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table
              className="w-full text-xs"
              role="table"
              aria-label="Direitos a serem revogados"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide">
                    Tipo
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide">
                    Referência
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-600 uppercase tracking-wide">
                    Qtd
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide">
                    Validade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entitlementsToRevoke.map((ent) => (
                  <tr key={ent.id} className="bg-red-50/40">
                    <td className="px-3 py-2 text-slate-700">
                      {KIND_LABEL[ent.kind] ?? ent.kind}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">
                      <span className="text-slate-400">{REF_KIND_LABEL[ent.refKind] ?? ent.refKind}: </span>
                      {ent.refId.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {ent.quantity}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatDate(ent.endsAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-500">
            Nenhum direito ativo encontrado para esta transação.
          </p>
        </div>
      )}
    </div>
  )
}

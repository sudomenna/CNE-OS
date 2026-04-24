/**
 * IssueCard — Server Component que exibe uma issue de identidade de contato.
 * Renderiza badge de kind, detalhe, contato relacionado e data de abertura.
 * Inclui o ResolveDialog (Client Component) para resolução inline.
 */

import type { ContactIssue } from '@/lib/db/schema/contact_merge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ResolveDialog } from './resolve-dialog'

// Mapeamento de kind para label legível e cores de borda/badge
const KIND_CONFIG: Record<
  ContactIssue['kind'],
  { label: string; borderClass: string; badgeClass: string }
> = {
  email_duplicate: {
    label: 'Email duplicado',
    borderClass: 'border-l-orange-400',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  phone_conflict: {
    label: 'Conflito de telefone',
    borderClass: 'border-l-yellow-400',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  },
  document_mismatch: {
    label: 'Divergência de documento',
    borderClass: 'border-l-red-400',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
  },
  source_divergence: {
    label: 'Divergência de origem',
    borderClass: 'border-l-blue-400',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  other: {
    label: 'Outro',
    borderClass: 'border-l-slate-400',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

interface IssueCardProps {
  issue: ContactIssue
  relatedContactName?: string | undefined
}

export function IssueCard({ issue, relatedContactName }: IssueCardProps) {
  const config = KIND_CONFIG[issue.kind]

  return (
    <Card className={`border-l-4 ${config.borderClass}`}>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={config.badgeClass}
            >
              {config.label}
            </Badge>
          </div>

          <p className="text-sm text-slate-800">{issue.detail}</p>

          {relatedContactName && (
            <p className="text-xs text-slate-500">
              Contato relacionado:{' '}
              <span className="font-medium text-slate-700">{relatedContactName}</span>
            </p>
          )}

          <p className="text-xs text-slate-400">
            Aberta em {formatDate(issue.createdAt)}
          </p>
        </div>

        <div className="shrink-0">
          <ResolveDialog issueId={issue.id} contactId={issue.contactId} />
        </div>
      </CardContent>
    </Card>
  )
}

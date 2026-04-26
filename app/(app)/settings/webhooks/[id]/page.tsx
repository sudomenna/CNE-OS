/**
 * MOD-INTEGRATIONS / T-8-17 — /settings/webhooks/[id] (detalhe)
 *
 * Server Component: mostra metadados, payload bruto, last_error.
 * Delega botão "Reprocessar" para Client Component (ReprocessButton).
 * RBAC para botão: avaliado via can() no servidor, passado como prop.
 *
 * FLOW-12 — Reprocessamento manual de webhook DLQ
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { getWebhookLog } from '../actions'
import type { OperatorNote } from '../actions'
import { requireSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { ReprocessButton } from '@/components/webhooks/reprocess-button'
import { IgnoreButton } from '@/components/webhooks/ignore-button'
import { AddOperatorNoteForm } from '@/components/webhooks/add-operator-note-form'

// ---------------------------------------------------------------------------
// Labels e estilos
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  received: 'Recebido',
  processed: 'Processado',
  failed: 'Falhou',
  dead_letter: 'DLQ',
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  received: 'secondary',
  processed: 'default',
  failed: 'destructive',
  dead_letter: 'destructive',
}

const PROVIDER_LABELS: Record<string, string> = {
  digital_guru: 'Digital Guru',
  brevo: 'Brevo',
  whatsapp_official: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  notazz: 'Notazz',
  analytics: 'Analytics',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function formatDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

// ---------------------------------------------------------------------------
// Componente da página
// ---------------------------------------------------------------------------

export default async function WebhookDetailPage({ params }: PageProps) {
  const { id } = await params

  // Sessão para avaliar permissão de reprocess (sem lançar erro — é leitura)
  let canReprocess = false
  try {
    const ctx = await requireSession()
    canReprocess = can(ctx.user, 'webhook.reprocess', { kind: 'global' })
  } catch {
    // Usuário não autenticado ou sem papel — canReprocess permanece false
  }

  const result = await getWebhookLog({ id })
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound()
    // Outros erros: exibir mensagem genérica
    return (
      <div className="space-y-4">
        <Link
          href="/settings/webhooks"
          className="text-sm text-muted-foreground hover:text-muted-foreground underline-offset-2 hover:underline"
        >
          &larr; Voltar para webhooks
        </Link>
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar este webhook. Tente novamente.
        </div>
      </div>
    )
  }

  const entry = result.data
  const isAlert = entry.status === 'dead_letter' || entry.status === 'failed'

  // Formatar payload como JSON identado (raw_payload é jsonb)
  let payloadFormatted: string
  try {
    payloadFormatted = JSON.stringify(entry.payload, null, 2)
  } catch {
    payloadFormatted = String(entry.payload)
  }

  // FLOW-12 §3: operator_notes é jsonb array append-only
  const operatorNotes: OperatorNote[] = Array.isArray(entry.operatorNotes)
    ? (entry.operatorNotes as OperatorNote[])
    : []

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Navegação de volta */}
      <Link
        href="/settings/webhooks"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
      >
        &larr; Voltar para webhooks
      </Link>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Detalhe do Webhook</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono break-all">{entry.id}</p>
        </div>
        {/* BR-RBAC: botões visíveis apenas para admin|financial + 2FA e status failed|dead_letter */}
        <div className="flex items-center gap-2">
          <IgnoreButton
            webhookLogId={entry.id}
            status={entry.status}
            canReprocess={canReprocess}
          />
          <ReprocessButton
            webhookLogId={entry.id}
            status={entry.status}
            canReprocess={canReprocess}
          />
        </div>
      </div>

      {/* Alerta para DLQ */}
      {isAlert && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <strong className="font-semibold">
            {entry.status === 'dead_letter' ? 'Dead Letter Queue' : 'Falha no processamento'}
          </strong>
          {' — '}
          {entry.status === 'dead_letter'
            ? 'Este evento esgotou todas as tentativas automáticas de reprocessamento.'
            : 'Este evento falhou e aguarda intervenção manual.'}
          {entry.attempts > 0 && ` Total de tentativas: ${entry.attempts}.`}
        </div>
      )}

      {/* Metadados */}
      <section aria-labelledby="metadata-heading">
        <h2 id="metadata-heading" className="text-base font-semibold text-foreground mb-3">
          Metadados
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <dl className="divide-y divide-border">
            <MetaRow label="Provedor">
              {PROVIDER_LABELS[entry.provider] ?? entry.provider}
            </MetaRow>
            <MetaRow label="Tipo de evento">
              {entry.eventKind ?? <span className="text-muted-foreground/60 italic">não especificado</span>}
            </MetaRow>
            <MetaRow label="ID externo">
              <span className="font-mono text-xs break-all">{entry.externalEventId}</span>
            </MetaRow>
            <MetaRow label="Status">
              <Badge variant={STATUS_VARIANT[entry.status] ?? 'outline'}>
                {STATUS_LABELS[entry.status] ?? entry.status}
              </Badge>
            </MetaRow>
            <MetaRow label="Tentativas">
              <span className="tabular-nums">{entry.attempts}</span>
            </MetaRow>
            <MetaRow label="Recebido em">{formatDate(entry.receivedAt)}</MetaRow>
            <MetaRow label="Processado em">{formatDate(entry.processedAt)}</MetaRow>
            {entry.deadLetteredAt && (
              <MetaRow label="Movido para DLQ em">
                {formatDate(entry.deadLetteredAt)}
              </MetaRow>
            )}
          </dl>
        </div>
      </section>

      {/* Último erro */}
      {entry.lastError && (
        <section aria-labelledby="error-heading">
          <h2 id="error-heading" className="text-base font-semibold text-foreground mb-3">
            Último erro
          </h2>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <pre
              className="text-xs text-red-700 whitespace-pre-wrap break-words font-mono"
              aria-label="Mensagem de erro"
            >
              {entry.lastError}
            </pre>
          </div>
        </section>
      )}

      {/* Payload bruto */}
      <section aria-labelledby="payload-heading">
        <h2 id="payload-heading" className="text-base font-semibold text-foreground mb-3">
          Payload
        </h2>
        <div className="rounded-lg border border-border bg-neutral-950 p-4 overflow-auto max-h-[500px]">
          <pre
            className="text-xs text-neutral-100 whitespace-pre font-mono"
            aria-label="Payload JSON do webhook"
          >
            {payloadFormatted}
          </pre>
        </div>
      </section>

      {/* Notas do operador — FLOW-12 §3 */}
      <section aria-labelledby="operator-notes-heading">
        <h2 id="operator-notes-heading" className="text-base font-semibold text-foreground mb-3">
          Notas do operador
        </h2>

        {/* Lista de notas existentes */}
        {operatorNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-4 italic">
            Nenhuma nota registrada.
          </p>
        ) : (
          <ol
            aria-label="Histórico de notas do operador"
            className="mb-4 space-y-3"
          >
            {operatorNotes.map((note, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                  <time dateTime={note.addedAt}>
                    {formatDate(new Date(note.addedAt))}
                  </time>
                  <span aria-hidden="true">&bull;</span>
                  <span className="font-mono">{note.addedBy}</span>
                </div>
                <p className="text-foreground whitespace-pre-wrap break-words">{note.text}</p>
              </li>
            ))}
          </ol>
        )}

        {/* Formulário para adicionar nova nota — visível se tem permissão */}
        {canReprocess && (
          <div className="rounded-lg border border-border bg-card p-4">
            <AddOperatorNoteForm webhookLogId={entry.id} />
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente auxiliar: linha de metadado (dl/dd)
// ---------------------------------------------------------------------------

function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] px-4 py-3 text-sm">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  )
}

'use client'

/**
 * MergeWizard — wizard multi-step de merge de contatos (T-1-17)
 *
 * Passo 1: usuario informa UUIDs do principal e secundario → redirect para ?principal=&secondary=
 * Passo 2 (quando principal+secondary estao presentes): exibe diff e campo de motivo → chama mergeContactsAction
 *
 * O botao "Desfazer merge" so aparece quando canUnmerge=true (roles admin/financial — BR-RBAC).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { mergeContactsAction, undoMergeAction } from '@/app/(app)/contacts/merge/actions'
import type { ContactForMerge } from '@/app/(app)/contacts/merge/page'

// ---------------------------------------------------------------------------
// Utilitarios de formatacao
// ---------------------------------------------------------------------------

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  mentorado: 'Mentorado',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  invalid: 'Invalido',
  blocked: 'Bloqueado',
}

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MergeWizardProps {
  principal: ContactForMerge | null
  secondary: ContactForMerge | null
  initialPrincipalId: string
  initialSecondaryId: string
  canUnmerge: boolean
}

// ---------------------------------------------------------------------------
// Passo 1 — Seletor de UUIDs
// ---------------------------------------------------------------------------

interface Step1Props {
  initialPrincipalId: string
  initialSecondaryId: string
}

function Step1({ initialPrincipalId, initialSecondaryId }: Step1Props) {
  const [principalId, setPrincipalId] = useState(initialPrincipalId)
  const [secondaryId, setSecondaryId] = useState(initialSecondaryId)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleCompare() {
    const principal = principalId.trim()
    const secondary = secondaryId.trim()

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!principal || !secondary) {
      setError('Informe os dois IDs antes de comparar.')
      return
    }
    if (!uuidRegex.test(principal) || !uuidRegex.test(secondary)) {
      setError('Ambos os IDs devem ser UUIDs validos.')
      return
    }
    if (principal === secondary) {
      setError('Os dois contatos devem ser diferentes.')
      return
    }

    setError(null)
    router.push(`/contacts/merge?principal=${principal}&secondary=${secondary}`)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Passo 1 — Selecionar contatos</h2>
        <p className="text-sm text-muted-foreground">
          Cole o UUID do contato principal e do secundario. O contato secundario sera unificado
          ao principal (seu historico e preservado).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Contato Principal */}
        <div className="space-y-1.5">
          <label htmlFor="principal-id" className="block text-sm font-medium text-muted-foreground">
            Contato Principal <span aria-hidden="true" className="text-muted-foreground/60 font-normal">(UUID)</span>
          </label>
          <input
            id="principal-id"
            type="text"
            value={principalId}
            onChange={(e) => setPrincipalId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby={error ? 'step1-error' : undefined}
          />
        </div>

        {/* Contato Secundario */}
        <div className="space-y-1.5">
          <label htmlFor="secondary-id" className="block text-sm font-medium text-muted-foreground">
            Contato Secundario <span aria-hidden="true" className="text-muted-foreground/60 font-normal">(UUID)</span>
          </label>
          <input
            id="secondary-id"
            type="text"
            value={secondaryId}
            onChange={(e) => setSecondaryId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby={error ? 'step1-error' : undefined}
          />
        </div>
      </div>

      {error && (
        <p id="step1-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleCompare}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Comparar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff row helper
// ---------------------------------------------------------------------------

interface DiffRowProps {
  label: string
  principalValue: React.ReactNode
  secondaryValue: React.ReactNode
}

function DiffRow({ label, principalValue, secondaryValue }: DiffRowProps) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-muted-foreground w-32 align-top">{label}</td>
      <td className="py-2.5 pr-4 text-sm text-foreground align-top">{principalValue}</td>
      <td className="py-2.5 text-sm text-muted-foreground align-top">{secondaryValue}</td>
    </tr>
  )
}

const DASH = <span className="text-muted-foreground/40">—</span>

// ---------------------------------------------------------------------------
// Passo 2 — Diff + confirmacao
// ---------------------------------------------------------------------------

interface Step2Props {
  principal: ContactForMerge
  secondary: ContactForMerge
  canUnmerge: boolean
}

function Step2({ principal, secondary, canUnmerge }: Step2Props) {
  const [reason, setReason] = useState('')
  const [undoReason, setUndoReason] = useState('')
  const [mergeId, setMergeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isUndoPending, startUndoTransition] = useTransition()
  const router = useRouter()

  function handleSubmit() {
    if (!reason.trim()) {
      setError('Informe o motivo do merge.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await mergeContactsAction({
        principalContactId: principal.id,
        secondaryContactId: secondary.id,
        reason: reason.trim(),
      })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      setMergeId(result.data.mergeId)
      setSuccessMsg(
        `Merge realizado com sucesso. Contato principal: ${result.data.principalId}`,
      )
    })
  }

  function handleUndo() {
    if (!mergeId) return
    if (!undoReason.trim()) {
      setUndoError('Informe o motivo do desfazer.')
      return
    }
    setUndoError(null)

    startUndoTransition(async () => {
      const result = await undoMergeAction({ mergeId, reason: undoReason.trim() })

      if (!result.ok) {
        setUndoError(result.error.message)
        return
      }

      router.push('/contacts')
    })
  }

  if (successMsg && mergeId) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold"
          >
            ✓
          </div>
          <div>
            <p className="text-sm font-medium text-green-900">{successMsg}</p>
            <p className="text-xs text-green-700 mt-0.5">ID do merge: <code className="font-mono">{mergeId}</code></p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/contacts')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Voltar para Contatos
          </button>

          {/* BR-RBAC: contact.unmerge disponivel apenas para admin e financial */}
          {canUnmerge && (
            <button
              type="button"
              onClick={() => setUndoError('')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Desfazer merge
            </button>
          )}
        </div>

        {/* Painel de desfazer — so visivel apos clicar no botao */}
        {canUnmerge && undoError !== null && (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-4 space-y-3">
            <p className="text-sm font-medium text-orange-900">Desfazer merge</p>
            <div className="space-y-1.5">
              <label htmlFor="undo-reason" className="block text-sm font-medium text-muted-foreground">
                Motivo *
              </label>
              <input
                id="undo-reason"
                type="text"
                value={undoReason}
                onChange={(e) => setUndoReason(e.target.value)}
                placeholder="Ex.: merge erroneo"
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-describedby={undoError ? 'undo-error' : undefined}
              />
            </div>
            {undoError && (
              <p id="undo-error" role="alert" className="text-sm text-red-600">
                {undoError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={isUndoPending}
                aria-busy={isUndoPending}
                className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isUndoPending ? 'Desfazendo...' : 'Confirmar desfazer'}
              </button>
              <button
                type="button"
                onClick={() => setUndoError(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const primaryPhone = (phones: ContactForMerge['phones']) =>
    phones.find((p) => p.status === 'primary')?.e164 ?? phones[0]?.e164 ?? null

  const primaryEmail = (emails: ContactForMerge['emails']) =>
    emails.find((e) => e.status === 'primary')?.email ?? emails[0]?.email ?? null

  return (
    <div className="space-y-6">
      {/* Diff */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Passo 2 — Comparar e confirmar</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Comparacao dos contatos">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-32">
                  Campo
                </th>
                <th scope="col" className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Principal
                </th>
                <th scope="col" className="py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Secundario
                </th>
              </tr>
            </thead>
            <tbody>
              <DiffRow
                label="ID"
                principalValue={<code className="font-mono text-xs break-all">{principal.id}</code>}
                secondaryValue={<code className="font-mono text-xs break-all">{secondary.id}</code>}
              />
              <DiffRow
                label="Nome"
                principalValue={<span className="font-medium">{principal.fullName}</span>}
                secondaryValue={secondary.fullName}
              />
              <DiffRow
                label="CPF"
                principalValue={
                  principal.cpf
                    ? <span className="font-mono">{formatCpf(principal.cpf)}</span>
                    : DASH
                }
                secondaryValue={
                  secondary.cpf
                    ? <span className="font-mono">{formatCpf(secondary.cpf)}</span>
                    : DASH
                }
              />
              <DiffRow
                label="Classificacao"
                principalValue={CLASSIFICATION_LABELS[principal.classification] ?? principal.classification}
                secondaryValue={CLASSIFICATION_LABELS[secondary.classification] ?? secondary.classification}
              />
              <DiffRow
                label="Status"
                principalValue={STATUS_LABELS[principal.status] ?? principal.status}
                secondaryValue={STATUS_LABELS[secondary.status] ?? secondary.status}
              />
              <DiffRow
                label="Telefone (P)"
                principalValue={primaryPhone(principal.phones) ?? DASH}
                secondaryValue={primaryPhone(secondary.phones) ?? DASH}
              />
              <DiffRow
                label="E-mail (P)"
                principalValue={primaryEmail(principal.emails) ?? DASH}
                secondaryValue={primaryEmail(secondary.emails) ?? DASH}
              />
              {/* Telefones adicionais */}
              {principal.phones.length > 1 || secondary.phones.length > 1 ? (
                <DiffRow
                  label="Outros tel."
                  principalValue={
                    principal.phones
                      .filter((p) => p.status !== 'primary')
                      .map((p) => p.e164)
                      .join(', ') || DASH
                  }
                  secondaryValue={
                    secondary.phones
                      .filter((p) => p.status !== 'primary')
                      .map((p) => p.e164)
                      .join(', ') || DASH
                  }
                />
              ) : null}
              {/* E-mails adicionais */}
              {principal.emails.length > 1 || secondary.emails.length > 1 ? (
                <DiffRow
                  label="Outros e-mails"
                  principalValue={
                    principal.emails
                      .filter((e) => e.status !== 'primary')
                      .map((e) => e.email)
                      .join(', ') || DASH
                  }
                  secondaryValue={
                    secondary.emails
                      .filter((e) => e.status !== 'primary')
                      .map((e) => e.email)
                      .join(', ') || DASH
                  }
                />
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Apos o merge, o contato secundario passara a apontar para o principal. Historico e
          preservado — nenhum dado e destruido (BR-MERGE).
        </p>
      </div>

      {/* Formulario de confirmacao */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="merge-reason" className="block text-sm font-medium text-muted-foreground">
            Motivo do merge <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input
            id="merge-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: duplicidade detectada na importacao de 2025-04"
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby={error ? 'merge-error' : undefined}
            aria-required="true"
          />
          {error && (
            <p id="merge-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            aria-busy={isPending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Processando...' : 'Confirmar merge'}
          </button>

          <a
            href="/contacts/merge"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancelar
          </a>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function MergeWizard({
  principal,
  secondary,
  initialPrincipalId,
  initialSecondaryId,
  canUnmerge,
}: MergeWizardProps) {
  const isStep2 = principal !== null && secondary !== null

  if (isStep2) {
    return (
      <Step2
        principal={principal}
        secondary={secondary}
        canUnmerge={canUnmerge}
      />
    )
  }

  // Se um dos IDs foi fornecido mas o contato nao foi encontrado, exibir aviso
  const hasIds = initialPrincipalId !== '' || initialSecondaryId !== ''
  const missingContacts = hasIds && (principal === null || secondary === null)

  return (
    <div className="space-y-4">
      {missingContacts && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Um ou ambos os contatos informados nao foram encontrados. Verifique os UUIDs e tente
          novamente.
        </div>
      )}
      <Step1
        initialPrincipalId={initialPrincipalId}
        initialSecondaryId={initialSecondaryId}
      />
    </div>
  )
}

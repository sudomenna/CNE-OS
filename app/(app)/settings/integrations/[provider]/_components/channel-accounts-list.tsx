'use client'

/**
 * MOD-CHANNEL / T-15-05 — ChannelAccountsList
 *
 * Client Component: lista channel_accounts de um provider de canal (whatsapp, instagram).
 * Permite editar credenciais (write-only), testar conexão e desativar/ativar contas.
 *
 * ADR-18: campos de credencial nunca exibem valor; usuário só vê encryptedAt.
 * Acessibilidade AA: labels, aria-required, foco visível, mensagens de erro inline.
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  updateChannelAccountAction,
  testConnectionAction,
} from '../actions'
import type { ChannelAccountListItem } from '@/lib/domain/channel'
import type { CredentialField } from './provider-config-form'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChannelAccountsListProps {
  accounts: ChannelAccountListItem[]
  credentialFields: CredentialField[]
  providerDisplayName: string
}

// ---------------------------------------------------------------------------
// EditCredentialsDialog
// ---------------------------------------------------------------------------

function EditCredentialsDialog({
  accountId,
  externalId,
  encryptedAt,
  credentialFields,
  open,
  onClose,
}: {
  accountId: string
  externalId: string
  encryptedAt: string | null
  credentialFields: CredentialField[]
  open: boolean
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(credentialFields.map((f) => [f.key, ''])),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    credentialFields.forEach((f) => {
      if (f.required && !fieldValues[f.key]) {
        newErrors[f.key] = `${f.label} é obrigatório`
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Apenas campos preenchidos são enviados — write-only
    const credentials: Record<string, string> = {}
    credentialFields.forEach((f) => {
      const val = fieldValues[f.key]
      if (val) {
        credentials[f.key] = val
      }
    })

    if (Object.keys(credentials).length === 0) {
      setErrors({ _form: 'Informe ao menos um campo de credencial para salvar.' })
      return
    }

    startTransition(async () => {
      const result = await updateChannelAccountAction({ id: accountId, credentials })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success('Credenciais atualizadas com sucesso.')
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar credenciais</DialogTitle>
          <DialogDescription>
            Conta: <strong>{externalId}</strong>
            {encryptedAt && (
              <span className="block text-xs mt-1 text-muted-foreground">
                Última atualização:{' '}
                {new Date(encryptedAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form id="edit-credentials-form" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 py-2">
            {errors._form && (
              <p role="alert" className="text-sm text-destructive">
                {errors._form}
              </p>
            )}

            {credentialFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`edit-${field.key}`}>
                  {field.label}
                  {field.required && (
                    <span aria-label="obrigatório" className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Input
                  id={`edit-${field.key}`}
                  type="password"
                  autoComplete="off"
                  placeholder={`Deixe em branco para manter o valor atual`}
                  aria-required={field.required}
                  aria-invalid={!!errors[field.key]}
                  aria-describedby={errors[field.key] ? `edit-${field.key}-err` : undefined}
                  value={fieldValues[field.key] ?? ''}
                  onChange={(e) => {
                    setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    setErrors((prev) => {
                      const next = { ...prev }
                      delete next[field.key]
                      return next
                    })
                  }}
                />
                {errors[field.key] && (
                  <p id={`edit-${field.key}-err`} role="alert" className="text-xs text-destructive">
                    {errors[field.key]}
                  </p>
                )}
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              Campos de token são write-only: o valor atual nunca é exibido.
              Informe apenas os campos que deseja alterar.
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-credentials-form" disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar credenciais'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// ChannelAccountRow
// ---------------------------------------------------------------------------

function ChannelAccountRow({
  account,
  credentialFields,
}: {
  account: ChannelAccountListItem
  credentialFields: CredentialField[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggleActive() {
    startTransition(async () => {
      const result = await updateChannelAccountAction({
        id: account.id,
        isActive: !account.isActive,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(
        account.isActive ? 'Conta desativada.' : 'Conta ativada.',
      )
    })
  }

  function handleTestConnection() {
    startTransition(async () => {
      const result = await testConnectionAction({ id: account.id })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      if (result.data.ok) {
        toast.success(result.data.message)
      } else {
        toast.error(result.data.message)
      }
    })
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-sm">{account.externalId}</TableCell>
        <TableCell>
          {account.channelKind}
        </TableCell>
        <TableCell>
          <Badge variant={account.isActive ? 'default' : 'secondary'}>
            {account.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {account.encryptedAt
            ? new Date(account.encryptedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
            : '—'}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          —
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={isPending}
              aria-label={`Editar credenciais da conta ${account.externalId}`}
            >
              Editar credenciais
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestConnection}
              disabled={isPending}
              aria-label={`Testar conexão da conta ${account.externalId}`}
            >
              Testar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleActive}
              disabled={isPending}
              aria-label={
                account.isActive
                  ? `Desativar conta ${account.externalId}`
                  : `Ativar conta ${account.externalId}`
              }
            >
              {account.isActive ? 'Desativar' : 'Ativar'}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <EditCredentialsDialog
        accountId={account.id}
        externalId={account.externalId}
        encryptedAt={account.encryptedAt}
        credentialFields={credentialFields}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// ChannelAccountsList
// ---------------------------------------------------------------------------

export function ChannelAccountsList({
  accounts,
  credentialFields,
  providerDisplayName,
}: ChannelAccountsListProps) {
  if (accounts.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-8 text-center text-muted-foreground"
        role="status"
        aria-label={`Nenhuma conta configurada para ${providerDisplayName}`}
      >
        <p className="text-sm">Nenhuma conta configurada.</p>
        <p className="text-xs mt-1">
          Use o formulário abaixo para adicionar uma conta.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID externo</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Credenciais atualizadas</TableHead>
            <TableHead>Último uso</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <ChannelAccountRow
              key={account.id}
              account={account}
              credentialFields={credentialFields}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

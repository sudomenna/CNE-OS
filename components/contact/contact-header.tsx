'use client'

/**
 * ContactHeader — Client Component (T-12-16)
 *
 * Header rico do contato com:
 * - Avatar com iniciais
 * - Badge de classification com cores distintas
 * - Chips de marcas associadas
 * - CPF mascarado com botão copiar
 * - Email e telefone primários com botão copiar
 * - Tags com adição inline e remoção
 * - Menu ... (DropdownMenu) com ações RBAC
 *
 * Spec: docs/70-ux/03-screen-contact-detail.md §2
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { Copy, Check, MoreHorizontal, Edit, Merge, ShieldOff, LifeBuoy, MessageSquare, X, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { addTagAction, removeTagAction, blacklistContactAction } from '@/app/(app)/contacts/[id]/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactHeaderProps {
  contactId: string
  name: string
  classification: 'lead' | 'customer' | 'student' | 'paid_lead'
  cpf: string | null
  emails: string[]
  phones: string[]
  tags: string[]
  brandNames: string[]
  currentUserRole: string
}

// ---------------------------------------------------------------------------
// Helpers: classification badge
// ---------------------------------------------------------------------------

const CLASSIFICATION_LABELS: Record<ContactHeaderProps['classification'], string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  paid_lead: 'Lead Pago',
}

const CLASSIFICATION_CLASS: Record<ContactHeaderProps['classification'], string> = {
  lead: 'border-transparent bg-muted text-muted-foreground',
  customer: 'border-transparent bg-sky-100 text-sky-700',
  student: 'border-transparent bg-emerald-100 text-emerald-700',
  paid_lead: 'border-transparent bg-amber-100 text-amber-700',
}

// ---------------------------------------------------------------------------
// Helpers: CPF masking — mostra apenas últimos 6 dígitos (xxx.xxx.789-10)
// ---------------------------------------------------------------------------

function maskCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf
  // Formato: •••.•••.xxx-xx (últimos 6 dígitos visíveis)
  return `•••.•••.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

function formatCpfFull(cpf: string): string {
  if (cpf.length !== 11) return cpf
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

// ---------------------------------------------------------------------------
// Helper: Iniciais do nome (2 letras)
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

// ---------------------------------------------------------------------------
// CopyButton — botão ícone que copia texto para clipboard
// ---------------------------------------------------------------------------

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copiado!' : label}
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// TagList — gerenciamento de tags (adicionar/remover)
// ---------------------------------------------------------------------------

interface TagListProps {
  contactId: string
  initialTags: string[]
}

function TagList({ contactId, initialTags }: TagListProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAddStart() {
    setAdding(true)
    setNewTag('')
  }

  function handleAddCancel() {
    setAdding(false)
    setNewTag('')
  }

  function handleAddSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const tag = newTag.toLowerCase().trim().replace(/\s+/g, '-')
    if (!tag || tags.includes(tag)) {
      setAdding(false)
      setNewTag('')
      return
    }
    startTransition(async () => {
      const result = await addTagAction({ contactId, tag })
      if (result.ok) {
        setTags((prev) => [...prev, tag])
      }
      setAdding(false)
      setNewTag('')
    })
  }

  function handleRemove(tag: string) {
    startTransition(async () => {
      const result = await removeTagAction({ contactId, tag })
      if (result.ok) {
        setTags((prev) => prev.filter((t) => t !== tag))
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Tags do contato">
      {tags.map((tag) => (
        <span
          key={tag}
          className="group inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => handleRemove(tag)}
            disabled={isPending}
            aria-label={`Remover tag ${tag}`}
            className="ml-0.5 h-3.5 w-3.5 rounded-full text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors opacity-0 group-hover:opacity-100"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      {adding ? (
        <form onSubmit={handleAddSubmit} className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleAddCancel()
            }}
            placeholder="nova-tag"
            className="h-6 w-28 rounded-full px-2 text-xs"
            disabled={isPending}
            aria-label="Nova tag"
          />
          <button
            type="submit"
            disabled={isPending || !newTag.trim()}
            aria-label="Confirmar tag"
            className="h-5 w-5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleAddCancel}
            aria-label="Cancelar"
            className="h-5 w-5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleAddStart}
          disabled={isPending}
          aria-label="Adicionar tag"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground/60 hover:border-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ContactActionsMenu — DropdownMenu com ações RBAC
// ---------------------------------------------------------------------------

interface ContactActionsMenuProps {
  contactId: string
  currentUserRole: string
}

function ContactActionsMenu({ contactId, currentUserRole }: ContactActionsMenuProps) {
  const [isPending, startTransition] = useTransition()
  const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false)
  const isAdminOrComercial = currentUserRole === 'admin' || currentUserRole === 'comercial'
  const isAdmin = currentUserRole === 'admin'

  function handleCopyId() {
    navigator.clipboard.writeText(contactId)
  }

  function handleBlacklistConfirm() {
    startTransition(async () => {
      await blacklistContactAction({ contactId })
      setBlacklistDialogOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Mais ações do contato"
            disabled={isPending}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* Editar — todos os papéis */}
          <DropdownMenuItem asChild>
            <Link href={`/contacts/${contactId}/edit` as Route}>
              <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
              Editar
            </Link>
          </DropdownMenuItem>

          {/* Mesclar — admin/comercial */}
          {isAdminOrComercial && (
            <DropdownMenuItem asChild>
              <Link href={`/contacts/${contactId}/merge` as Route}>
                <Merge className="mr-2 h-4 w-4" aria-hidden="true" />
                Mesclar contato
              </Link>
            </DropdownMenuItem>
          )}

          {/* Abrir ticket — todos */}
          <DropdownMenuItem asChild>
            <Link href={`/tickets/new?contact=${contactId}` as Route}>
              <LifeBuoy className="mr-2 h-4 w-4" aria-hidden="true" />
              Abrir ticket
            </Link>
          </DropdownMenuItem>

          {/* Nova mensagem — todos */}
          <DropdownMenuItem asChild>
            <Link href={`/inbox/new?contact=${contactId}` as Route}>
              <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
              Nova mensagem
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Copiar ID — todos */}
          <DropdownMenuItem onClick={handleCopyId}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar ID do contato
          </DropdownMenuItem>

          {/* Blacklist — admin apenas */}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setBlacklistDialogOpen(true)}
                className="text-destructive focus:text-destructive"
                disabled={isPending}
              >
                <ShieldOff className="mr-2 h-4 w-4" aria-hidden="true" />
                Adicionar à blacklist
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmação textual — ação destrutiva irreversível */}
      <ConfirmActionDialog
        open={blacklistDialogOpen}
        onOpenChange={setBlacklistDialogOpen}
        title="Adicionar à blacklist?"
        description="Este contato será bloqueado e não receberá mais comunicações. Transações e histórico são preservados, mas novos fluxos automáticos serão impedidos. Esta ação não pode ser desfeita sem intervenção manual."
        requiredText="CONFIRMAR"
        confirmLabel="Adicionar à blacklist"
        onConfirm={handleBlacklistConfirm}
        isPending={isPending}
        variant="destructive"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// ContactHeader — componente principal
// ---------------------------------------------------------------------------

export function ContactHeader({
  contactId,
  name,
  classification,
  cpf,
  emails,
  phones,
  tags,
  brandNames,
  currentUserRole,
}: ContactHeaderProps) {
  const initials = getInitials(name)
  const classLabel = CLASSIFICATION_LABELS[classification]
  const classClass = CLASSIFICATION_CLASS[classification]

  const primaryPhone = phones[0] ?? null
  const primaryEmail = emails[0] ?? null

  return (
    <header
      role="banner"
      className="rounded-lg border border-border bg-card p-6 space-y-4"
    >
      {/* Top row: avatar + info + menu */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xl font-semibold select-none"
          aria-hidden="true"
        >
          {initials}
        </div>

        {/* Name + classification + brands */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground leading-tight">
              {name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classClass}`}
              aria-label={`Classificacao: ${classLabel}`}
            >
              {classLabel}
            </span>
          </div>

          {/* Brand chips */}
          {brandNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Marcas associadas">
              {brandNames.map((brand) => (
                <Badge key={brand} variant="outline" className="text-xs">
                  {brand}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Menu ações */}
        <div className="shrink-0">
          <ContactActionsMenu
            contactId={contactId}
            currentUserRole={currentUserRole}
          />
        </div>
      </div>

      {/* Contact info: CPF, phone, email */}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {/* CPF mascarado */}
        <div className="flex items-center gap-0.5">
          <dt className="font-medium shrink-0">CPF:</dt>
          <dd className="font-mono">
            {cpf ? (
              <>
                <span aria-label={`CPF terminado em ${cpf.slice(9)}`}>
                  {maskCpf(cpf)}
                </span>
                <CopyButton value={formatCpfFull(cpf)} label="Copiar CPF" />
              </>
            ) : (
              <span className="text-muted-foreground/40 italic">Não informado</span>
            )}
          </dd>
        </div>

        {/* Telefone primário */}
        {primaryPhone && (
          <div className="flex items-center gap-0.5">
            <dt className="font-medium shrink-0">Telefone:</dt>
            <dd>
              {primaryPhone}
              <CopyButton value={primaryPhone} label="Copiar telefone" />
            </dd>
          </div>
        )}

        {/* E-mail primário */}
        {primaryEmail && (
          <div className="flex items-center gap-0.5">
            <dt className="font-medium shrink-0">E-mail:</dt>
            <dd>
              {primaryEmail}
              <CopyButton value={primaryEmail} label="Copiar e-mail" />
            </dd>
          </div>
        )}
      </dl>

      {/* Tags */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Tags:</span>
        <TagList contactId={contactId} initialTags={tags} />
      </div>
    </header>
  )
}

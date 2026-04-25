import type { Contact, ContactPhone, ContactEmail, ContactTag } from '@/lib/db/schema/contact'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactHeaderProps {
  contact: Contact
  phones: ContactPhone[]
  emails: ContactEmail[]
  tags: ContactTag[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ContactClassification = Contact['classification']
type ContactStatus = Contact['status']

const CLASSIFICATION_LABELS: Record<ContactClassification, string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  paid_lead: 'Lead Pago',
}

const CLASSIFICATION_CLASS: Record<ContactClassification, string> = {
  lead: 'border-transparent bg-muted text-muted-foreground',
  customer: 'border-transparent bg-sky-50 text-sky-700',
  student: 'border-transparent bg-emerald-50 text-emerald-700',
  paid_lead: 'border-transparent bg-amber-50 text-amber-700',
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  invalid: 'Invalido',
  blocked: 'Bloqueado',
}

const STATUS_CLASS: Record<ContactStatus, string> = {
  active: 'border-transparent bg-emerald-50 text-emerald-700',
  blocked: 'border-transparent bg-red-50 text-red-700',
  inactive: 'border-transparent bg-muted text-muted-foreground',
  invalid: 'border-transparent bg-orange-50 text-orange-700',
}

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactHeader({ contact, phones, emails, tags }: ContactHeaderProps) {
  const primaryPhone = phones.find((p) => p.status === 'primary') ?? phones[0]
  const primaryEmail = emails.find((e) => e.status === 'primary') ?? emails[0]

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      {/* Name + badges */}
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="text-2xl font-bold text-foreground mr-2">{contact.fullName}</h1>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CLASSIFICATION_CLASS[contact.classification]}`}
          aria-label={`Classificacao: ${CLASSIFICATION_LABELS[contact.classification]}`}
        >
          {CLASSIFICATION_LABELS[contact.classification]}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[contact.status]}`}
          aria-label={`Status: ${STATUS_LABELS[contact.status]}`}
        >
          {STATUS_LABELS[contact.status]}
        </span>
      </div>

      {/* Meta row */}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {contact.cpf && (
          <div className="flex gap-1">
            <dt className="font-medium text-muted-foreground">CPF:</dt>
            <dd className="font-mono">{formatCpf(contact.cpf)}</dd>
          </div>
        )}
        {contact.origin && (
          <div className="flex gap-1">
            <dt className="font-medium text-muted-foreground">Origem:</dt>
            <dd>{contact.origin}</dd>
          </div>
        )}
        <div className="flex gap-1">
          <dt className="font-medium text-muted-foreground">Criado em:</dt>
          <dd>{formatDate(contact.createdAt)}</dd>
        </div>
      </dl>

      {/* Phones & Emails */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {primaryPhone && (
          <div className="flex gap-1">
            <span className="font-medium text-muted-foreground">Telefone:</span>
            <span>{primaryPhone.e164}</span>
            {phones.length > 1 && (
              <span className="text-muted-foreground/60 text-xs">(+{phones.length - 1})</span>
            )}
          </div>
        )}
        {primaryEmail && (
          <div className="flex gap-1">
            <span className="font-medium text-muted-foreground">E-mail:</span>
            <span>{primaryEmail.email}</span>
            {emails.length > 1 && (
              <span className="text-muted-foreground/60 text-xs">(+{emails.length - 1})</span>
            )}
          </div>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Tags do contato">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

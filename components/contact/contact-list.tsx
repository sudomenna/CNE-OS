import Link from 'next/link'
import type { Route } from 'next'

type ContactClassification = 'lead' | 'customer' | 'student' | 'paid_lead'
type ContactStatus = 'active' | 'inactive' | 'invalid' | 'blocked'

export interface ContactRow {
  id: string
  fullName: string
  cpf: string | null
  status: ContactStatus
  classification: ContactClassification
  origin: string | null
  createdAt: Date
}

const CLASSIFICATION_LABELS: Record<ContactClassification, string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  paid_lead: 'Lead Pago',
}

const CLASSIFICATION_BADGE: Record<ContactClassification, string> = {
  lead: 'bg-muted text-muted-foreground',
  customer: 'bg-sky-50 text-sky-700',
  student: 'bg-emerald-50 text-emerald-700',
  paid_lead: 'bg-amber-50 text-amber-700',
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  invalid: 'Invalido',
  blocked: 'Bloqueado',
}

interface ContactListProps {
  contacts: ContactRow[]
}

export function ContactList({ contacts }: ContactListProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm" aria-label="Lista de contatos">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
              Nome
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
              CPF
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
              Classificacao
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
              Criado em
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground sr-only">
              Acoes
            </th>
          </tr>
        </thead>
        <tbody>
          {contacts.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                Nenhum contato encontrado.
              </td>
            </tr>
          ) : (
            contacts.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-foreground">{c.fullName}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {c.cpf ? formatCpf(c.cpf) : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_BADGE[c.classification]}`}
                  >
                    {CLASSIFICATION_LABELS[c.classification]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{STATUS_LABELS[c.status]}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/contacts/${c.id}` as Route}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    Ver
                    <span className="sr-only"> contato {c.fullName}</span>
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

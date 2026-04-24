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
  lead: 'bg-slate-100 text-slate-700',
  customer: 'bg-blue-100 text-blue-700',
  student: 'bg-green-100 text-green-700',
  paid_lead: 'bg-yellow-100 text-yellow-700',
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
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm" aria-label="Lista de contatos">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Nome
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              CPF
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Classificacao
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Criado em
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600 sr-only">
              Acoes
            </th>
          </tr>
        </thead>
        <tbody>
          {contacts.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                Nenhum contato encontrado.
              </td>
            </tr>
          ) : (
            contacts.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-900">{c.fullName}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {c.cpf ? formatCpf(c.cpf) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_BADGE[c.classification]}`}
                  >
                    {CLASSIFICATION_LABELS[c.classification]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{STATUS_LABELS[c.status]}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/contacts/${c.id}` as Route}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
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

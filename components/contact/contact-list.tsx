'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { MessageCircle } from 'lucide-react'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { CONTACT_COLUMNS, CONTACTS_LIST_TABLE_ID } from './contact-columns'

type ContactClassification = 'lead' | 'customer' | 'student' | 'mentorado'
type ContactStatus = 'active' | 'inactive' | 'invalid' | 'blocked'

export interface ContactRow {
  id: string
  fullName: string
  status: ContactStatus
  classification: ContactClassification
  email: string | null
  phone: { e164: string; isWhatsapp: boolean } | null
  cpf: string | null
  createdAt: Date
}

const CLASSIFICATION_LABELS: Record<ContactClassification, string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  mentorado: 'Mentorado',
}

const CLASSIFICATION_BADGE: Record<ContactClassification, string> = {
  lead: 'bg-muted text-muted-foreground',
  customer: 'bg-sky-50 text-sky-700',
  student: 'bg-emerald-50 text-emerald-700',
  mentorado: 'bg-violet-50 text-violet-700',
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  invalid: 'Invalido',
  blocked: 'Bloqueado',
}

interface ContactListProps {
  contacts: ContactRow[]
  userId: string
}

export function ContactList({ contacts, userId }: ContactListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: CONTACTS_LIST_TABLE_ID,
    userId,
    columns: CONTACT_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={CONTACTS_LIST_TABLE_ID}
          userId={userId}
          columns={CONTACT_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de contatos">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* name — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Nome
              </th>
              {isVisible('email') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  E-mail
                </th>
              )}
              {isVisible('phone') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Telefone
                </th>
              )}
              {isVisible('classification') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Classificação
                </th>
              )}
              {isVisible('status') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
              )}
              {isVisible('cpf') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  CPF
                </th>
              )}
              {isVisible('createdAt') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Criado em
                </th>
              )}
              {/* actions — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Nenhum contato encontrado.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">{c.fullName}</td>
                  {isVisible('email') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.email ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                  )}
                  {isVisible('phone') && (
                    <td className="px-4 py-3">
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          {c.phone.e164}
                          {c.phone.isWhatsapp && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                              aria-label="Telefone confirmado no WhatsApp"
                            >
                              <MessageCircle className="h-2.5 w-2.5" aria-hidden="true" />
                              WhatsApp
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('classification') && (
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_BADGE[c.classification]}`}
                      >
                        {CLASSIFICATION_LABELS[c.classification]}
                      </span>
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="px-4 py-3 text-muted-foreground">{STATUS_LABELS[c.status]}</td>
                  )}
                  {isVisible('cpf') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.cpf ? (
                        // Formata como XXX.XXX.XXX-XX para exibição
                        `${c.cpf.slice(0, 3)}.${c.cpf.slice(3, 6)}.${c.cpf.slice(6, 9)}-${c.cpf.slice(9)}`
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      }).format(c.createdAt)}
                    </td>
                  )}
                  {/* actions — alwaysVisible */}
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
    </div>
  )
}

/**
 * /contacts/merge — wizard de merge de contatos (T-1-17)
 *
 * Passo 1 (sem searchParams): formulário de seleção de UUIDs
 * Passo 2 (com ?principal=<id>&secondary=<id>): diff antes/depois + confirmação
 *
 * UI nunca muta estado — toda mutação vai pelo MergeWizard que chama mergeContactsAction.
 */
import { db } from '@/lib/db/client'
import { contact, contactPhone, contactEmail } from '@/lib/db/schema/contact'
import { eq } from 'drizzle-orm'
import { MergeWizard } from '@/components/merge/merge-wizard'
import { requireSession } from '@/lib/auth/session'

export const metadata = {
  title: 'Merge de contatos — CNE-OS',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export type ContactForMerge = {
  id: string
  fullName: string
  cpf: string | null
  status: 'active' | 'inactive' | 'invalid' | 'blocked'
  classification: 'lead' | 'customer' | 'student' | 'paid_lead'
  phones: Array<{ e164: string; status: string }>
  emails: Array<{ email: string; status: string }>
}

async function fetchContactForMerge(id: string): Promise<ContactForMerge | null> {
  const [rows, phones, emails] = await Promise.all([
    db
      .select({
        id: contact.id,
        fullName: contact.fullName,
        cpf: contact.cpf,
        status: contact.status,
        classification: contact.classification,
      })
      .from(contact)
      .where(eq(contact.id, id))
      .limit(1),

    db
      .select({ e164: contactPhone.e164, status: contactPhone.status })
      .from(contactPhone)
      .where(eq(contactPhone.contactId, id)),

    db
      .select({ email: contactEmail.email, status: contactEmail.status })
      .from(contactEmail)
      .where(eq(contactEmail.contactId, id)),
  ])

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    fullName: row.fullName,
    cpf: row.cpf ?? null,
    status: row.status,
    classification: row.classification,
    phones,
    emails,
  }
}

export default async function MergePage({ searchParams }: PageProps) {
  const params = await searchParams
  const principalId = typeof params['principal'] === 'string' ? params['principal'] : undefined
  const secondaryId = typeof params['secondary'] === 'string' ? params['secondary'] : undefined

  // Sessão obrigatoria — requireSession lanca se nao autenticado
  const ctx = await requireSession()
  const canUnmerge = ctx.user.role === 'admin' || ctx.user.role === 'financial'

  let principal: ContactForMerge | null = null
  let secondary: ContactForMerge | null = null

  if (principalId && secondaryId) {
    ;[principal, secondary] = await Promise.all([
      fetchContactForMerge(principalId),
      fetchContactForMerge(secondaryId),
    ])
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Merge de contatos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Unifique dois registros duplicados preservando o historico do secundario.
        </p>
      </div>

      <MergeWizard
        principal={principal}
        secondary={secondary}
        initialPrincipalId={principalId ?? ''}
        initialSecondaryId={secondaryId ?? ''}
        canUnmerge={canUnmerge}
      />
    </div>
  )
}

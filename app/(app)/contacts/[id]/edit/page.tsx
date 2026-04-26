/**
 * /contacts/[id]/edit — edição completa de contato
 * Server Component: carrega contato + relacionamentos + endereço primário, passa para form client.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  contact,
  contactPhone,
  contactEmail,
  contactTag,
} from '@/lib/db/schema/contact'
import { requireSession } from '@/lib/auth/session'
import { getPrimaryAddress } from '@/lib/domain/contact/address'
import { ContactEditForm } from '@/components/contact/contact-edit-form'

export const metadata = {
  title: 'Editar contato — CNE-OS',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ContactEditPage({ params }: PageProps) {
  const { id } = await params
  await requireSession()

  const [row] = await db.select().from(contact).where(eq(contact.id, id)).limit(1)
  if (!row) notFound()

  const [phones, emails, tagRows, address] = await Promise.all([
    db.select().from(contactPhone).where(eq(contactPhone.contactId, id)),
    db.select().from(contactEmail).where(eq(contactEmail.contactId, id)),
    db.select().from(contactTag).where(eq(contactTag.contactId, id)),
    getPrimaryAddress(id, 'home'),
  ])

  const primaryPhone = phones.find((p) => p.status === 'primary') ?? phones[0] ?? null
  const primaryEmail = emails.find((e) => e.status === 'primary') ?? emails[0] ?? null

  const defaults = {
    fullName: row.fullName,
    cpf: row.cpf,
    classification: row.classification as 'lead' | 'customer' | 'student' | 'mentorado',
    status: row.status as 'active' | 'inactive' | 'invalid' | 'blocked',
    origin: row.origin,
    notesSummary: row.notesSummary,
    birthDate: row.birthDate,
    primaryPhone: primaryPhone
      ? { e164: primaryPhone.e164, isWhatsapp: primaryPhone.whatsappCheckedAt !== null }
      : null,
    primaryEmail: primaryEmail?.email ?? null,
    tags: tagRows.map((t) => t.tag),
    address: address
      ? {
          street: address.street,
          number: address.number,
          complement: address.complement,
          district: address.district,
          city: address.city,
          state: address.state,
          zip: address.zip,
          country: address.country,
        }
      : null,
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Navegação de retorno">
        <Link
          href={`/contacts/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <span aria-hidden="true">&larr;</span> Voltar para o contato
        </Link>
      </nav>

      <header>
        <h1 className="text-2xl font-bold text-foreground">Editar contato</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {row.fullName}
        </p>
      </header>

      <ContactEditForm contactId={id} defaults={defaults} />
    </div>
  )
}

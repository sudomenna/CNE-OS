import Link from 'next/link'
import type { Route } from 'next'
import { isNull } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { ContactForm } from '@/components/contact/contact-form'

export const metadata = {
  title: 'Novo Contato — CNE-OS',
}

export default async function NewContactPage() {
  const brands = await db
    .select({ id: brand.id, name: brand.name })
    .from(brand)
    .where(isNull(brand.deletedAt))
    .orderBy(brand.name)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação estrutural" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href={'/contacts' as Route}
          className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Contatos
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium" aria-current="page">
          Novo
        </span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Novo Contato</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preencha os dados abaixo para cadastrar um novo contato.
        </p>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Form */}
      <ContactForm brands={brands} />
    </div>
  )
}

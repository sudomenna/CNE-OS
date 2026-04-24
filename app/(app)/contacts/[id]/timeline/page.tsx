import { redirect } from 'next/navigation'

/**
 * /contacts/[id]/timeline — redireciona para /contacts/[id] (aba Timeline e aba padrao).
 */

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ContactTimelinePage({ params }: PageProps) {
  const { id } = await params
  redirect(`/contacts/${id}`)
}

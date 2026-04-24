/**
 * InboxPage — /inbox — layout 3 colunas com realtime Supabase.
 *
 * Server Component principal da inbox.
 * Layout: ConversationList (1/4) | ThreadPane (2/4) | ContactPane (1/4)
 *
 * docs/20-domain/05-conversation-inbox.md
 * docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-11)
 */

import { Suspense } from 'react'
import { requireSession } from '@/lib/auth/session'
import { ConversationList } from '@/components/inbox/conversation-list'
import { ThreadPane } from '@/components/inbox/thread-pane'
import { ContactPane } from '@/components/inbox/contact-pane'
import { RealtimeProvider } from '@/components/inbox/realtime-provider'

export const metadata = {
  title: 'Inbox — CNE-OS',
}

// Não cachear — página tem dados realtime
export const dynamic = 'force-dynamic'

interface InboxPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams
  const conversationId =
    typeof params['conversation'] === 'string' ? params['conversation'] : undefined

  // Carregar userId para o RealtimeProvider filtrar pelo usuário logado
  let userId: string | undefined
  try {
    const ctx = await requireSession()
    userId = ctx.user.id
  } catch {
    // Não bloqueia renderização — RealtimeProvider degrada graciosamente
  }

  return (
    <RealtimeProvider userId={userId}>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden border border-slate-200 rounded-lg bg-white">
        {/* Coluna esquerda: lista de conversas (1/4) */}
        <aside
          className="w-1/4 min-w-56 border-r border-slate-200 flex flex-col overflow-hidden"
          aria-label="Conversas"
        >
          <div className="border-b border-slate-200 px-4 py-3 flex-shrink-0">
            <h1 className="text-sm font-semibold text-slate-900">Inbox</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Suspense
              fallback={
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex gap-3">
                      <div className="h-9 w-9 rounded-full bg-slate-200 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-slate-200 rounded w-3/4" />
                        <div className="h-2 bg-slate-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              }
            >
              <ConversationList selectedId={conversationId} />
            </Suspense>
          </div>
        </aside>

        {/* Coluna central: thread de mensagens (2/4) */}
        <main
          className="flex-1 flex flex-col overflow-hidden"
          aria-label="Thread de mensagens"
        >
          <Suspense
            fallback={
              <div className="flex-1 p-4 space-y-4 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className="h-10 w-2/3 bg-slate-200 rounded-2xl" />
                  </div>
                ))}
              </div>
            }
          >
            <ThreadPane conversationId={conversationId} />
          </Suspense>
        </main>

        {/* Coluna direita: dados do contato (1/4) */}
        <aside
          className="w-1/4 min-w-56 border-l border-slate-200 overflow-y-auto"
          aria-label="Dados do contato"
        >
          <Suspense
            fallback={
              <div className="p-4 space-y-4 animate-pulse">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-14 w-14 rounded-full bg-slate-200" />
                  <div className="h-3 w-24 bg-slate-200 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-2 bg-slate-100 rounded w-full" />
                  <div className="h-2 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
            }
          >
            <ContactPane conversationId={conversationId} />
          </Suspense>
        </aside>
      </div>
    </RealtimeProvider>
  )
}

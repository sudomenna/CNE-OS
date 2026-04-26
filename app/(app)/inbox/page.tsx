/**
 * InboxPage — /inbox — layout 3 colunas resizable com realtime Supabase.
 *
 * Server Component principal da inbox.
 * Layout: ResizablePanelGroup com 3 painéis (proporção default 25 / 50 / 25).
 *
 * Filtros inline (canal, responsável, status) e tabs (Todas / Minhas /
 * Não-atribuídas) são mantidos na URL via searchParams e processados no
 * servidor para filtrar a ConversationList sem reload de página.
 *
 * docs/70-ux/04-screen-inbox.md
 * T-13-15: painel resizable + filtros inline + tabs de conversa
 */

import { Suspense } from 'react'
import { requireSession } from '@/lib/auth/session'
import { ConversationList } from '@/components/inbox/conversation-list'
import { ThreadPane } from '@/components/inbox/thread-pane'
import { ContactPane } from '@/components/inbox/contact-pane'
import { RealtimeProvider } from '@/components/inbox/realtime-provider'
import { InboxFilters } from '@/components/inbox/inbox-filters'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

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

  const tab =
    typeof params['tab'] === 'string' ? params['tab'] : 'all'

  const channelFilter =
    typeof params['channel'] === 'string' ? params['channel'] : 'all'

  const statusFilter =
    typeof params['status'] === 'string' ? params['status'] : 'all'

  // Carregar userId para filtros "Minhas" e RealtimeProvider
  let userId: string | undefined
  try {
    const ctx = await requireSession()
    userId = ctx.user.id
  } catch {
    // Não bloqueia renderização — degrada graciosamente
  }

  return (
    <RealtimeProvider userId={userId}>
      <div className="h-[calc(100vh-4rem)] overflow-hidden border border-border rounded-lg bg-card">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full"
          aria-label="Painel do inbox"
        >
          {/* Painel 1: Lista de conversas (~25%) */}
          <ResizablePanel
            defaultSize="25%"
            minSize="18%"
            maxSize="40%"
            className="flex flex-col"
          >
            <aside className="flex flex-col h-full overflow-hidden" aria-label="Conversas">
              {/* Cabeçalho */}
              <div className="border-b border-border px-4 py-3 flex-shrink-0">
                <h1 className="text-sm font-semibold text-foreground">Inbox</h1>
              </div>

              {/* Filtros + tabs (Client Component) */}
              <InboxFilters currentUserId={userId ?? ''} />

              {/* Lista de conversas */}
              <div className="flex-1 overflow-y-auto">
                <Suspense
                  fallback={
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="animate-pulse flex gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3 bg-muted rounded w-3/4" />
                            <div className="h-2 bg-muted rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                >
                  <ConversationList
                    selectedId={conversationId}
                    currentUserId={userId}
                    tab={tab}
                    channelFilter={channelFilter}
                    statusFilter={statusFilter}
                  />
                </Suspense>
              </div>
            </aside>
          </ResizablePanel>

          <ResizableHandle withHandle aria-label="Redimensionar painel de conversas" />

          {/* Painel 2: Thread de mensagens (~50%) */}
          <ResizablePanel
            defaultSize="50%"
            minSize="30%"
            className="flex flex-col"
          >
            <main
              className="flex flex-col h-full overflow-hidden"
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
                        <div className="h-10 w-2/3 bg-muted rounded-2xl" />
                      </div>
                    ))}
                  </div>
                }
              >
                <ThreadPane conversationId={conversationId} />
              </Suspense>
            </main>
          </ResizablePanel>

          <ResizableHandle withHandle aria-label="Redimensionar painel do contato" />

          {/* Painel 3: Dados do contato (~25%) */}
          <ResizablePanel
            defaultSize="25%"
            minSize="16%"
            maxSize="40%"
          >
            <aside
              className="h-full overflow-y-auto"
              aria-label="Dados do contato"
            >
              <Suspense
                fallback={
                  <div className="p-4 space-y-4 animate-pulse">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-14 w-14 rounded-full bg-muted" />
                      <div className="h-3 w-24 bg-muted rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 bg-muted rounded w-full" />
                      <div className="h-2 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                }
              >
                <ContactPane conversationId={conversationId} />
              </Suspense>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </RealtimeProvider>
  )
}

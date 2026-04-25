/**
 * InboxPage loading skeleton.
 * Exibido enquanto a page.tsx carrega no App Router.
 */

export default function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden border border-border rounded-lg bg-card animate-pulse">
      {/* Coluna esquerda */}
      <aside className="w-1/4 min-w-56 border-r border-border flex flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="h-3 w-12 bg-muted rounded" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2 bg-muted rounded w-1/2" />
                <div className="h-2 bg-muted rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Coluna central */}
      <main className="flex-1 flex flex-col p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
          >
            <div className="h-10 w-2/3 bg-muted rounded-2xl" />
          </div>
        ))}
      </main>

      {/* Coluna direita */}
      <aside className="w-1/4 min-w-56 border-l border-border p-4 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-full bg-muted" />
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-2 w-16 bg-muted rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-2 bg-muted rounded w-full" />
          <div className="h-2 bg-muted rounded w-3/4" />
          <div className="h-2 bg-muted rounded w-2/3" />
        </div>
        <div className="h-8 bg-muted rounded" />
        <div className="h-8 bg-muted rounded" />
      </aside>
    </div>
  )
}

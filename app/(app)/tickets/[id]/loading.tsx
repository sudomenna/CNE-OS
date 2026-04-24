/**
 * Skeleton loading para /tickets/[id]
 */
export default function TicketDetailLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Carregando ticket">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-32 rounded bg-slate-200" />

      {/* Header card skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex gap-2">
              <div className="h-5 w-12 rounded-full bg-slate-200" />
              <div className="h-5 w-20 rounded-full bg-slate-200" />
              <div className="h-5 w-16 rounded-full bg-slate-200" />
            </div>
            <div className="h-7 w-3/4 rounded bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-100" />
          </div>
          <div className="h-9 w-36 rounded-md bg-slate-200 shrink-0" />
        </div>
        <div className="flex gap-6 border-t border-slate-100 pt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="h-8 w-28 rounded-md bg-slate-200" />
      </div>

      {/* Notes skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
        <div className="h-4 w-24 rounded bg-slate-200" />
        {[1, 2].map((i) => (
          <div key={i} className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
            <div className="h-3 w-32 rounded bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { CommandPalette } from '@/components/layout/command-palette'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session
  try {
    session = await requireSession()
  } catch {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={session.user} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}

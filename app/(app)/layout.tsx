import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/auth/supabase-server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { CommandPalette } from '@/components/layout/command-palette'
import { HotkeysProvider } from '@/components/layout/hotkeys-provider'
import { GlobalBanners } from '@/components/layout/global-banners'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireSession()
  } catch {
    redirect('/login')
  }

  // Buscar metadados do usuário para a topbar (nome, email, avatar)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userName: string =
    (user?.user_metadata?.['full_name'] as string | undefined) ??
    (user?.user_metadata?.['name'] as string | undefined) ??
    (user?.email?.split('@')[0] ?? 'Usuário')

  const userEmail: string = user?.email ?? ''
  const avatarUrl: string | null =
    (user?.user_metadata?.['avatar_url'] as string | undefined) ?? null

  return (
    <HotkeysProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={userName} userEmail={userEmail} avatarUrl={avatarUrl} />
          <GlobalBanners />
          <main className="flex-1 overflow-auto p-6">
            <Breadcrumbs />
            {children}
          </main>
        </div>
        <CommandPalette />
        <Toaster richColors position="bottom-right" />
      </div>
    </HotkeysProvider>
  )
}
